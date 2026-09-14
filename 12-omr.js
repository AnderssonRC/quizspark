/* global React */
// ============================================================
// QuizSpark — MODO LECTOR DE RESPUESTA (hojas OMR en PDF)
// ------------------------------------------------------------
// Siguiente escalón del "Modo Sin Celular" (11-lectio.js): en vez de que
// el docente revele la respuesta en pantalla, cada estudiante marca sus
// respuestas en una hoja de papel impresa, que en una etapa futura se
// podrá escanear y leer automáticamente (OMR).
//
// Por ahora este archivo solo genera el PDF de las hojas. SHEET_SPEC es
// la ÚNICA fuente de verdad de la geometría: tanto el generador de PDF
// de aquí como el futuro lector OMR deben importar este mismo objeto.
// Ningún número de geometría debe escribirse "a mano" fuera de SHEET_SPEC.
//
// Componentes/funciones expuestos (bare window):
//   SHEET_SPEC                 — geometría (fuente única de verdad)
//   colX(i), rowY(i)           — helpers de posición del grid de respuestas
//   buildOMRAnswerSheetsPDF()  — arma el PDF (jsPDF) y lo devuelve
//   OMRReaderPanel             — panel del Editor (lista de estudiantes + exportar)
// ============================================================
const { useState: useStateOmr } = React;

