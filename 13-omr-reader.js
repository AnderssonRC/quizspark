/* global React, SHEET_SPEC */
// ============================================================
// QuizSpark — LECTOR OMR (leer hojas de respuesta escaneadas)
// ------------------------------------------------------------
// Complemento de 12-omr.js. Ese archivo GENERA la hoja; este la LEE.
// Ambos usan el MISMO SHEET_SPEC — aquí no hay ni una coordenada a mano.
//
// Estado de avance (ver "Orden de implementación sugerido" del spec):
//   [x] 1. Cargar PDF/imagen y rasterizar a canvas. Mostrar la imagen.
//   [x] 2. Detectar fiduciales y dibujarlos en verde.
//   [x] 3. Rectificar (getPerspectiveTransform / warpPerspective).
//   [x] 4. Leer el QR (jsQR).
//   [x] 5. Leer burbujas (fillRatio + umbrales OMR_TUNING).
//   [x] 6. Vista previa marcada (círculos sobre la hoja rectificada).
//   [x] 7. Tabla de resultados + editor (13c-omr-results.js).  <-- AQUÍ
//   [ ] 8. Guardado en Firestore — YA implementado por fila ("Confirmar"),
//          falta pulir: exportar CSV, filtros, etc.
//
// Los pasos 1 y 2 están separados A PROPÓSITO (dos botones), con un panel
// de diagnóstico que registra cada etapa y su tiempo. Así, si algo se
// cuelga, se ve exactamente en qué paso — el spec pide verificar cada
// paso a ojo antes de escribir el siguiente.
//
// pdf.js se carga en el hilo principal al rasterizar. OpenCV.js corre en
// un Web Worker (13b-omr-worker.js): compilar los ~8 MB de WASM y procesar
// cada página NO congelan la pestaña.
// ============================================================
const { useState: useStateRd, useEffect: useEffectRd, useRef: useRefRd, useCallback: useCallbackRd, useMemo: useMemoRd } = React;

// ---- Umbrales calibrables ----------------------------------
const OMR_TUNING = {
  targetDpi: 200,          // resolución de rasterizado (spec 3.1)
  maxRasterPx: 3200,       // tope duro de ancho/alto del canvas (memoria)
  lowDpiThreshold: 120,
  workScale: 8,            // px por mm en la hoja rectificada (spec 3.4)

  threshold: { blur: 5, blockSize: 51, C: 10, closeKernel: 9 },   // spec 3.2 (+ CLOSE para re-solidificar)

  fiducial: {
    approxEpsilonPct: 0.02,
    // Filtros sobre el rectángulo rotado (minAreaRect) — invariantes a un
    // escaneo torcido, a diferencia del bounding box recto.
    aspectMaxRR: 1.35,     // cuadrado: hi/lo ≈ 1.0
    // Un círculo sólido (burbuja marcada) rellena ~π/4 ≈ 0.785 de su
    // minAreaRect; un cuadrado sólido rellena ~0.90-1.0. fillMin debe
    // quedar POR ENCIMA de 0.785 para que las burbujas rellenas nunca
    // pasen por fiducial — si no, se cuelan como candidatos falsos y el
    // agrupador arma "hojas" fantasma dentro de la grilla de respuestas.
    fillMin: 0.86,         // área contorno / área del rect rotado
    solidityMin: 0.84,     // área contorno / área del casco convexo (no distingue círculo de cuadrado, es un filtro aparte)
    vertsMin: 4, vertsMax: 7,
    areaMinFactor: 0.40, areaMaxFactor: 2.2,   // lado vs 7mm a la escala del grupo
    groupRatioTolerance: 0.15,
    edgeSkew: 0.28,
    maxCandidates: 45,     // cota para el agrupamiento O(n^4)
    maxGroups: 8,
    iterBudget: 5000000,
  },

  // spec 3.6 — umbrales de decisión + binarización de la hoja rectificada
  bubble: { sampleMm: 3.0, MARK_MIN: 0.35, MARGIN: 0.15, WEAK_MIN: 0.20, binBlockSize: 25, binC: 8 },
};

const JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
const nextFrame = () => new Promise(r => {
  if (window.requestAnimationFrame) window.requestAnimationFrame(() => r());
  else setTimeout(r, 16);
});

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error((label || "operación") + " tardó más de " + Math.round(ms / 1000) + "s")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

