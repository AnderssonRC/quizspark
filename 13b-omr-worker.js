/* ============================================================
 * QuizSpark — LECTOR OMR · Web Worker de OpenCV
 * ------------------------------------------------------------
 * Corre OpenCV.js FUERA del hilo principal para que compilar los ~8 MB
 * de WASM y procesar cada página NO congele la pestaña.
 *
 * NO es un script de Babel — JS plano (se carga con new Worker()).
 * No tiene DOM, no tiene SHEET_SPEC: la geometría llega en cada mensaje
 * (F = { spanX, spanY, size }) y los umbrales también (T).
 *
 * Mensajes que recibe:
 *   { type:"load", urls:[...] }            -> importa OpenCV, responde "ready" / "loaderror"
 *   { type:"detect", id, buffer, width, height, T, F }
 *                                          -> responde { type:"result", id, res }
 * ============================================================ */
var cvReady = false;

self.Module = {
  onRuntimeInitialized: function () {
    cvReady = true;
    self.postMessage({ type: "ready" });
  }
};

self.onmessage = function (e) {
  var msg = e.data || {};

  if (msg.type === "load") {
    var urls = msg.urls && msg.urls.length ? msg.urls : [msg.url];
    var loaded = false, lastErr = "";
    for (var i = 0; i < urls.length && !loaded; i++) {
      try { importScripts(urls[i]); loaded = true; }
      catch (err) { lastErr = String((err && err.message) || err); }
    }
    if (!loaded) { self.postMessage({ type: "loaderror", error: "importScripts falló: " + lastErr }); return; }
    // jsQR para leer el QR (spec 3.5) — best effort, no es fatal si falla.
    if (msg.jsqr) { try { importScripts(msg.jsqr); } catch (e) {} }
    // Algunos builds ya quedan listos apenas termina importScripts.
    if (self.cv && self.cv.Mat && !cvReady) {
      cvReady = true;
      self.postMessage({ type: "ready" });
    }
    return;
  }

  if (msg.type === "detect") {
    if (!cvReady) {
      self.postMessage({ type: "result", id: msg.id, res: { error: "OpenCV no está listo", candidates: [], groups: [], contourCount: 0 } });
      return;
    }
    var res, transfer = [];
    try {
      var imageData = new ImageData(new Uint8ClampedArray(msg.buffer), msg.width, msg.height);
      res = detectFiducialsCv(imageData, msg.T, msg.F);
      // Pasos 3-5: para cada grupo, rectificar + leer QR + leer burbujas.
      res.sheets = [];
      for (var gi = 0; gi < res.groups.length; gi++) {
        var sh = processSheet(imageData, res.groups[gi], msg.T, msg.F, msg.G, msg.nQuestions);
        res.sheets.push(sh);
        if (sh.rectified && sh.rectified.buffer) transfer.push(sh.rectified.buffer);
      }
    } catch (err) {
      res = { error: String((err && err.message) || err), candidates: [], groups: [], contourCount: 0, sheets: [] };
    }
    self.postMessage({ type: "result", id: msg.id, res: res }, transfer);
  }
};