// ---------------------------------------------------------------
// SHEET_SPEC — geometría de la hoja de respuestas. TODO en milímetros.
// Ver "Especificación de la hoja de respuestas OMR — Res Cogitans / Desafíate".
// ---------------------------------------------------------------
const SHEET_SPEC = {
  // v1.1.0: se corrigió la cuadrícula de respuestas — en v1.0.0 el encabezado
  // "A B C D" (baseline Y=63) caía dentro de la franja vertical de los
  // fiduciales superiores (58.5–65.5) y la última fila casi tocaba los
  // fiduciales inferiores, violando la "zona libre de 3mm" alrededor de
  // cada fiducial. Ver derivación en el bloque `grid` más abajo.
  // v1.2.0: logo más grande, más oscuro y reubicado junto al QR. Ver
  // derivación en `logo` más abajo.
  // v1.3.0: logo pegado al borde del QR y un poco más grande todavía.
  // v1.4.0: logo corrido 1mm más hacia el borde derecho (sin tocar el
  // #01); fecha movida arriba del logo en cursiva; curso pasa a la
  // misma línea que el nombre (antes del nombre) con letra más grande;
  // nueva línea de "Nombre:"/"Curso:" en blanco para llenar a mano
  // debajo del nombre impreso; instrucción centrada, en cursiva y
  // subrayada. Ver derivación en `text` más abajo.
  // v1.5.0: corrección — la línea de "Nombre:"/"Curso:" NO era para
  // llenar a mano (se quitó); es una sola línea ya impresa con los datos
  // que trae el quiz: "Nombre: {nombre}   Curso: {curso}", subrayada.
  // El logo se corrió pegado al margen derecho de la hoja; para que no
  // choque con nada, el número de secuencia (#01) y la fecha se movieron
  // a una columna angosta arriba/abajo del logo (ver derivación en
  // `text` más abajo).
  // v1.6.0 (revertido en v1.6.1): se probó agregar el número de hoja al QR
  // para soportar varias hojas por estudiante cuando un quiz supera
  // grid.questions preguntas. Se descartó: la regla del Modo Sin Celular
  // es que un quiz SIEMPRE cabe en una sola hoja (máximo grid.questions
  // preguntas de opción múltiple) — ver el tope en buildOMRAnswerSheetsPDF
  // y en OMRReaderPanel más abajo. El QR vuelve a ser
  // "RC1:{quizId}:{studentId}", sin número de hoja.
  // v1.7.0: rediseño del bloque de identificación + cuadrícula para que
  // quepan 10 preguntas (antes 8), sin tocar el layout que ya funciona
  // (grid.firstColX/colStep/rowStep/circleDiameter, QR, logo, fecha) —
  // ver derivación completa en `text`, `fiducials` y `grid` más abajo.
  // Resumen de la redistribución:
  //   - Curso pasa a su propia línea ARRIBA de Nombre (antes compartían
  //     una sola línea, lo que obligaba a truncar el nombre con "…" si
  //     el curso era largo). Nombre ahora tiene toda la línea para él
  //     solo y ya NO se trunca — si un nombre es muy largo, el tamaño de
  //     letra se reduce en vez de cortarlo (ver drawSheet()).
  //   - Se quita la línea "#01" (el número de hoja): desde que el Modo
  //     Sin Celular exige que el quiz quepa en 1 sola hoja (ver
  //     buildOMRAnswerSheetsPDF), ese número es SIEMPRE "#01" — ya no
  //     informa nada, así que se libera esa línea para el nuevo bloque
  //     Curso/Nombre en vez de agregar una línea más al total.
  //   - El fiducial SUPERIOR sube de Y=62 a Y=54 y el INFERIOR baja de
  //     Y=120 a Y=123 (spanY 58→69), usando aire que ya estaba de sobra
  //     en ambos extremos de la hoja, para que la cuadrícula tenga sitio
  //     para 2 filas más sin apretar rowStep (5mm, ya probado para marcar
  //     a mano).
  version: "1.7.0",
  unit: "mm",

  page:   { w: 216, h: 279, format: "letter", orientation: "portrait" },
  sheet:  { w: 100, h: 130, perPage: 4 },
  origins: [
    { x: 5.5,   y: 6   },
    { x: 110.5, y: 6   },
    { x: 5.5,   y: 143 },
    { x: 110.5, y: 143 },
  ],

  cutMarks: { len: 3, lineWidth: 0.2, xs: [5.5, 105.5, 110.5, 210.5], ys: [6, 136, 143, 273] },

  innerBox: { inset: 0.5, lineWidth: 0.3 },

  qr:   { x: 5, y: 5, size: 25, errorCorrection: "M", prefix: "RC1" },
  // v1.5.0: logo pegado al margen derecho de la hoja. Recuadro interior
  // (innerBox) llega hasta x=99.5; el logo termina en x=97, 1.5mm antes
  // de ese borde ("justo en la margen" sin salirse del área imprimible).
  // w/h SIN CAMBIOS (58×24) → x = 97-58 = 39. y=6/h=24 sin cambios
  // tampoco (bottom=30, alineado con el borde inferior del QR). Al
  // correrse tan a la derecha, ya no cabe nada a su lado (ni el #01 ni
  // la fecha) sin encimarse — por eso esos dos textos se movieron a una
  // columna propia arriba/abajo del logo (ver `text` más abajo) en vez
  // de compartir su misma fila.
  // src/grayTint no son geometría del papel, pero viven aquí igual (misma
  // fuente única de verdad) para no repetir el nombre de archivo ni la
  // atenuación en otro lugar del código. grayTint = 0.85 → 85% de tinta
  // negra, no negro pleno (100%), por la misma cautela del spec sobre
  // logos oscuros y compactos cerca del detector de fiduciales.
  logo: { x: 39, y: 6, w: 58, h: 24, src: "logo-res-cogitas.png", grayTint: 0.85 },

  // v1.5.0 — rediseño del bloque de identificación (derivación):
  //   date: "hacia la derecha, en el borde superior" — con el logo ahora
  //     ocupando x:39–97 en y:6–30, la fecha va ARRIBA de él, alineada a
  //     la derecha con su mismo borde (x=97). y=4 dentro del margen
  //     libre 0.5–6 de arriba (mismo cálculo de aire que antes: cursiva
  //     7pt).
  // v1.7.0 — Curso y Nombre, cada uno en su propia línea, sin "#01"
  // (derivación): se quitó la línea de secuencia (ver comentario de
  // versión arriba) y en su lugar van Curso (arriba) y Nombre (abajo),
  // cada uno con toda la línea para sí — el pedido explícito fue "el
  // curso debe aparecer encima del nombre" y que el nombre no se corte.
  //   courseLine: y=35 (5mm después del logo, que termina en y=30), letra
  //     más chica (9pt) porque es el dato secundario.
  //   nameLine: y=41 (6mm después de courseLine, más aire que antes por
  //     ser ahora el dato principal), 10pt, subrayado en 42.3 (+1.3mm,
  //     igual que en v1.5.0/v1.6.x). Ya NO se trunca con "…" — ver
  //     drawSheet(), que reduce el tamaño de letra si hace falta
  //     (nameLine.maxWidth) para que el nombre siempre quepa completo.
  //   instruction: sube de y=51 a y=45.2 (subrayado 46.1) para dejar
  //     zona libre de sobra sobre el fiducial superior, que en v1.7.0
  //     sube a Y=54 (ver `fiducials` más abajo) — el límite es 47.5
  //     (borde 50.5 − 3mm de zona libre), así que 46.1 deja 1.4mm de
  //     margen.
  text: {
    date:        { x: 97, y: 4,  align: "right", font: "Helvetica-Oblique", size: 7 },
    courseLine:  { x: 5,  y: 35, font: "Helvetica-Bold", size: 9 },
    nameLine:    { x: 5,  y: 41, underlineY: 42.3, font: "Helvetica-Bold", size: 10, maxWidth: 90 },
    instruction: { y: 45.2, underlineY: 46.1, align: "center", font: "Helvetica-Oblique", size: 6.5 },
  },

  // v1.7.0: el fiducial SUPERIOR sube de Y=62 a Y=54 y el INFERIOR baja
  // de Y=120 a Y=123 — ambos usan aire que ya estaba de sobra en su lado
  // de la hoja (ver derivación completa en `grid` más abajo). spanY pasa
  // de 58 a 69 (123−54); spanX no cambia.
  fiducials: {
    size: 7,
    centers: [
      { x: 15, y: 54  },
      { x: 85, y: 54  },
      { x: 15, y: 123 },
      { x: 85, y: 123 },
    ],
    clearance: 3,
    spanX: 70,
    spanY: 69,
  },

  // Bloque de respuestas — derivación de las medidas verticales:
  //   v1.1.0: Fiducial superior en Y=62, lado 7mm → borde inferior Y=65.5.
  //     + zona libre de 3mm → nada antes de Y=68.5. Encabezado "A B C D"
  //     con headerBaselineY=71 (≈2.5mm de margen sobre esa frontera).
  //     firstRowY=75.5 (4.5mm de aire tras el encabezado). Con eso solo
  //     cabían 8 filas completas antes del fiducial inferior (Y=120,
  //     borde 116.5, límite en 113.5 con la zona libre).
  //   v1.7.0: para caber las 10 preguntas del quiz (no solo 8) sin tocar
  //     rowStep (5mm, ya probado para marcar a mano), se redistribuyen
  //     AMBOS fiduciales: el superior sube a Y=54 (borde 50.5, zona libre
  //     hasta 47.5) y el inferior baja a Y=123 (borde 119.5, zona libre
  //     hasta 116.5) — el fondo de la hoja (Y=130) queda con 3.5mm de
  //     margen de sobra bajo el fiducial, igual que antes tenía de sobra
  //     arriba. headerBaselineY baja a 63 (mismo margen de ≈2.5mm sobre
  //     la nueva frontera de 56.5) y firstRowY a 67.5 (mismos 4.5mm de
  //     aire tras el encabezado). La fila 10 llega a Y=112.5, círculo
  //     hasta 114.25 — quedan 2.25mm de aire libre sobre el fiducial
  //     inferior. Ya no hacen falta varias hojas por estudiante (ver
  //     buildOMRAnswerSheetsPDF más abajo, que exige que el quiz quepa en
  //     10 preguntas o menos).
  grid: {
    options: 4,
    questions: 10,
    firstColX: 39.5,
    colStep: 7,
    firstRowY: 67.5,
    rowStep: 5,
    circleDiameter: 3.5,
    circleLineWidth: 0.3,
    headerBaselineY: 63,
    qNumX: 31,
    qNumBaselineOffset: 1.1,
  },
};