// ------------------------------------------------------------
// Carga bajo demanda de librerías pesadas
// ------------------------------------------------------------
const PDFJS_VER = "3.11.174";
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build`;
let _pdfjsPromise = null;
function loadPdfJs() {
  if (_pdfjsPromise) return _pdfjsPromise;
  _pdfjsPromise = new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve(window.pdfjsLib);
    const s = document.createElement("script");
    s.src = `${PDFJS_BASE}/pdf.min.js`;
    s.onload = () => {
      if (!window.pdfjsLib) return reject(new Error("pdf.js no expuso pdfjsLib"));
      try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`; } catch (e) {}
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error("No se pudo descargar pdf.js"));
    document.head.appendChild(s);
  });
  _pdfjsPromise.catch(() => { _pdfjsPromise = null; });   // permitir reintento
  return _pdfjsPromise;
}

// ------------------------------------------------------------
// OpenCV corre en un Web Worker (13b-omr-worker.js): compilar los ~8 MB
// de WASM y procesar cada página se hacen fuera del hilo principal, así
// la pestaña NUNCA se congela. Aquí solo se coordina el ida y vuelta.
// ------------------------------------------------------------
const OPENCV_URLS = [
  "https://docs.opencv.org/4.8.0/opencv.js",
  "https://docs.opencv.org/4.x/opencv.js",
];
let _worker = null;
let _workerReady = null;
let _reqId = 0;
const _pending = {};

function getOmrWorker() {
  if (_workerReady) return _workerReady;
  _workerReady = new Promise((resolve, reject) => {
    let w;
    try { w = new Worker("13b-omr-worker.js?v=6"); }
    catch (e) { reject(new Error("No se pudo crear el worker: " + e.message)); return; }
    _worker = w;
    const to = setTimeout(() => reject(new Error("OpenCV.js no inició en el worker (95 s)")), 95000);
    w.onmessage = (e) => {
      const m = e.data || {};
      if (m.type === "ready") { clearTimeout(to); resolve(w); }
      else if (m.type === "loaderror") { clearTimeout(to); reject(new Error("OpenCV en el worker — " + m.error)); }
      else if (m.type === "result") {
        const cb = _pending[m.id];
        if (cb) { delete _pending[m.id]; cb(m.res); }
      }
    };
    w.onerror = (ev) => {
      clearTimeout(to);
      reject(new Error("Worker: " + (ev.message || "error al cargar 13b-omr-worker.js")));
    };
    w.postMessage({ type: "load", urls: OPENCV_URLS, jsqr: JSQR_URL });
  });
  _workerReady.catch(() => { try { _worker && _worker.terminate(); } catch (e) {} _worker = null; _workerReady = null; });
  return _workerReady;
}

// Envía una página (ImageData) al worker y espera el resultado.
// Transfiere el buffer (zero-copy); el ImageData del hilo principal queda
// inservible, pero ya no se usa (se dibuja el overlay desde el canvas).
function detectInWorker(imageData, T, F, G, nQuestions) {
  return new Promise((resolve) => {
    const id = ++_reqId;
    const to = setTimeout(() => {
      if (_pending[id]) { delete _pending[id]; resolve({ error: "el worker no respondió en 60 s", candidates: [], groups: [], contourCount: 0, sheets: [] }); }
    }, 60000);
    _pending[id] = (res) => { clearTimeout(to); resolve(res); };
    _worker.postMessage(
      { type: "detect", id, buffer: imageData.data.buffer, width: imageData.width, height: imageData.height, T, F, G, nQuestions },
      [imageData.data.buffer]
    );
  });
}

// ------------------------------------------------------------
// Paso 1 — rasterizado
// ------------------------------------------------------------
function fitScale(w, h, cap) {
  const m = Math.max(w, h);
  return m > cap ? cap / m : 1;
}