// ------------------------------------------------------------
// Detección de fiduciales (spec 3.2 – 3.3). Devuelve solo datos planos.
// ------------------------------------------------------------
function detectFiducialsCv(imageData, T, F) {
  var cv = self.cv;
  var res = {
    candidates: [], groups: [], contourCount: 0,
    rejects: { size: 0, aspect: 0, fill: 0, solidity: 0, verts: 0, tiny: 0 },
    rawRects: [], darkFrac: 0,
  };
  var src, gray, blur, bin, contours, hierarchy;
  try {
    src = cv.matFromImageData(imageData);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    blur = new cv.Mat();
    cv.GaussianBlur(gray, blur, new cv.Size(T.blur, T.blur), 0, 0, cv.BORDER_DEFAULT);
    bin = new cv.Mat();
    cv.adaptiveThreshold(blur, bin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, T.blockSize, T.C);
    // adaptiveThreshold con un blockSize grande deja HUECO el centro de un
    // cuadrado sólido (su vecindario es todo negro). Un CLOSE lo re-rellena.
    if (T.closeKernel && T.closeKernel > 1) {
      var kern = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(T.closeKernel, T.closeKernel));
      cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, kern);
      kern.delete();
    }
    // Fracción de píxeles "tinta" tras el umbral — sirve para saber si el
    // threshold captó algo (muy bajo = imagen casi vacía).
    try { res.darkFrac = cv.countNonZero(bin) / (bin.rows * bin.cols); } catch (e) {}

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    // RETR_LIST (no RETR_EXTERNAL): un marco/borde de la hoja no debe
    // ocultar los fiduciales que quedan "dentro" de él.
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    res.contourCount = contours.size();

    var w = imageData.width;
    var maxSide = w * 0.16, minSide = Math.max(7, w * 0.004);
    var minAreaAbs = minSide * minSide * 0.4;
    var rj = res.rejects;

    for (var i = 0; i < contours.size(); i++) {
      var cnt = contours.get(i);
      var approx = new cv.Mat();
      var hull = null;
      try {
        var area = cv.contourArea(cnt);
        if (area < minAreaAbs) { rj.tiny++; continue; }

        var rr = cv.minAreaRect(cnt);           // rectángulo ROTADO
        var rw = rr.size.width, rh = rr.size.height;
        if (rw < 1 || rh < 1) { rj.tiny++; continue; }
        var lo = Math.min(rw, rh), hi = Math.max(rw, rh);

        if (res.rawRects.length < 600) res.rawRects.push({ cx: rr.center.x, cy: rr.center.y, w: rw, h: rh });

        if (hi < minSide || hi > maxSide) { rj.size++; continue; }
        if (hi / lo > T.aspectMaxRR) { rj.aspect++; continue; }
        if (area / (rw * rh) < T.fillMin) { rj.fill++; continue; }

        hull = new cv.Mat();
        cv.convexHull(cnt, hull);
        var hullArea = Math.max(1, cv.contourArea(hull));
        if (area / hullArea < T.solidityMin) { rj.solidity++; continue; }

        var peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, T.approxEpsilonPct * peri, true);
        if (approx.rows < T.vertsMin || approx.rows > T.vertsMax) { rj.verts++; continue; }

        res.candidates.push({ cx: rr.center.x, cy: rr.center.y, side: (rw + rh) / 2 });
      } finally {
        approx.delete();
        if (hull) hull.delete();
        cnt.delete();
      }
    }

    // Un mismo fiducial real suele dejar 2 contornos casi superpuestos (el
    // borde exterior y un resto del hueco que deja adaptiveThreshold/CLOSE
    // en el centro). Sin deduplicar, el agrupador arma VARIOS grupos
    // "válidos" combinando distintos candidatos del mismo lugar físico —
    // hojas duplicadas que en realidad son la misma. Nos quedamos con el
    // más grande de cada cercanía antes de agrupar.
    res.candidatesRaw = res.candidates.length;
    res.candidates = dedupeCandidates(res.candidates);

    if (res.candidates.length > T.maxCandidates) {
      res.candidates.sort(function (a, b) { return b.side - a.side; });
      res.candidates = res.candidates.slice(0, T.maxCandidates);
    }
    res.groups = groupFiducials(res.candidates, T, F);
  } finally {
    [src, gray, blur, bin, hierarchy, contours].forEach(function (m) { try { if (m) m.delete(); } catch (e) {} });
  }
  return res;
}

// Fusiona candidatos que caen en el mismo lugar físico (distancia entre
// centros < 60% del lado): se queda con el de mayor lado (el contorno
// exterior, más representativo del cuadrado real).
function dedupeCandidates(cands) {
  var kept = [];
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i];
    var mergedInto = -1;
    for (var j = 0; j < kept.length; j++) {
      var k = kept[j];
      var d = Math.hypot(c.cx - k.cx, c.cy - k.cy);
      if (d < Math.max(c.side, k.side) * 0.6) { mergedInto = j; break; }
    }
    if (mergedInto === -1) kept.push(c);
    else if (c.side > kept[mergedInto].side) kept[mergedInto] = c;
  }
  return kept;
}