const colX = (i) => SHEET_SPEC.grid.firstColX + i * SHEET_SPEC.grid.colStep;
const rowY = (i) => SHEET_SPEC.grid.firstRowY + i * SHEET_SPEC.grid.rowStep;

// Traduce un mm medido "desde arriba" a la Y que espera el motor de dibujo.
// jsPDF ya mide Y desde arriba hacia abajo, así que hoy es la identidad —
// pero se deja como función única (en vez de usar los mm crudos) para que
// portar este generador a un motor que mida Y desde abajo (p. ej. reportlab)
// sea cambiar UNA línea, no reescribir cada coordenada del archivo.
const y = (mm) => mm;

// "gris N%" en el sentido de impresión = N% de tinta negra sobre blanco.
function gray(pct) {
  const v = Math.round(255 * (1 - pct / 100));
  return [v, v, v];
}
const GRAY_CUTMARKS = gray(70);
const GRAY_INNERBOX = gray(60);

function applyFont(doc, fontName, size) {
  let style = "normal";
  if (fontName === "Helvetica-Bold") style = "bold";
  else if (fontName === "Helvetica-Oblique") style = "italic";
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
}

// Genera un PNG (data URL) del QR usando la librería global QRCode
// (davidshimjs, ya cargada para la sala en vivo). Se renderiza en un
// contenedor invisible fuera de pantalla y se descarta de inmediato.
function makeQRDataUrl(text, px) {
  if (typeof window.QRCode === "undefined") return null;
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-9999px";
  holder.style.top = "-9999px";
  document.body.appendChild(holder);
  try {
    // eslint-disable-next-line no-new
    new window.QRCode(holder, {
      text, width: px, height: px,
      colorDark: "#000000", colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    const canvas = holder.querySelector("canvas");
    return canvas ? canvas.toDataURL("image/png") : null;
  } catch (e) {
    return null;
  } finally {
    document.body.removeChild(holder);
  }
}

// Carga el logo (una sola vez, se cachea) y lo atenúa al gris que pide
// SHEET_SPEC.logo.grayTint: se dibuja sobre un fondo blanco con opacidad
// reducida en vez de a negro pleno — así una hoja "logo oscuro y
// compacto" no arriesga que el detector de fiduciales confunda un trazo
// denso del logo con una de las 4 marcas de esquina. Devuelve
// { dataUrl, w, h } (w/h en píxeles del PNG original, para mantener su
// proporción al ubicarlo dentro del rectángulo de 33×14mm) o null si no
// se pudo cargar (en ese caso simplemente no se imprime logo).
let _omrLogoCache = null;
function loadLogoDataUrl(src, tint) {
  const cacheKey = src + "|" + tint;
  if (_omrLogoCache && _omrLogoCache.key === cacheKey) return _omrLogoCache.promise;
  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = tint;
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: canvas.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight });
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  _omrLogoCache = { key: cacheKey, promise };
  return promise;
}