async function rasterizePdf(file, log) {
  const pdfjsLib = await loadPdfJs();
  log(`  leyendo ${file.name} (${(file.size / 1048576).toFixed(1)} MB)…`);
  const buf = await file.arrayBuffer();
  const pdf = await withTimeout(
    pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise,
    30000, "abrir el PDF");
  log(`  ${pdf.numPages} página(s)`);
  const pages = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const t0 = performance.now();
      const page = await pdf.getPage(p);
      let viewport = page.getViewport({ scale: OMR_TUNING.targetDpi / 72 });
      const sc = fitScale(viewport.width, viewport.height, OMR_TUNING.maxRasterPx);
      if (sc < 1) viewport = page.getViewport({ scale: (OMR_TUNING.targetDpi / 72) * sc });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      await withTimeout(page.render({ canvasContext: ctx, viewport }).promise, 40000, `renderizar pág ${p}`);
      try { page.cleanup(); } catch (e) {}
      pages.push({
        canvas, label: `${file.name} · pág ${p}`,
        sourceDpi: OMR_TUNING.targetDpi * (sc < 1 ? sc : 1),
      });
      log(`  pág ${p}: ${canvas.width}×${canvas.height}px en ${Math.round(performance.now() - t0)} ms`);
      await nextFrame();
    }
  } finally {
    try { await pdf.destroy(); } catch (e) {}
  }
  return pages;
}

async function rasterizeImage(file, log) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Imagen ilegible: " + file.name));
      el.src = url;
    });
    const sc = fitScale(img.naturalWidth, img.naturalHeight, OMR_TUNING.maxRasterPx);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * sc);
    canvas.height = Math.round(img.naturalHeight * sc);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    log(`  ${file.name}: ${canvas.width}×${canvas.height}px`);
    return [{ canvas, label: file.name, sourceDpi: null }];
  } finally {
    URL.revokeObjectURL(url);
  }
}

// La detección de fiduciales (spec 3.2–3.3) vive en 13b-omr-worker.js
// para no bloquear el hilo principal. Aquí solo se le pasa el ImageData
// de cada página y se recibe { candidates, groups, contourCount }.