// Agrupa candidatos en conjuntos de 4 que formen el rectángulo spanX:spanY
// (libre de escala). Devuelve grupos ordenados TL,TR,BR,BL + escala px/mm.
function groupFiducials(cands, T, F) {
  var targetRatio = F.spanX / F.spanY;
  var n = cands.length;
  var used = {};
  var groups = [];
  var budget = T.iterBudget;
  function near(v, ref, rel) { return Math.abs(v - ref) <= ref * rel; }

  for (var a = 0; a < n && groups.length < T.maxGroups; a++) {
    if (used[a]) continue;
    for (var b = 0; b < n; b++) {
      if (used[a]) break;
      if (b === a || used[b]) continue;
      var dxAB = cands[b].cx - cands[a].cx, dyAB = cands[b].cy - cands[a].cy;
      if (dxAB <= 0) continue;
      var topSpan = Math.hypot(dxAB, dyAB);
      if (Math.abs(dyAB) > topSpan * T.edgeSkew) continue;
      for (var d = 0; d < n; d++) {
        if (used[a] || used[b]) break;
        if (d === a || d === b || used[d]) continue;
        var dxAD = cands[d].cx - cands[a].cx, dyAD = cands[d].cy - cands[a].cy;
        if (dyAD <= 0) continue;
        var leftSpan = Math.hypot(dxAD, dyAD);
        if (Math.abs(dxAD) > leftSpan * T.edgeSkew) continue;
        if (!near(topSpan / leftSpan, targetRatio, T.groupRatioTolerance)) continue;
        for (var c = 0; c < n; c++) {
          if ((budget -= 1) <= 0) return pruneNestedGroups(groups);
          if (c === a || c === b || c === d || used[c]) continue;
          var ex = cands[b].cx + dxAD, ey = cands[b].cy + dyAD;
          if (Math.hypot(cands[c].cx - ex, cands[c].cy - ey) > topSpan * 0.18) continue;
          var rightSpan = Math.hypot(cands[c].cx - cands[b].cx, cands[c].cy - cands[b].cy);
          var bottomSpan = Math.hypot(cands[c].cx - cands[d].cx, cands[c].cy - cands[d].cy);
          if (!near(topSpan, bottomSpan, T.groupRatioTolerance)) continue;
          if (!near(leftSpan, rightSpan, T.groupRatioTolerance)) continue;

          var scale = ((topSpan + bottomSpan) / 2) / F.spanX;
          var idxs = [a, b, c, d];
          var okSides = idxs.every(function (k) {
            var f = cands[k].side / (F.size * scale);
            return f >= T.areaMinFactor && f <= T.areaMaxFactor;
          });
          if (!okSides) continue;

          var pts = idxs.map(function (k) { return { k: k, x: cands[k].cx, y: cands[k].cy }; });
          var bySum = pts.slice().sort(function (p, q) { return (p.x + p.y) - (q.x + q.y); });
          var byDiff = pts.slice().sort(function (p, q) { return (p.x - p.y) - (q.x - q.y); });
          var ordered = [bySum[0], byDiff[3], bySum[3], byDiff[0]];
          var uniq = {};
          ordered.forEach(function (p) { uniq[p.k] = 1; });
          if (Object.keys(uniq).length !== 4) continue;

          ordered.forEach(function (p) { used[p.k] = 1; });
          groups.push({
            corners: ordered.map(function (p) { return { cx: cands[p.k].cx, cy: cands[p.k].cy, side: cands[p.k].side }; }),
            scale: scale
          });
          break;
        }
      }
    }
  }
  return pruneNestedGroups(groups);
}

// Salvavidas estructural: ningún grupo real puede estar "adentro" de otro
// (dos hojas físicas nunca se superponen). Si el centro de un grupo cae
// dentro del rectángulo de uno más grande ya aceptado, se descarta —
// suele ser ruido de la propia grilla de respuestas (burbujas, texto)
// que por casualidad formó un rectángulo con la proporción correcta.
function pruneNestedGroups(groups) {
  if (groups.length <= 1) return groups;
  function bbox(g) {
    var xs = g.corners.map(function (c) { return c.cx; });
    var ys = g.corners.map(function (c) { return c.cy; });
    return { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs),
             minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };
  }
  var withInfo = groups.map(function (g) {
    var b = bbox(g);
    return { g: g, b: b, area: (b.maxX - b.minX) * (b.maxY - b.minY),
      cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
  });
  withInfo.sort(function (a, b) { return b.area - a.area; });
  var kept = [];
  withInfo.forEach(function (item) {
    var nested = kept.some(function (bigger) {
      return item.cx >= bigger.b.minX && item.cx <= bigger.b.maxX &&
             item.cy >= bigger.b.minY && item.cy <= bigger.b.maxY;
    });
    if (!nested) kept.push(item);
  });
  return kept.map(function (item) { return item.g; });
}