// Marcas de corte (una vez por página, en el margen exterior de la hoja carta).
function drawCutMarks(doc) {
  const { cutMarks, page } = SHEET_SPEC;
  doc.setDrawColor(...GRAY_CUTMARKS);
  doc.setLineWidth(cutMarks.lineWidth);
  cutMarks.xs.forEach(x => {
    doc.line(x, y(0), x, y(cutMarks.len));
    doc.line(x, y(page.h - cutMarks.len), x, y(page.h));
  });
  cutMarks.ys.forEach(yy => {
    doc.line(0, y(yy), cutMarks.len, y(yy));
    doc.line(page.w - cutMarks.len, y(yy), page.w, y(yy));
  });
}

// Nota de impresión al 100% (regla 3 del spec), en el margen inferior de
// la página — fuera del área de corte de las hojas.
function drawPrintNote(doc) {
  const { page } = SHEET_SPEC;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(...gray(55));
  doc.text(
    `Imprimir al 100% de tamaño — NO usar "ajustar a página" — Lector de Respuestas v${SHEET_SPEC.version} — Res Cogitans / Desafíate`,
    page.w / 2, y(page.h - 1.8), { align: "center" }
  );
}

// Dibuja una hoja individual (100×130mm) en el origen dado.
// `logoInfo` es { dataUrl, w, h } (o null) — ver loadLogoDataUrl.
function drawSheet(doc, origin, job, quiz, logoInfo) {
  const spec = SHEET_SPEC;
  const ox = origin.x, oy = origin.y;

  // 2.1 — recuadro interior (solo referencia visual de corte)
  doc.setDrawColor(...GRAY_INNERBOX);
  doc.setLineWidth(spec.innerBox.lineWidth);
  const ib = spec.innerBox.inset;
  doc.rect(ox + ib, y(oy + ib), spec.sheet.w - 2 * ib, spec.sheet.h - 2 * ib, "S");

  // 2.2 — código QR: RC1:{quizId}:{studentId}. Sin nombre ni datos personales.
  const qrText = `${spec.qr.prefix}:${quiz.id}:${job.student.id}`;
  const qrDataUrl = makeQRDataUrl(qrText, 300);
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, "PNG", ox + spec.qr.x, y(oy + spec.qr.y), spec.qr.size, spec.qr.size);
  }

  // 2.3 — zona del logo: "Res Cogitans", atenuado al gris de SHEET_SPEC.logo.grayTint
  // (ver loadLogoDataUrl). Se ajusta DENTRO del rectángulo de 33×14mm
  // manteniendo su proporción original (nunca lo excede) y queda centrado
  // en ambos ejes dentro de ese rectángulo.
  if (logoInfo && logoInfo.dataUrl) {
    const lg = spec.logo;
    const aspect = logoInfo.w / logoInfo.h;
    let drawW = lg.w, drawH = lg.w / aspect;
    if (drawH > lg.h) { drawH = lg.h; drawW = lg.h * aspect; }
    const offX = (lg.w - drawW) / 2, offY = (lg.h - drawH) / 2;
    doc.addImage(logoInfo.dataUrl, "PNG", ox + lg.x + offX, y(oy + lg.y + offY), drawW, drawH);
  }

  // 2.4 — textos de cabecera
  const t = spec.text;

  // Fecha — arriba a la derecha, encima del logo, en cursiva.
  applyFont(doc, t.date.font, t.date.size);
  doc.setTextColor(0, 0, 0);
  doc.text(job.dateStr, ox + t.date.x, y(oy + t.date.y), { align: t.date.align });

  // Curso — línea propia, ARRIBA del nombre (dato secundario, letra más chica).
  const cl = t.courseLine;
  applyFont(doc, cl.font, cl.size);
  doc.setTextColor(0, 0, 0);
  const courseSeg = "Curso: " + (job.student.course || "").trim();
  doc.text(courseSeg, ox + cl.x, y(oy + cl.y), { align: "left" });

  // Nombre — línea propia, completa y SIN recortar: si no entra al tamaño
  // normal (10pt), se reduce el tamaño de letra hasta que quepa entera en
  // vez de cortarla con "…" (nombres largos siguen siendo legibles).
  const nl = t.nameLine;
  const nameSeg = "Nombre: " + ((job.student.name || "").trim() || "(sin nombre)");
  let nameSize = nl.size;
  applyFont(doc, nl.font, nameSize);
  while (nameSize > 6 && doc.getTextWidth(nameSeg) > nl.maxWidth) {
    nameSize -= 0.5;
    applyFont(doc, nl.font, nameSize);
  }
  doc.setTextColor(0, 0, 0);
  doc.text(nameSeg, ox + nl.x, y(oy + nl.y), { align: "left" });
  const nameSegW = doc.getTextWidth(nameSeg);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(ox + nl.x, y(oy + nl.underlineY), ox + nl.x + nameSegW, y(oy + nl.underlineY));

  // Instrucción — centrada, en cursiva y subrayada (para que se note bien).
  applyFont(doc, t.instruction.font, t.instruction.size);
  doc.setTextColor(0, 0, 0);
  const instrText = "Rellena por completo un solo círculo. Lápiz o esfero negro.";
  const instrCx = ox + spec.sheet.w / 2;
  doc.text(instrText, instrCx, y(oy + t.instruction.y), { align: t.instruction.align });
  const instrW = doc.getTextWidth(instrText);
  doc.setLineWidth(0.2);
  doc.line(instrCx - instrW / 2, y(oy + t.instruction.underlineY), instrCx + instrW / 2, y(oy + t.instruction.underlineY));

  // 2.5 — fiduciales (las 4 medidas más críticas: NO tocar sin cambiar SHEET_SPEC)
  doc.setFillColor(0, 0, 0);
  const fs = spec.fiducials.size;
  spec.fiducials.centers.forEach(c => {
    doc.rect(ox + c.x - fs / 2, y(oy + c.y - fs / 2), fs, fs, "F");
  });

  // 2.6 — bloque de respuestas
  const g = spec.grid;
  applyFont(doc, "Helvetica-Bold", 7);
  doc.setTextColor(0, 0, 0);
  ["A", "B", "C", "D"].forEach((label, i) => {
    doc.text(label, ox + colX(i), y(oy + g.headerBaselineY), { align: "center" });
  });

  applyFont(doc, "Helvetica", 7);
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(g.circleLineWidth);
  job.sheetQuestions.forEach((sq, li) => {
    const cy = rowY(li);
    doc.text(String(sq.globalNumber), ox + g.qNumX, y(oy + cy + g.qNumBaselineOffset), { align: "right" });
    for (let opt = 0; opt < g.options; opt++) {
      doc.circle(ox + colX(opt), y(oy + cy), g.circleDiameter / 2, "S");
    }
  });
}