// Dibuja la página + overlays escalada a maxW. Devuelve data URL JPEG.
// debug=true dibuja además TODOS los contornos candidatos (det.rawRects)
// en rojo tenue, para ver qué está "viendo" OpenCV.
function renderOverlay(srcCanvas, det, maxW, debug) {
  const sc = Math.min(1, maxW / srcCanvas.width);
  const out = document.createElement("canvas");
  out.width = Math.round(srcCanvas.width * sc);
  out.height = Math.round(srcCanvas.height * sc);
  const ctx = out.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0, out.width, out.height);

  if (det && debug && det.rawRects) {
    ctx.strokeStyle = "rgba(239,68,68,0.55)";
    ctx.lineWidth = Math.max(1, 1 * sc);
    det.rawRects.forEach(r => {
      const w = r.w * sc, h = r.h * sc;
      ctx.strokeRect(r.cx * sc - w / 2, r.cy * sc - h / 2, w, h);
    });
  }

  if (det) {
    ctx.strokeStyle = "rgba(16,185,129,0.55)";
    ctx.lineWidth = Math.max(1, 1.5 * sc);
    det.candidates.forEach(c => {
      const s = c.side * sc;
      ctx.strokeRect(c.cx * sc - s / 2, c.cy * sc - s / 2, s, s);
    });
    det.groups.forEach((g, gi) => {
      ctx.strokeStyle = "#10b981";
      ctx.lineWidth = Math.max(2, 3 * sc);
      ctx.beginPath();
      g.corners.forEach((c, i) => {
        const x = c.cx * sc, y = c.cy * sc;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      g.corners.forEach(c => {
        const s = c.side * sc;
        ctx.strokeRect(c.cx * sc - s / 2, c.cy * sc - s / 2, s, s);
      });
      const tl = g.corners[0];
      ctx.fillStyle = "#10b981";
      ctx.font = "bold 14px system-ui, sans-serif";
      ctx.fillText("Hoja " + (gi + 1), tl.cx * sc + 6, Math.max(14, tl.cy * sc - 6));
    });
  }
  return out.toDataURL("image/jpeg", 0.7);
}

// Dibuja la hoja YA rectificada (800×1040) con la grilla teórica de
// burbujas superpuesta (spec 4): círculo r=2.5mm en cada posición teórica,
// azul = marca leída, ámbar = WEAK/MULTI, gris = vacía. Así se ve si la
// grilla quedó bien alineada tras la rectificación.
function renderRectified(rect, bubbles, G, WS) {
  const canvas = document.createElement("canvas");
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rect.buffer), rect.w, rect.h), 0, 0);

  const R = 2.5 * WS;
  bubbles.forEach((b, qi) => {
    const cy = (G.firstRowY + qi * G.rowStep) * WS;
    for (let oj = 0; oj < G.options; oj++) {
      const cx = (G.firstColX + oj * G.colStep) * WS;
      const isMark = b.state === "OK" && b.answer === oj;
      const warn = b.state === "WEAK" || b.state === "MULTI";
      ctx.strokeStyle = isMark ? "#2563eb" : warn ? "#f59e0b" : "rgba(90,90,90,0.55)";
      ctx.lineWidth = isMark ? 3 : 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  // Región del QR (spec 3.5: 2–33 mm)
  ctx.strokeStyle = "rgba(37,99,235,0.45)";
  ctx.lineWidth = 1;
  ctx.strokeRect(2 * WS, 2 * WS, 31 * WS, 31 * WS);
  return canvas.toDataURL("image/jpeg", 0.78);
}

// ------------------------------------------------------------
// Componente — pasos 1 y 2, cada uno con su botón y su registro
// ------------------------------------------------------------
function OMRReaderCanvas({ quiz }) {
  const [phase, setPhase] = useStateRd("idle");   // idle | rasterizing | rasterized | detecting | done | error
  const [logLines, setLogLines] = useStateRd([]);
  const [pages, setPages] = useStateRd([]);       // { label, canvas|null, sourceDpi, preview, det }
  const [debug, setDebug] = useStateRd(true);     // dibujar todos los contornos
  const inputRef = useRefRd(null);
  const rasterRef = useRefRd([]);                 // canvases vivos (fuera de React)
  const debugRef = useRefRd(true);
  debugRef.current = debug;

  const log = useCallbackRd((line) => {
    const stamp = new Date().toLocaleTimeString();
    // eslint-disable-next-line no-console
    console.log("[OMR]", line);
    setLogLines(prev => [...prev, `${stamp}  ${line}`]);
  }, []);

  const releaseRasters = useCallbackRd(() => {
    rasterRef.current.forEach(c => { try { c.width = c.height = 0; } catch (e) {} });
    rasterRef.current = [];
  }, []);

  // ---- Paso 1 ----
  const doRasterize = useCallbackRd(async (files) => {
    if (!files || !files.length) return;
    releaseRasters();
    setPages([]); setLogLines([]);
    setPhase("rasterizing");
    log(`Paso 1 — rasterizando ${files.length} archivo(s)…`);
    try {
      log("cargando pdf.js…");
      await withTimeout(loadPdfJs(), 30000, "descargar pdf.js");
      log("pdf.js listo");
      const raster = [];
      for (const file of files) {
        const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
        const out = isPdf ? await rasterizePdf(file, log) : await rasterizeImage(file, log);
        for (const r of out) raster.push(r);
        await nextFrame();
      }
      if (!raster.length) throw new Error("No se encontró ninguna página.");
      rasterRef.current = raster.map(r => r.canvas);
      const previews = [];
      for (const r of raster) {
        previews.push({
          label: r.label, canvas: r.canvas, sourceDpi: r.sourceDpi,
          preview: renderOverlay(r.canvas, null, 760), det: null,
        });
        setPages([...previews]);
        await nextFrame();
      }
      log(`Paso 1 OK — ${raster.length} página(s) rasterizada(s).`);
      setPhase("rasterized");
    } catch (e) {
      log("ERROR paso 1: " + (e && e.message ? e.message : e));
      setPhase("error");
    }
  }, [log, releaseRasters]);

  // ---- Paso 2 ----
  const doDetect = useCallbackRd(async () => {
    if (!pages.length) return;
    setPhase("detecting");
    log(`Paso 2 — detectando fiduciales en ${pages.length} página(s)…`);
    try {
      log("arrancando OpenCV.js en un worker (NO congela la pestaña; ~8 MB la 1ª vez)…");
      await nextFrame();
      const tCv = performance.now();
      await withTimeout(getOmrWorker(), 100000, "iniciar OpenCV.js en el worker");
      log(`worker + OpenCV listos en ${Math.round(performance.now() - tCv)} ms`);

      const spec = SHEET_SPEC;
      // SHEET_SPEC.fiducials.centers está en orden TL, TR, BL, BR; el
      // agrupador entrega las esquinas en TL, TR, BR, BL → reordenar para
      // que coincidan 1 a 1 en getPerspectiveTransform.
      const sc4 = spec.fiducials.centers;
      const F = {
        spanX: spec.fiducials.spanX, spanY: spec.fiducials.spanY, size: spec.fiducials.size,
        centers: [sc4[0], sc4[1], sc4[3], sc4[2]],   // TL, TR, BR, BL (mm)
        sheetW: spec.sheet.w, sheetH: spec.sheet.h,
      };
      const T = Object.assign({}, OMR_TUNING.threshold, OMR_TUNING.fiducial, OMR_TUNING.bubble,
        { workScale: OMR_TUNING.workScale });
      const G = {
        firstColX: spec.grid.firstColX, colStep: spec.grid.colStep,
        firstRowY: spec.grid.firstRowY, rowStep: spec.grid.rowStep,
        options: spec.grid.options, circleDiameter: spec.grid.circleDiameter,
      };
      // Solo las preguntas de opción múltiple del quiz, hasta el máximo que
      // cabe en una hoja (spec: 8). Ese es el nº de filas a leer.
      const mcCount = (quiz.questions || []).filter(q => q.type === "multi").length;
      const nQuestions = Math.min(mcCount || spec.grid.questions, spec.grid.questions);
      log(`leyendo ${nQuestions} pregunta(s) de opción múltiple por hoja`);

      const next = pages.map(p => ({ ...p }));
      for (let i = 0; i < next.length; i++) {
        const p = next[i];
        if (!p.canvas) { log(`pág ${i + 1}: sin canvas, se omite`); continue; }
        log(`pág ${i + 1}: procesando ${p.canvas.width}×${p.canvas.height}px…`);
        await nextFrame();
        const t0 = performance.now();
        const imgData = p.canvas.getContext("2d").getImageData(0, 0, p.canvas.width, p.canvas.height);
        const det = await detectInWorker(imgData, T, F, G, nQuestions);
        if (det.error) {
          log(`pág ${i + 1}: OpenCV falló — ${det.error}`);
          p.det = { error: det.error, candidates: [], groups: [] };
          p.preview = renderOverlay(p.canvas, null, 760);
          setPages([...next]);
          continue;
        }
        const notes = [];
        if (!det.groups.length) notes.push({ code: "FIDUCIAL_FAIL", block: true });
        let effDpi = det.groups.length ? det.groups[0].scale * 25.4
          : (p.sourceDpi || p.canvas.width / (SHEET_SPEC.page.w / 25.4));
        if (effDpi && effDpi < OMR_TUNING.lowDpiThreshold) notes.push({ code: "LOW_DPI", block: false });

        p.det = det;
        p.notes = notes;
        p.effDpi = effDpi ? Math.round(effDpi) : null;
        p.preview = renderOverlay(p.canvas, det, 760, debugRef.current);
        const rj = det.rejects || {};
        const rawCount = det.candidatesRaw != null ? det.candidatesRaw : det.candidates.length;
        log(`pág ${i + 1}: ${det.contourCount} contornos · ${rawCount} candidato(s) crudo(s) → ` +
          `${det.candidates.length} tras deduplicar · ${det.groups.length} grupo(s) · ${Math.round(performance.now() - t0)} ms`);
        log(`   tinta tras umbral: ${(100 * (det.darkFrac || 0)).toFixed(1)}% · ` +
          `rechazos → tamaño ${rj.size || 0}, aspecto ${rj.aspect || 0}, relleno ${rj.fill || 0}, ` +
          `solidez ${rj.solidity || 0}, vértices ${rj.verts || 0}, diminutos ${rj.tiny || 0}`);
        (det.groups || []).forEach((g, gi) => {
          const cs = g.corners.map(c => `(${Math.round(c.cx)},${Math.round(c.cy)})`).join(" ");
          log(`   grupo ${gi + 1}: TL/TR/BR/BL ${cs} · escala ${g.scale.toFixed(2)} px/mm (~${Math.round(g.scale * 25.4)} ppp)`);
        });

        // Pasos 3-5: procesar cada hoja rectificada devuelta por el worker.
        p.sheets = (det.sheets || []).map((sh, si) => {
          // QR (spec 3.5): validar formato y quiz. Se unifica todo en
          // `incidences` (además de qr.note, que es solo para mostrar el
          // detalle) para que el bloqueo de guardado (spec 5.1) sea
          // consistente sin importar de dónde vino la incidencia.
          const incidences = [...(sh.incidences || [])];
          let qr = { text: sh.qrText || null, studentId: null, ok: false, note: null };
          if (sh.qrText) {
            const parts = sh.qrText.split(":");
            if (parts[0] === SHEET_SPEC.qr.prefix && parts.length === 3) {
              qr.studentId = parts[2];
              if (parts[1] !== String(quiz.id)) { qr.note = "WRONG_QUIZ"; incidences.push("WRONG_QUIZ"); }
              else qr.ok = true;
            } else {
              qr.note = "QR_FAIL";
              if (!incidences.includes("QR_FAIL")) incidences.push("QR_FAIL");
            }
          } else if (!incidences.includes("QR_FAIL")) {
            incidences.push("QR_FAIL");
          }
          const answers = (sh.bubbles || []).map(b => b.state === "OK" ? b.answer : null);
          const preview = sh.rectified
            ? renderRectified(sh.rectified, sh.bubbles || [], G, OMR_TUNING.workScale)
            : null;
          const student = qr.ok ? (quiz.omrStudents || []).find(s => s.id === qr.studentId) || null : null;
          log(`   hoja ${si + 1}: QR ${qr.text ? '"' + qr.text + '"' : "(ilegible)"}` +
            `${student ? " → " + (student.name || "?") : ""}` +
            ` · resp: ${answers.map(a => (a == null ? "·" : String.fromCharCode(65 + a))).join("")}` +
            ` · incidencias: ${incidences.join(" ") || "—"}`);
          return {
            qr, answers, bubbles: sh.bubbles || [], incidences, preview, student,
            chosenStudentId: qr.ok ? qr.studentId : null,
            manuallyEdited: false, status: "pending",
          };
        });
        det.sheets = null;   // liberar los buffers rectificados (ya están en preview)

        setPages([...next]);
      }
      // Lotes grandes: liberar canvases (spec 7). Lotes chicos: conservarlos
      // para poder re-analizar sin volver a elegir el archivo.
      if (rasterRef.current.length > 12) {
        releaseRasters();
        next.forEach(p => { p.canvas = null; });
        setPages([...next]);
        log("(canvases liberados; para re-analizar vuelve a elegir el archivo)");
      }
      log("Paso 2 OK.");
      setPhase("done");
    } catch (e) {
      log("ERROR paso 2: " + (e && e.message ? e.message : e));
      setPhase("error");
    }
  }, [pages, log, releaseRasters, quiz]);

  // Re-dibujar las vistas previas cuando se activa/desactiva "ver contornos"
  // (solo si los canvases siguen vivos y ya hubo detección).
  useEffectRd(() => {
    if (phase !== "done") return;
    setPages(prev => prev.map(p => (p.canvas && p.det && !p.det.error)
      ? { ...p, preview: renderOverlay(p.canvas, p.det, 760, debug) }
      : p));
  }, [debug]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Paso 7: tabla de resultados — parchear una hoja puntual (p{i}-s{j}) ----
  const updateSheet = useCallbackRd((entryId, patchFn) => {
    const m = /^p(\d+)-s(\d+)$/.exec(entryId);
    if (!m) return;
    const pi = +m[1], si = +m[2];
    setPages(prev => prev.map((p, i) => {
      if (i !== pi || !p.sheets) return p;
      return { ...p, sheets: p.sheets.map((sh, j) => (j === si ? { ...sh, ...patchFn(sh) } : sh)) };
    }));
  }, []);

  const onAssignStudent = useCallbackRd((entryId, studentId) => {
    updateSheet(entryId, (sh) => ({
      chosenStudentId: studentId || null,
      student: studentId ? (quiz.omrStudents || []).find(s => s.id === studentId) || null : null,
      // Elegirlo a mano es justo la resolución documentada para QR_FAIL.
      incidences: (sh.incidences || []).filter(c => c !== "QR_FAIL"),
    }));
  }, [updateSheet, quiz.omrStudents]);

  const onEditAnswers = useCallbackRd((entryId, newAnswers) => {
    updateSheet(entryId, (sh) => ({
      answers: newAnswers,
      manuallyEdited: true,
      // El docente ya revisó y fijó cada respuesta a mano: las incidencias
      // de lectura de burbujas quedan resueltas (las de QR/duplicado no).
      incidences: (sh.incidences || []).filter(c => !/^(MULTI|WEAK|BLANK)/.test(c)),
    }));
  }, [updateSheet]);

  const entries = useMemoRd(
    () => (window.buildOmrEntries ? window.buildOmrEntries(pages, quiz) : []),
    [pages, quiz]
  );

  const onConfirm = useCallbackRd(async (entryId) => {
    const entry = entries.find(e => e.id === entryId);
    if (!entry || !window.confirmOmrEntry) return;
    try {
      const res = await window.confirmOmrEntry(quiz, entry);
      if (res === "created" || res === "overwritten") {
        updateSheet(entryId, () => ({ status: "confirmed" }));
        log(`✅ Confirmado: ${entry.result.studentName} → nota ${entry.result.grade.toFixed(1)} (${res === "overwritten" ? "sobrescribió uno existente" : "nuevo"})`);
      } else if (res === "skipped") {
        log(`(el docente decidió no sobrescribir el resultado existente de ${entry.result.studentName})`);
      }
    } catch (e) {
      alert("No se pudo confirmar: " + e.message);
      log("ERROR al confirmar " + entry.result.studentName + ": " + e.message);
    }
  }, [entries, quiz, updateSheet, log]);

  const onConfirmAll = useCallbackRd(async () => {
    for (const e of entries) {
      if (e.status === "confirmed") continue;
      if (window.omrIsBlocked && window.omrIsBlocked(e)) continue;
      // eslint-disable-next-line no-await-in-loop
      await onConfirm(e.id);
    }
  }, [entries, onConfirm]);

  const busy = phase === "rasterizing" || phase === "detecting";
  const totalSheets = pages.reduce((s, p) => s + (p.det && p.det.groups ? p.det.groups.length : 0), 0);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>📷 Leer Hoja de Respuesta</h2>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
          background: "rgba(124,58,237,0.12)", color: "var(--violet-700)",
        }}>Pasos 1–8 · listo para probar con hojas reales</span>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6, marginBottom: 16 }}>
        El proceso está partido en dos: primero <b>rasterizar</b> (mostrar la imagen del escaneo) y
        después <b>detectar los fiduciales</b> (marcar en verde las 4 esquinas de cada hoja). OpenCV
        corre en un <i>worker</i> aparte, así que la pestaña no se congela. Si algo falla, el registro
        de abajo dice exactamente dónde.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png"
          multiple style={{ display: "none" }}
          onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ""; doRasterize(f); }} />
        <button className="qs-btn qs-btn--primary" disabled={busy}
          onClick={() => inputRef.current && inputRef.current.click()}>
          {phase === "rasterizing" ? "Rasterizando…" : "1 · 📂 Elegir PDF o imágenes"}
        </button>
        <button className="qs-btn qs-btn--success" disabled={busy || !pages.length}
          onClick={doDetect}>
          {phase === "detecting" ? "Detectando…"
            : phase === "done" ? "🔍 Volver a detectar"
            : "2 · 🔍 Detectar fiduciales"}
        </button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-500)", cursor: "pointer" }}>
          <input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)} />
          🐞 Ver todos los contornos (rojo)
        </label>
      </div>

      {/* Registro de diagnóstico */}
      {logLines.length > 0 && (
        <pre style={{
          maxHeight: 220, overflowY: "auto", background: "var(--ink-50)", color: "#86efac",
          border: "1px solid var(--ink-200)",
          fontSize: 11, lineHeight: 1.6, padding: "10px 12px", borderRadius: 10, margin: "0 0 16px",
          whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        }}>{logLines.join("\n")}</pre>
      )}

      {phase === "error" && (
        <div style={{
          padding: 12, borderRadius: 10, background: "rgba(255,77,103,0.1)",
          border: "1px solid rgba(255,77,103,0.4)", color: "var(--red-500)", fontSize: 13, marginBottom: 16,
        }}>
          El proceso se detuvo. Revisa el registro de arriba (y la consola del navegador, F12) para ver
          la última línea antes del fallo.
        </div>
      )}

      {pages.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, fontSize: 13, fontWeight: 600, color: "var(--ink-500)" }}>
            <span>{pages.length} página(s)</span>
            {phase === "done" && <span>· {totalSheets} hoja(s) detectada(s)</span>}
          </div>
          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {pages.map((p, i) => (
              <div key={i} style={{ border: "1px solid var(--ink-200)", borderRadius: 12, overflow: "hidden", background: "var(--white)" }}>
                <img src={p.preview} alt={p.label} style={{ width: "100%", display: "block", background: "var(--ink-100)" }} />
                <div style={{ padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-900)", wordBreak: "break-word" }}>{p.label}</div>
                  {p.det && (
                    <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 3 }}>
                      {(p.det.groups ? p.det.groups.length : 0)} grupo(s) · {(p.det.candidates ? p.det.candidates.length : 0)} candidato(s)
                      {p.effDpi ? ` · ~${p.effDpi} ppp` : ""}
                    </div>
                  )}
                  {p.notes && p.notes.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {p.notes.map((nt, k) => (
                        <span key={k} style={{
                          fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6,
                          background: nt.block ? "rgba(255,77,103,0.16)" : "rgba(255,190,31,0.18)",
                          color: nt.block ? "var(--red-500)" : "#fbbf24",
                        }}>{nt.code}</span>
                      ))}
                    </div>
                  )}

                  {/* Pasos 3-5: hojas rectificadas, QR y respuestas leídas */}
                  {(p.sheets || []).map((sh, si) => (
                    <div key={si} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--ink-200)" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: "var(--ink-900)" }}>
                        🧾 Hoja {si + 1}
                        {sh.student ? ` · ${sh.student.name || "?"}${sh.student.course ? " (" + sh.student.course + ")" : ""}` : ""}
                      </div>
                      {sh.preview && (
                        <img src={sh.preview} alt={"Hoja rectificada " + (si + 1)}
                          style={{ width: "100%", display: "block", borderRadius: 8, background: "#fff", border: "1px solid var(--ink-200)" }} />
                      )}
                      <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 6, wordBreak: "break-all" }}>
                        QR: {sh.qr.text
                          ? <span style={{ color: sh.qr.ok ? "var(--emerald-400)" : "#fbbf24" }}>{sh.qr.text}{sh.qr.note ? " (" + sh.qr.note + ")" : ""}</span>
                          : <span style={{ color: "var(--red-500)" }}>ilegible</span>}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                        {sh.bubbles.map((b, qi) => {
                          const bg = b.state === "OK" ? "rgba(37,99,235,0.18)"
                            : b.state === "BLANK" ? "var(--ink-100)" : "rgba(245,158,11,0.20)";
                          const fg = b.state === "OK" ? "#93c5fd"
                            : b.state === "BLANK" ? "var(--ink-500)" : "#fbbf24";
                          return (
                            <span key={qi} title={`fills: ${b.fills.join(", ")}`} style={{
                              fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 6,
                              background: bg, color: fg,
                            }}>{qi + 1}:{b.state === "OK" ? String.fromCharCode(65 + b.answer) : b.state[0]}</span>
                          );
                        })}
                      </div>
                      {sh.incidences.length > 0 && (
                        <div style={{ fontSize: 10, color: "var(--ink-500)", marginTop: 4 }}>{sh.incidences.join(" · ")}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Paso 7: tabla de resultados — correlaciona lo leído con las
          respuestas correctas del quiz y califica con la misma fórmula de
          los quizzes digitales. Paso 8: "Confirmar" guarda en Firestore
          (colección "results"), solo al pulsarlo. */}
      {window.OMRResultsTable && (
        <window.OMRResultsTable
          quiz={quiz} entries={entries}
          onAssignStudent={onAssignStudent}
          onEditAnswers={onEditAnswers}
          onConfirm={onConfirm}
          onConfirmAll={onConfirmAll}
        />
      )}

      <div style={{
        marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--ink-200)",
        fontSize: 12, color: "var(--ink-500)", lineHeight: 1.7,
      }}>
        <b>Estado:</b> ✅ 1 rasterizar · ✅ 2 fiduciales · ✅ 3 rectificar · ✅ 4 leer QR ·
        ✅ 5 leer burbujas · ✅ 6 vista previa marcada · ✅ 7 tabla + editor · ✅ 8 guardar en
        Firestore (solo al confirmar, fila por fila). Nada se guarda hasta que pulsás "Confirmar".
      </div>
    </div>
  );
}

Object.assign(window, { OMR_TUNING, OMRReaderCanvas });