// ------------------------------------------------------------
// Pasos 3-5: rectificar la hoja, leer el QR y leer las burbujas.
//   - Rectificación (spec 3.4): getPerspectiveTransform de las 4 esquinas
//     detectadas a las canónicas (F.centers × workScale). Hoja canónica
//     de sheetW×sheetH mm × workScale px  (100×130 mm × 8 = 800×1040).
//   - QR (spec 3.5): recorte (2,2)-(33,33) mm, jsQR; reintento en la hoja.
//   - Burbujas (spec 3.6): fillRatio en un cuadrado de sampleMm centrado en
//     colX(j)/rowY(i); decisión por umbrales WEAK_MIN / MARK_MIN / MARGIN.
// ------------------------------------------------------------
function processSheet(imageData, group, T, F, G, nQuestions) {
  var cv = self.cv;
  var WS = T.workScale;
  var SW = Math.round(F.sheetW * WS);
  var SH = Math.round(F.sheetH * WS);
  var out = { qrText: null, bubbles: [], incidences: [], rectified: null };

  var src, gray, srcPts, dstPts, M, rectGray, rectBin, rectRGBA;
  try {
    src = cv.matFromImageData(imageData);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    var c = group.corners, fc = F.centers;   // fc: [{x,y}×4] en mm, TL,TR,BR,BL
    srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      c[0].cx, c[0].cy, c[1].cx, c[1].cy, c[2].cx, c[2].cy, c[3].cx, c[3].cy,
    ]);
    dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
      fc[0].x * WS, fc[0].y * WS, fc[1].x * WS, fc[1].y * WS,
      fc[2].x * WS, fc[2].y * WS, fc[3].x * WS, fc[3].y * WS,
    ]);
    M = cv.getPerspectiveTransform(srcPts, dstPts);
    rectGray = new cv.Mat();
    cv.warpPerspective(gray, rectGray, M, new cv.Size(SW, SH),
      cv.INTER_LINEAR, cv.BORDER_CONSTANT, [255, 255, 255, 255]);

    // --- QR ---
    if (self.jsQR) {
      out.qrText = tryQR(rectGray, Math.round(2 * WS), Math.round(2 * WS), Math.round(31 * WS));
      if (!out.qrText) out.qrText = tryQR(rectGray, 0, 0, 0);   // reintento hoja completa
    }
    if (!out.qrText) out.incidences.push("QR_FAIL");

    // --- Burbujas ---
    rectBin = new cv.Mat();
    var bbs = T.binBlockSize || 25; if (bbs % 2 === 0) bbs += 1;
    cv.adaptiveThreshold(rectGray, rectBin, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, bbs, T.binC || 8);
    var half = Math.round((T.sampleMm * WS) / 2);
    var sz = half * 2;
    var multi = [], weak = [], blank = [];
    for (var qi = 0; qi < nQuestions; qi++) {
      var cy = (G.firstRowY + qi * G.rowStep) * WS;
      var fills = [];
      for (var oj = 0; oj < G.options; oj++) {
        var cx = (G.firstColX + oj * G.colStep) * WS;
        var x0 = Math.max(0, Math.min(Math.round(cx - half), rectBin.cols - sz));
        var y0 = Math.max(0, Math.min(Math.round(cy - half), rectBin.rows - sz));
        var roi = rectBin.roi(new cv.Rect(x0, y0, sz, sz));
        fills.push(cv.countNonZero(roi) / (sz * sz));
        roi.delete();
      }
      var ord = fills.map(function (v, idx) { return { v: v, idx: idx }; })
        .sort(function (a, b) { return b.v - a.v; });
      var best = ord[0].v, second = ord[1].v, state, answer = null;
      if (best < T.WEAK_MIN) { state = "BLANK"; blank.push(qi + 1); }
      else if (best < T.MARK_MIN) { state = "WEAK"; weak.push(qi + 1); }
      else if (best - second < T.MARGIN) { state = "MULTI"; multi.push(qi + 1); }
      else { state = "OK"; answer = ord[0].idx; }
      out.bubbles.push({
        fills: fills.map(function (v) { return +v.toFixed(3); }),
        state: state, answer: answer,
      });
    }
    if (multi.length) out.incidences.push("MULTI:" + multi.join(","));
    if (weak.length) out.incidences.push("WEAK:" + weak.join(","));
    if (blank.length) out.incidences.push("BLANK:" + blank.join(","));

    // --- Imagen rectificada para la vista previa (RGBA, se transfiere) ---
    rectRGBA = new cv.Mat();
    cv.cvtColor(rectGray, rectRGBA, cv.COLOR_GRAY2RGBA);
    var copy = new Uint8ClampedArray(rectRGBA.data);   // sacar de la heap de WASM
    out.rectified = { buffer: copy.buffer, w: rectRGBA.cols, h: rectRGBA.rows };
  } catch (err) {
    out.incidences.push("SHEET_ERROR:" + String((err && err.message) || err));
  } finally {
    [src, gray, srcPts, dstPts, M, rectGray, rectBin, rectRGBA].forEach(function (m) {
      try { if (m) m.delete(); } catch (e) {}
    });
  }
  return out;
}

function tryQR(grayMat, x, y, s) {
  var cv = self.cv;
  var roi = null, rgba = null;
  try {
    var m = grayMat;
    if (s > 0) { roi = grayMat.roi(new cv.Rect(x, y, Math.min(s, grayMat.cols - x), Math.min(s, grayMat.rows - y))); m = roi; }
    rgba = new cv.Mat();
    cv.cvtColor(m, rgba, cv.COLOR_GRAY2RGBA);
    var r = self.jsQR(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows, { inversionAttempts: "attemptBoth" });
    return (r && r.data) ? r.data : null;
  } catch (e) {
    return null;
  } finally {
    if (roi) try { roi.delete(); } catch (e) {}
    if (rgba) try { rgba.delete(); } catch (e) {}
  }
}