// ---------------------------------------------------------------
// Generador principal: SIEMPRE una sola hoja por estudiante — el Modo Sin
// Celular no soporta varias hojas por estudiante (el lector OMR solo
// procesa una), así que un quiz de más de SHEET_SPEC.grid.questions
// preguntas de opción múltiple no se puede exportar; hay que reducir sus
// preguntas primero (ver también el aviso en OMRReaderPanel más abajo).
// ---------------------------------------------------------------
async function buildOMRAnswerSheetsPDF({ quiz, students }) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error("La librería de PDF (jsPDF) no cargó. Revisa tu conexión e inténtalo de nuevo.");
  }
  const questions = (quiz.questions || []).filter(q => q.type === "multi");
  if (!questions.length) throw new Error("El quiz no tiene preguntas de opción múltiple.");
  if (!students || !students.length) throw new Error("Agrega al menos un estudiante.");
  if (!quiz.id || String(quiz.id).startsWith("new-")) throw new Error("Guarda el quiz antes de exportar el PDF.");
  const perSheet = SHEET_SPEC.grid.questions;
  if (questions.length > perSheet) {
    throw new Error(
      `El quiz tiene ${questions.length} preguntas de opción múltiple, pero una hoja solo tiene espacio ` +
      `para ${perSheet}. Quita preguntas hasta llegar a ${perSheet} o menos — el Modo Sin Celular no ` +
      `soporta varias hojas por estudiante.`
    );
  }

  // El logo se carga y se atenúa UNA sola vez (es el mismo en las 4 hojas
  // de cada página y en todas las páginas) — si falla, sigue sin logo.
  const logoInfo = await loadLogoDataUrl(SHEET_SPEC.logo.src, SHEET_SPEC.logo.grayTint);

  const dateStr = new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });

  // Siempre 1 hoja por estudiante (seq: 1 fijo — ya no se numeran #01/#02...
  // porque nunca hay una segunda).
  const jobs = students.map(student => ({
    student, seq: 1, dateStr,
    sheetQuestions: questions.map((qq, li) => ({ globalNumber: li + 1 })),
  }));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: SHEET_SPEC.unit, format: SHEET_SPEC.page.format, orientation: SHEET_SPEC.page.orientation });

  let i = 0;
  let firstPage = true;
  while (i < jobs.length) {
    if (!firstPage) doc.addPage();
    firstPage = false;
    drawCutMarks(doc);
    drawPrintNote(doc);
    for (let slot = 0; slot < SHEET_SPEC.sheet.perPage && i < jobs.length; slot++, i++) {
      drawSheet(doc, SHEET_SPEC.origins[slot], jobs[i], quiz, logoInfo);
    }
  }
  return doc;
}

// ---------------------------------------------------------------
// UI — editor de la hoja de respuestas. Se muestra como un "lienzo" propio
// del editor (panel central) cuando quiz.mode === "lectio" y quiz.omrEnabled,
// para tener sitio de sobra a medida que se agreguen más opciones.
// El interruptor "Activar hoja de respuestas (OMR)" vive en el panel de
// Configuración de la derecha (03-creator.js); aquí ya llega activado.
// ---------------------------------------------------------------
function genStudentId() {
  return "st_" + Math.random().toString(36).slice(2, 10);
}

function OMRReaderPanel({ quiz, setQuiz, onExportPDF, onClose }) {
  const [pasteText, setPasteText] = useStateOmr("");
  const [showPaste, setShowPaste] = useStateOmr(false);
  const students = quiz.omrStudents || [];
  const mcQuestions = (quiz.questions || []).filter(q => q.type === "multi");
  const perSheet = SHEET_SPEC.grid.questions;
  // El Modo Sin Celular SIEMPRE es una hoja por estudiante — no soporta
  // varias hojas (ver buildOMRAnswerSheetsPDF). Si el quiz tiene más
  // preguntas de las que caben, hay que reducirlas antes de exportar.
  const tooManyQuestions = mcQuestions.length > perSheet;
  const totalSheets = mcQuestions.length ? students.length : 0;
  const totalPages = totalSheets ? Math.ceil(totalSheets / SHEET_SPEC.sheet.perPage) : 0;
  const canExport = mcQuestions.length > 0 && students.length > 0 && !tooManyQuestions;

  const updateStudents = (next) => setQuiz({ ...quiz, omrStudents: next });
  const addStudent = () => updateStudents([...students, { id: genStudentId(), name: "", course: "" }]);
  const updateStudent = (id, patch) => updateStudents(students.map(s => s.id === id ? { ...s, ...patch } : s));
  const removeStudent = (id) => updateStudents(students.filter(s => s.id !== id));
  const clearStudents = () => {
    if (students.length && window.confirm("¿Quitar todos los estudiantes de la lista?")) updateStudents([]);
  };

  const loadPasted = () => {
    const lines = pasteText.split("\n").map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const added = lines.map(line => {
      const [namePart, coursePart] = line.split(",");
      return { id: genStudentId(), name: (namePart || line).trim(), course: (coursePart || "").trim() };
    });
    updateStudents([...students, ...added]);
    setPasteText("");
    setShowPaste(false);
  };

  const gridCols = "34px minmax(0, 1fr) 130px 32px";

  return (
    <div>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 20, margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          📄 Hoja de respuestas
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-400)" }}>OMR</span>
        </h2>
        {onClose && (
          <button onClick={onClose} className="qs-btn qs-btn--ghost qs-btn--sm">Desactivar</button>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6, marginBottom: 22 }}>
        Cada estudiante recibe una hoja en PDF con su propio código QR, lista para imprimir y marcar a
        lápiz o esfero. Por ahora solo se exporta el PDF; la lectura automática del escaneo llega en una
        etapa siguiente.
      </p>

      {/* Estudiantes */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>
          👥 Estudiantes <span style={{ color: "var(--ink-400)", fontWeight: 600 }}>({students.length})</span>
        </h3>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={addStudent} className="qs-btn qs-btn--ghost qs-btn--sm">+ Agregar</button>
          <button onClick={() => setShowPaste(v => !v)} className="qs-btn qs-btn--ghost qs-btn--sm">📋 Pegar lista</button>
          {students.length > 0 && (
            <button onClick={clearStudents} className="qs-btn qs-btn--ghost qs-btn--sm" style={{ color: "var(--red-500)" }}>Vaciar</button>
          )}
        </div>
      </div>

      {showPaste && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: "var(--ink-50)", border: "1px solid var(--ink-200)" }}>
          <textarea className="qs-input" value={pasteText} onChange={e => setPasteText(e.target.value)}
            placeholder={"Un estudiante por línea. Opcional: Nombre, Curso\nEj: Ana Pérez, 10A"}
            style={{ minHeight: 96, fontSize: 13, fontFamily: "inherit", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
            <button onClick={loadPasted} className="qs-btn qs-btn--primary qs-btn--sm">Cargar lista</button>
            <button onClick={() => { setShowPaste(false); setPasteText(""); }} className="qs-btn qs-btn--ghost qs-btn--sm">Cancelar</button>
          </div>
        </div>
      )}

      {students.length === 0 ? (
        <div style={{
          padding: 20, borderRadius: 12, border: "1px dashed var(--ink-200)", background: "var(--ink-50)",
          textAlign: "center", fontSize: 13, color: "var(--ink-500)", marginBottom: 22, lineHeight: 1.6,
        }}>
          Aún no hay estudiantes. Agrégalos uno por uno con <b>+ Agregar</b> o pega tu lista completa con <b>📋 Pegar lista</b>.
        </div>
      ) : (
        <div style={{ border: "1px solid var(--ink-200)", borderRadius: 12, overflow: "hidden", marginBottom: 22 }}>
          <div style={{
            display: "grid", gridTemplateColumns: gridCols, gap: 10, padding: "8px 12px",
            background: "var(--ink-50)", fontSize: 11, fontWeight: 800, color: "var(--ink-500)",
            letterSpacing: ".04em", textTransform: "uppercase",
          }}>
            <span>#</span><span>Nombre completo</span><span>Curso</span><span/>
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {students.map((s, i) => (
              <div key={s.id} style={{
                display: "grid", gridTemplateColumns: gridCols, gap: 10, padding: "6px 12px",
                alignItems: "center", borderTop: "1px solid var(--ink-100)",
              }}>
                <span style={{ fontSize: 12, color: "var(--ink-400)" }}>{i + 1}</span>
                <input className="qs-input" style={{ padding: "7px 10px", fontSize: 13 }}
                  placeholder="Nombre y apellido" value={s.name}
                  onChange={e => updateStudent(s.id, { name: e.target.value })} />
                <input className="qs-input" style={{ padding: "7px 10px", fontSize: 13 }}
                  placeholder="Ej: 11B" value={s.course}
                  onChange={e => updateStudent(s.id, { course: e.target.value })} />
                <button onClick={() => removeStudent(s.id)} title="Quitar estudiante" style={{
                  background: "transparent", border: "none", color: "var(--red-500)",
                  cursor: "pointer", fontSize: 18, lineHeight: 1,
                }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resumen de impresión */}
      <div style={{
        background: "rgba(20,184,166,0.08)", border: "1px solid rgba(20,184,166,0.3)",
        borderRadius: 12, padding: 16, marginBottom: 14,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 800, color: "var(--ink-600)", letterSpacing: ".04em",
          marginBottom: 8, textTransform: "uppercase",
        }}>Resumen de impresión</div>
        {mcQuestions.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--red-500)", margin: 0 }}>
            ⚠️ Agrega al menos una pregunta de opción múltiple en la pestaña “📝 Preguntas”.
          </p>
        ) : tooManyQuestions ? (
          <p style={{ fontSize: 13, color: "var(--red-500)", margin: 0, lineHeight: 1.55 }}>
            ⚠️ Este quiz tiene <b>{mcQuestions.length}</b> preguntas de opción múltiple, pero una hoja solo
            tiene espacio para <b>{perSheet}</b>. El Modo Sin Celular no soporta varias hojas por
            estudiante — quita preguntas hasta llegar a {perSheet} o menos en la pestaña “📝 Preguntas”.
          </p>
        ) : students.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-500)", margin: 0 }}>
            Agrega estudiantes para calcular cuántas hojas se imprimirán.
          </p>
        ) : (
          <div style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.8 }}>
            <div><b>{mcQuestions.length}</b> pregunta(s) de opción múltiple de <b>{perSheet}</b> por hoja</div>
            <div>1 hoja por estudiante · <b>{totalSheets}</b> hoja(s) en total · <b>{totalPages}</b> página(s) carta</div>
          </div>
        )}
      </div>

      <button onClick={onExportPDF} className="qs-btn qs-btn--success" disabled={!canExport}
        style={{ width: "100%", whiteSpace: "normal", lineHeight: 1.3 }}>
        📄 Exportar Hoja de Respuesta
      </button>
      <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.55 }}>
        ⚠️ Al imprimir usa 100% de tamaño (NO “ajustar a página”) — el PDF ya trae esta nota impresa en el
        margen de cada hoja.
      </p>
    </div>
  );
}

Object.assign(window, { SHEET_SPEC, colX, rowY, buildOMRAnswerSheetsPDF, OMRReaderPanel });
