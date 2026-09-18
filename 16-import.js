/* global React */
// ============================================================
// QuizSpark — IMPORTAR PREGUNTAS (editor, todos los modos)
// ------------------------------------------------------------
// Dos formatos de entrada:
//   1. Excel / CSV: plantilla descargable con una fila por pregunta.
//      Se lee con SheetJS, que se descarga BAJO DEMANDA (no pesa en el
//      arranque de la app).
//   2. Texto con comandos (.txt o pegado): "P:" pregunta, "A:".."F:"
//      opciones (la correcta lleva *), "T:" tiempo, "OK:" respuestas
//      aceptadas, "R:" retroalimentación, "D:" diapositiva, etc.
//      Se interpreta aquí mismo, sin librerías.
//
// Ambos caminos producen el mismo formato intermedio ("raw") y de ahí
// se construyen preguntas EXACTAMENTE como las crea addQuestion() en el
// editor (03-creator.js), adaptadas al modo del quiz (quiz / encuesta /
// taller / sin celular). Nada se guarda hasta que el docente confirma.
// ============================================================

const { useState: useStateImp, useEffect: useEffectImp, useRef: useRefImp } = React;

// ---------- SheetJS bajo demanda ----------
const XLSX_CDN = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
let _xlsxPromise = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (_xlsxPromise) return _xlsxPromise;
  _xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = XLSX_CDN;
    s.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("La librería de Excel no cargó."));
    s.onerror = () => reject(new Error("No se pudo descargar la librería de Excel. Revisa la conexión."));
    document.head.appendChild(s);
  });
  _xlsxPromise.catch(() => { _xlsxPromise = null; });
  return _xlsxPromise;
}

// ---------- Utilidades ----------
const impNorm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const IMP_OPT_IDS = "abcdefgh";

// Alias de tipos (en español y en inglés) → tipo interno del editor
const IMP_TYPE_ALIASES = {
  multi:     ["multi", "opcion multiple", "opcion unica", "multiple", "om", "unica", "single", "seleccion unica"],
  truefalse: ["vf", "v/f", "verdadero/falso", "verdadero falso", "verdadero o falso", "truefalse", "true/false", "tf", "falso/verdadero"],
  checks:    ["checks", "seleccion multiple", "varias", "varias correctas", "multiple correcta", "multiselect", "casillas"],
  text:      ["texto", "text", "abierta", "respuesta corta", "corta", "respuesta abierta", "open"],
  order:     ["ordenar", "order", "orden", "secuencia", "ordenamiento"],
  slide:     ["diapositiva", "slide", "info", "informativa", "pantalla"],
  poll:      ["opciones", "poll", "encuesta", "votacion", "voto"],
  scale:     ["escala", "scale", "likert", "escala de acuerdo", "acuerdo"],
  wordcloud: ["nube", "wordcloud", "nube de palabras", "palabras"],
};
function impNormalizeType(t) {
  const n = impNorm(t).replace(/[\[\]]/g, "");
  if (!n) return null;
  for (const [type, aliases] of Object.entries(IMP_TYPE_ALIASES)) {
    if (type === n || aliases.includes(n)) return type;
  }
  return null;
}

function impSplitList(s) {
  const str = String(s ?? "").trim();
  if (!str) return [];
  const sep = str.includes(";") ? ";" : str.includes("|") ? "|" : ",";
  return str.split(sep).map(x => x.trim()).filter(Boolean);
}

function impNum(v) {
  if (v === "" || v == null) return undefined;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

// Interpreta la columna "Correcta(s)" para marcar opciones: letras (A, C),
// números (1, 3) o el texto exacto de la opción. Devuelve índices.
function impResolveCorrect(value, options) {
  let tokens = impSplitList(value);
  // "A C" o "AC" → letras sueltas
  if (tokens.length === 1 && /^[a-h](\s*[a-h])+$/i.test(tokens[0])) tokens = tokens[0].replace(/\s+/g, "").split("");
  const idxs = new Set();
  tokens.forEach(tok => {
    const t = tok.trim();
    if (/^[a-h]$/i.test(t)) { const i = IMP_OPT_IDS.indexOf(t.toLowerCase()); if (i < options.length) idxs.add(i); return; }
    if (/^[1-8]$/.test(t)) { const i = +t - 1; if (i < options.length) idxs.add(i); return; }
    const i = options.findIndex(o => impNorm(o.text) === impNorm(t));
    if (i >= 0) idxs.add(i);
  });
  return [...idxs];
}

function impResolveTrueFalse(value) {
  const n = impNorm(value);
  if (["v", "verdadero", "true", "t", "si", "sí", "1", "cierto"].includes(n)) return "t";
  if (["f", "falso", "false", "no", "0"].includes(n)) return "f";
  return null;
}

// ============================================================
// 1) EXCEL / CSV
// ============================================================
const IMP_HEADERS = [
  "Tipo", "Pregunta", "Opción A", "Opción B", "Opción C", "Opción D", "Opción E", "Opción F",
  "Correcta(s)", "Tiempo (s)", "Puntos acierto", "Puntos error", "Bonus velocidad",
  "Retroalimentación", "Imagen (URL)", "Video (YouTube)",
];
const IMP_TEMPLATE_ROWS = [
  ["multi", "¿Cuál es la capital de Colombia?", "Bogotá", "Medellín", "Cali", "Barranquilla", "", "", "A", 30, 10, 0, 5, "Bogotá es la capital desde 1886.", "", ""],
  ["vf", "El agua hierve a 100 °C al nivel del mar.", "", "", "", "", "", "", "V", 20, 10, 0, 0, "", "", ""],
  ["checks", "¿Cuáles de estos números son primos?", "2", "4", "7", "9", "", "", "A, C", 45, 10, 0, 0, "Un primo solo se divide entre 1 y él mismo.", "", ""],
  ["texto", "¿Quién escribió Cien años de soledad?", "", "", "", "", "", "", "García Márquez; Gabriel García Márquez", 60, 10, 0, 0, "", "", ""],
  ["ordenar", "Ordena los planetas desde el más cercano al Sol", "Mercurio", "Venus", "Tierra", "Marte", "", "", "", 60, 10, 0, 0, "Las opciones van en el ORDEN CORRECTO; el sistema las mezcla.", "", ""],
  ["diapositiva", "Bienvenidos al repaso", "", "", "", "", "", "", "", "", "", "", "", "Lee cada pregunta con calma. En diapositivas, esta columna es el texto de la pantalla.", "", ""],
  ["opciones", "(Encuesta) ¿Qué tema quieres repasar?", "Fracciones", "Geometría", "Estadística", "", "", "", "", 30, "", "", "", "", "", ""],
  ["escala", "(Encuesta) Me sentí preparado para la evaluación", "", "", "", "", "", "", "", 30, "", "", "", "Si dejas las opciones vacías se usa la escala estándar de 5 niveles.", "", ""],
  ["nube", "(Encuesta) Una palabra que describa la clase de hoy", "", "", "", "", "", "", "", 30, "", "", "", "", "", ""],
];
const IMP_INSTRUCTIONS = [
  ["CÓMO LLENAR LA HOJA \"Preguntas\""],
  [""],
  ["• Una fila por pregunta. Borra las filas de ejemplo antes de subir (o déjalas si te sirven)."],
  ["• Tipo: multi (opción múltiple, 1 correcta) · vf (verdadero/falso) · checks (varias correctas) · texto (respuesta corta)"],
  ["         ordenar (secuencia) · diapositiva (solo informativa) · opciones / escala / nube (tipos de ENCUESTA)."],
  ["• Opción A…F: hasta 6 opciones. En \"ordenar\" escríbelas en el ORDEN CORRECTO."],
  ["• Correcta(s): la letra de la opción (A) o varias separadas por coma (A, C). En vf escribe V o F."],
  ["         En \"texto\" pon las respuestas aceptadas separadas por punto y coma (;)."],
  ["• Tiempo (s): segundos para responder. Si lo dejas vacío se usa 60 (300 en Taller)."],
  ["• Puntos acierto / error / Bonus velocidad: opcionales (por defecto 10 / 0 / 0). No aplican en Taller ni Encuesta."],
  ["• Retroalimentación: texto que ve el estudiante al revelar. En diapositivas es el TEXTO de la pantalla."],
  ["• Imagen (URL) y Video (YouTube): opcionales."],
  [""],
  ["El sistema adapta las preguntas al modo del quiz donde las importes:"],
  ["• Encuesta: multi/checks se convierten en \"opciones\" (sin correcta). ordenar no existe en encuesta y se omite."],
  ["• Modo Sin Celular: solo opción múltiple (vf se convierte en multi de dos opciones); el resto se omite."],
  ["• Taller: sin puntajes; tiempo sugerido 300 s."],
  [""],
  ["También puedes subir un .txt con comandos (descarga el ejemplo desde el editor)."],
];

async function impDownloadTemplate() {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([IMP_HEADERS, ...IMP_TEMPLATE_ROWS]);
  ws["!cols"] = [10, 44, 18, 18, 18, 18, 14, 14, 20, 10, 12, 12, 14, 40, 22, 22].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, "Preguntas");
  const wsI = XLSX.utils.aoa_to_sheet(IMP_INSTRUCTIONS);
  wsI["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wsI, "Instrucciones");
  XLSX.writeFile(wb, "plantilla-preguntas-desafiate.xlsx");
}

// Mapea encabezados flexibles → campo interno
function impHeaderKey(h) {
  const n = impNorm(h).replace(/\s+/g, " ");
  if (!n) return null;
  if (n === "tipo" || n === "type") return "type";
  if (["pregunta", "texto", "enunciado", "question", "titulo"].includes(n)) return "text";
  let m = n.match(/^(?:opcion|option|opc|op)?\s*([a-h])$/); if (m) return "opt" + IMP_OPT_IDS.indexOf(m[1]);
  m = n.match(/^(?:opcion|option|opc|op)\s*([1-8])$/); if (m) return "opt" + (+m[1] - 1);
  if (/^correct|^respuesta|^clave/.test(n)) return "correct";
  if (/^tiempo|^segundos|^timer/.test(n)) return "timer";
  if (/^puntos? acierto|^acierto|^puntos$|^points/.test(n)) return "pc";
  if (/^puntos? error|^error|^falla/.test(n)) return "pw";
  if (/^bonus|velocidad/.test(n)) return "pb";
  if (/^retro|^feedback|^explicacion|^comentario/.test(n)) return "feedback";
  if (/^imagen|^image|^img|^foto/.test(n)) return "image";
  if (/^video|^youtube/.test(n)) return "video";
  return null;
}

function impRowsToRaw(rows) {
  // Buscar la fila de encabezados (la primera que tenga "pregunta" o "tipo")
  let hIdx = rows.findIndex(r => r.some(c => ["text", "type"].includes(impHeaderKey(c))));
  if (hIdx < 0) throw new Error("No encontré la fila de encabezados (debe tener una columna \"Pregunta\"). Usa la plantilla.");
  const keys = rows[hIdx].map(impHeaderKey);
  if (!keys.includes("text")) throw new Error("Falta la columna \"Pregunta\".");
  const raws = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => String(c ?? "").trim() === "")) continue;
    const get = (k) => { const i = keys.indexOf(k); return i >= 0 ? row[i] : ""; };
    const options = [];
    for (let k = 0; k < 8; k++) {
      const v = String(get("opt" + k) ?? "").trim();
      if (v) options.push({ text: v, correct: false });
    }
    raws.push({
      line: r + 1,
      type: impNormalizeType(get("type")),
      typeRaw: String(get("type") ?? "").trim(),
      text: String(get("text") ?? "").trim(),
      options,
      correctRaw: String(get("correct") ?? "").trim(),
      timer: impNum(get("timer")),
      pointsCorrect: impNum(get("pc")), pointsWrong: impNum(get("pw")), pointsSpeedBonus: impNum(get("pb")),
      feedback: String(get("feedback") ?? "").trim(),
      image: String(get("image") ?? "").trim(),
      video: String(get("video") ?? "").trim(),
    });
  }
  return raws;
}

async function impParseSpreadsheetFile(file) {
  const XLSX = await loadXlsx();
  let wb;
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    wb = XLSX.read(text, { type: "string" });
  } else {
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, { type: "array" });
  }
  const name = wb.SheetNames.find(n => impNorm(n) === "preguntas") || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  return impRowsToRaw(rows);
}

// ============================================================
// 2) TEXTO CON COMANDOS
// ============================================================
const IMP_TEXT_EXAMPLE = `# Plantilla de preguntas para Desafíate (texto con comandos)
# Las líneas que empiezan con # son comentarios y se ignoran.
#
# P:  nueva pregunta (opción múltiple si no se indica tipo)
#     Tipos: P: [VF] ...   P: [CHECKS] ...   P: [TEXTO] ...   P: [ORDENAR] ...
#            P: [OPCIONES] ...  P: [ESCALA] ...  P: [NUBE] ...   (tipos de encuesta)
# A: B: C: D: E: F:  opciones. La correcta lleva un * al final (o al inicio).
# T: segundos     PTS: acierto/error/bonus     R: retroalimentación
# OK: respuestas aceptadas (respuesta corta), separadas por ;
# IMG: url de imagen      VID: url de YouTube
# D: diapositiva (título); las líneas siguientes son su texto.

P: ¿Cuál es la capital de Colombia?
A: Bogotá *
B: Medellín
C: Cali
D: Barranquilla
T: 30
PTS: 10/0/5
R: Bogotá es la capital desde 1886.

P: [VF] El agua hierve a 100 °C al nivel del mar.
V

P: [CHECKS] ¿Cuáles de estos números son primos?
A: 2 *
B: 4
C: 7 *
D: 9

P: [TEXTO] ¿Quién escribió Cien años de soledad?
OK: García Márquez; Gabriel García Márquez

P: [ORDENAR] Ordena los planetas desde el más cercano al Sol
1: Mercurio
2: Venus
3: Tierra
4: Marte

D: Bienvenidos al repaso
Lee cada pregunta con calma.
Tienes tiempo de sobra.
`;

function impParseCommandText(src) {
  const lines = String(src || "").replace(/\r/g, "").split("\n");
  const raws = [];
  let cur = null;
  const push = () => { if (cur) raws.push(cur); cur = null; };
  const newRaw = (extra) => ({
    line: 0, type: null, typeRaw: "", text: "", options: [], correctRaw: "", accepted: [], body: [],
    ...extra,
  });
  lines.forEach((line, li) => {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("//")) return;
    let m;
    if ((m = t.match(/^(P|PREGUNTA|Q)\s*:\s*(.*)$/i))) {
      push();
      cur = newRaw({ line: li + 1 });
      let rest = m[2].trim();
      const tm = rest.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (tm) { cur.typeRaw = tm[1]; cur.type = impNormalizeType(tm[1]); rest = tm[2]; }
      cur.text = rest.trim();
      return;
    }
    if ((m = t.match(/^(D|DIAPOSITIVA|SLIDE)\s*:\s*(.*)$/i))) {
      push();
      cur = newRaw({ line: li + 1, type: "slide", typeRaw: "diapositiva", text: m[2].trim() });
      return;
    }
    if (!cur) return;
    if ((m = t.match(/^(IMG|IMAGEN)\s*:\s*(.*)$/i))) { cur.image = m[2].trim(); return; }
    if ((m = t.match(/^(VID|VIDEO)\s*:\s*(.*)$/i))) { cur.video = m[2].trim(); return; }
    if (cur.type === "slide") { cur.body.push(t); return; }
    if ((m = t.match(/^(T|TIEMPO)\s*:\s*(\d+)/i))) { cur.timer = +m[2]; return; }
    if ((m = t.match(/^(PTS|PUNTOS)\s*:\s*(.*)$/i))) {
      const nums = m[2].split(/[\/,;\s]+/).map(impNum);
      cur.pointsCorrect = nums[0]; cur.pointsWrong = nums[1]; cur.pointsSpeedBonus = nums[2];
      return;
    }
    if ((m = t.match(/^(R|RETRO|RETROALIMENTACION|RETROALIMENTACIÓN|FEEDBACK)\s*:\s*(.*)$/i))) { cur.feedback = m[2].trim(); return; }
    if ((m = t.match(/^(OK|ACEPTA|ACEPTADAS|RESPUESTAS?)\s*:\s*(.*)$/i))) { cur.accepted = impSplitList(m[2]); if (!cur.type) cur.type = "text"; return; }
    if ((m = t.match(/^(V|VERDADERO|F|FALSO)\s*\*?$/i))) {
      if (!cur.type) cur.type = "truefalse";
      cur.correctRaw = m[1];
      return;
    }
    // Opción: "A: texto", "1) texto", "- texto", "* texto (correcta)"
    if ((m = t.match(/^([A-Ha-h]|[1-8])\s*[:.)\-]\s*(.*)$/)) || (m = t.match(/^([-•*])\s+(.*)$/))) {
      let txt = m[2].trim();
      let correct = m[1] === "*";
      if (/\*\s*$/.test(txt)) { correct = true; txt = txt.replace(/\s*\*\s*$/, ""); }
      if (/^\*\s*/.test(txt)) { correct = true; txt = txt.replace(/^\*\s*/, ""); }
      cur.options.push({ text: txt, correct });
      return;
    }
    // Cualquier otra línea: continuación del enunciado
    cur.text = (cur.text ? cur.text + " " : "") + t;
  });
  push();
  return raws;
}

// ============================================================
// 3) RAW → PREGUNTA DEL EDITOR (según el modo del quiz)
// ============================================================
function impInferType(raw, mode) {
  if (raw.type) return raw.type;
  if (raw.accepted && raw.accepted.length) return "text";
  if (raw.options.length) {
    if (mode === "survey") return "poll";
    const nCorrect = raw.options.filter(o => o.correct).length + (raw.correctRaw ? impResolveCorrect(raw.correctRaw, raw.options).length : 0);
    return nCorrect > 1 ? "checks" : "multi";
  }
  if (impResolveTrueFalse(raw.correctRaw)) return "truefalse";
  return mode === "survey" ? "wordcloud" : "text";
}

// Adapta el tipo al modo. Devuelve { type, note } o { skip: motivo }.
function impAdaptType(type, mode) {
  if (mode === "survey") {
    if (type === "multi" || type === "checks") return { type: "poll", note: "convertida a Opciones (encuesta, sin correcta)" };
    if (type === "order") return { skip: "Ordenar no existe en Encuesta" };
    return { type };
  }
  if (mode === "lectio") {
    if (type === "multi") return { type };
    if (type === "truefalse") return { type: "multi", note: "V/F convertida a opción múltiple" };
    if (type === "poll") return { type: "multi", note: "convertida a opción múltiple (marca la correcta)" };
    return { skip: "el Modo Sin Celular solo admite opción múltiple" };
  }
  // quiz / workshop
  if (type === "poll") return { type: "multi", note: "convertida a opción múltiple (revisa la correcta)" };
  if (type === "wordcloud") return { type: "text", note: "Nube convertida a respuesta corta" };
  if (type === "scale") return { skip: "Escala solo existe en Encuesta" };
  return { type };
}

function impBuildQuestion(raw, mode, i) {
  const warnings = [];
  const text = String(raw.text || "").trim();
  if (!text) return { skip: "sin enunciado" };
  const inferred = impInferType(raw, mode);
  if (raw.typeRaw && !raw.type) warnings.push(`tipo "${raw.typeRaw}" no reconocido; se tomó como ${inferred}`);
  const ad = impAdaptType(inferred, mode);
  if (ad.skip) return { skip: ad.skip };
  if (ad.note) warnings.push(ad.note);
  const type = ad.type;

  const id = `qq-${Date.now()}-${i}`;
  const timer = raw.timer && raw.timer > 0 ? Math.round(raw.timer) : (mode === "workshop" ? 300 : 60);
  const base = mode === "workshop"
    ? { id, text, timer }
    : { id, text, timer, pointsCorrect: raw.pointsCorrect ?? 10, pointsWrong: raw.pointsWrong ?? 0, pointsSpeedBonus: raw.pointsSpeedBonus ?? 0 };
  const extras = {};
  if (raw.feedback && type !== "slide") extras.feedback = raw.feedback;
  if (raw.image) extras.image = raw.image;
  if (raw.video) extras.video = raw.video;

  const optsWith = (withCorrect) => {
    const opts = raw.options.slice(0, 8).map((o, k) => ({ id: IMP_OPT_IDS[k], text: o.text, correct: withCorrect && !!o.correct }));
    if (withCorrect && raw.correctRaw) impResolveCorrect(raw.correctRaw, opts).forEach(ix => { opts[ix].correct = true; });
    return opts;
  };

  let q;
  if (type === "multi" || type === "checks") {
    const opts = optsWith(true);
    if (opts.length < 2) warnings.push("tiene menos de 2 opciones");
    const nC = opts.filter(o => o.correct).length;
    if (nC === 0) warnings.push("no tiene respuesta correcta marcada");
    if (type === "multi" && nC > 1) { warnings.push("varias correctas: se convirtió a Selección múltiple"); q = { ...base, type: "checks", options: opts }; }
    else q = { ...base, type, options: opts };
  } else if (type === "truefalse") {
    const ans = impResolveTrueFalse(raw.correctRaw) || (raw.options.find(o => o.correct) ? impResolveTrueFalse(raw.options.find(o => o.correct).text) : null);
    if (!ans && mode !== "survey") warnings.push("no se indicó si es V o F");
    q = { ...base, type, options: [
      { id: "t", text: "Verdadero", correct: ans === "t" }, { id: "f", text: "Falso", correct: ans === "f" },
    ]};
  } else if (type === "poll") {
    const opts = optsWith(false);
    if (opts.length < 2) warnings.push("tiene menos de 2 opciones");
    q = { ...base, type, options: opts };
  } else if (type === "scale") {
    const labels = raw.options.map(o => o.text);
    q = { ...base, type, scaleLabels: labels.length >= 2 ? labels : [...(window.SCALE_LABELS || SCALE_LABELS)] };
  } else if (type === "wordcloud") {
    q = { ...base, type };
  } else if (type === "order") {
    const items = raw.options.map((o, k) => ({ id: "i" + (k + 1), text: o.text }));
    if (items.length < 2) warnings.push("Ordenar necesita al menos 2 elementos");
    q = { ...base, type, items };
  } else if (type === "slide") {
    const body = raw.body && raw.body.length ? raw.body.join("\n") : (raw.feedback || "");
    q = { id, type: "slide", slideTitle: text, slideBody: body, image: raw.image || "", video: raw.video || "" };
    return { q, warnings };
  } else { // text
    const accepted = (raw.accepted && raw.accepted.length) ? raw.accepted : impSplitList(raw.correctRaw);
    q = { ...base, type: "text", acceptedAnswers: accepted, gradeMode: "live" };
  }
  return { q: { ...q, ...extras }, warnings };
}

function impBuildAll(raws, mode) {
  const questions = [], report = [];
  raws.forEach((raw, i) => {
    const r = impBuildQuestion(raw, mode, i);
    if (r.skip) { report.push({ line: raw.line, text: raw.text, skip: r.skip }); return; }
    questions.push(r.q);
    report.push({ line: raw.line, text: raw.text, type: r.q.type, warnings: r.warnings });
  });
  return { questions, report };
}

function impDownloadText(filename, content) {
  const blob = new Blob(["﻿" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}

const IMP_TYPE_LABEL = {
  multi: "Opción múltiple", truefalse: "V / F", checks: "Selección múltiple", text: "Respuesta corta",
  order: "Ordenar", slide: "Diapositiva", poll: "Opciones", scale: "Escala", wordcloud: "Nube de palabras",
};

// ============================================================
// 4) MODAL DEL EDITOR
// ============================================================
function ImportQuestionsModal({ quiz, onImport, onClose }) {
  const mode = quiz.mode || "quiz";
  const [tab, setTab] = useStateImp("excel");
  const [text, setText] = useStateImp("");
  const [result, setResult] = useStateImp(null);   // { questions, report, source }
  const [busy, setBusy] = useStateImp("");
  const [error, setError] = useStateImp("");
  const fileRef = useRefImp(null);

  // El texto con comandos se interpreta en vivo mientras se escribe
  useEffectImp(() => {
    if (tab !== "text") return;
    if (!text.trim()) { setResult(null); return; }
    try {
      const raws = impParseCommandText(text);
      setResult({ ...impBuildAll(raws, mode), source: "texto" });
      setError("");
    } catch (e) { setError(e.message); }
  }, [text, tab, mode]);

  const handleFile = async (file) => {
    if (!file) return;
    setError(""); setResult(null);
    try {
      if (/\.txt$|\.md$/i.test(file.name)) {
        const t = await file.text();
        setTab("text"); setText(t);
        return;
      }
      setBusy("Leyendo el archivo…");
      const raws = await impParseSpreadsheetFile(file);
      setResult({ ...impBuildAll(raws, mode), source: file.name });
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
    } finally {
      setBusy("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleTemplate = async () => {
    setError("");
    try { setBusy("Preparando la plantilla…"); await impDownloadTemplate(); }
    catch (e) { setError(e.message); }
    finally { setBusy(""); }
  };

  const modeLabel = { quiz: "Quiz", survey: "Encuesta", workshop: "Taller", lectio: "Modo Sin Celular" }[mode] || mode;
  const ok = result ? result.questions.length : 0;
  const skipped = result ? result.report.filter(r => r.skip).length : 0;
  const warnCount = result ? result.report.filter(r => r.warnings && r.warnings.length).length : 0;

  const tabBtn = (id, label) => (
    <button onClick={() => { setTab(id); setResult(null); setError(""); }} style={{
      padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
      background: tab === id ? "var(--violet-600)" : "var(--ink-50)",
      color: tab === id ? "#fff" : "var(--ink-700)",
      border: "1px solid " + (tab === id ? "var(--violet-600)" : "var(--ink-200)"),
    }}>{label}</button>
  );

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(20,16,43,.55)", zIndex: 120,
      display: "grid", placeItems: "center", padding: 16, overflow: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{
        padding: 24, maxWidth: 760, width: "100%", maxHeight: "92vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
          <div>
            <h2 style={{ fontSize: 21, margin: 0 }}>📥 Importar preguntas</h2>
            <p style={{ fontSize: 13, color: "var(--ink-500)", margin: "4px 0 0" }}>
              Se adaptan al modo actual (<b>{modeLabel}</b>). Podrás editarlas una por una después.
            </p>
          </div>
          <button onClick={onClose} className="qs-btn qs-btn--ghost qs-btn--sm">✕</button>
        </div>

        <div style={{ display: "flex", gap: 8, margin: "14px 0" }}>
          {tabBtn("excel", "📊 Excel / CSV")}
          {tabBtn("text", "📝 Texto con comandos")}
        </div>

        {tab === "excel" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ padding: 14, borderRadius: 12, background: "var(--violet-50)", border: "1px solid var(--violet-200)", fontSize: 13, lineHeight: 1.55, color: "var(--ink-900)" }}>
              <b>1.</b> Descarga la plantilla, llénala en Excel (una fila por pregunta; la hoja "Instrucciones" explica cada columna).<br />
              <b>2.</b> Súbela aquí (.xlsx, .xls o .csv). Verás una vista previa antes de agregar nada.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleTemplate} disabled={!!busy} className="qs-btn qs-btn--ghost">⬇️ Descargar plantilla (.xlsx)</button>
              <button onClick={() => fileRef.current && fileRef.current.click()} disabled={!!busy} className="qs-btn qs-btn--primary">📂 Subir archivo…</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files && e.target.files[0])} />
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ padding: 12, borderRadius: 12, background: "var(--violet-50)", border: "1px solid var(--violet-200)", fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-900)", fontFamily: "ui-monospace, Consolas, monospace", whiteSpace: "pre-wrap" }}>
{`P: ¿Cuál es la capital de Colombia?      ← pregunta (P: [VF] / [CHECKS] / [TEXTO] / [ORDENAR] cambia el tipo)
A: Bogotá *                              ← opciones A–F; la correcta lleva *
B: Medellín
T: 30        PTS: 10/0/5                 ← tiempo · puntos acierto/error/bonus (opcionales)
R: Bogotá es la capital desde 1886.      ← retroalimentación (opcional)
OK: resp1; resp2                         ← respuestas aceptadas (respuesta corta)
D: Título de diapositiva                 ← diapositiva; las líneas siguientes son su texto`}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={() => impDownloadText("ejemplo-preguntas-desafiate.txt", IMP_TEXT_EXAMPLE)} className="qs-btn qs-btn--ghost qs-btn--sm">⬇️ Descargar ejemplo (.txt)</button>
              <button onClick={() => setText(IMP_TEXT_EXAMPLE)} className="qs-btn qs-btn--ghost qs-btn--sm">✨ Pegar ejemplo aquí</button>
              <button onClick={() => fileRef.current && fileRef.current.click()} className="qs-btn qs-btn--ghost qs-btn--sm">📂 Subir .txt</button>
              <input ref={fileRef} type="file" accept=".txt,.md,.xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={e => handleFile(e.target.files && e.target.files[0])} />
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} className="qs-input" rows={12}
              placeholder={"P: Escribe aquí tu primera pregunta\nA: opción correcta *\nB: otra opción"}
              style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 13, lineHeight: 1.5, resize: "vertical" }} />
          </div>
        )}

        {busy && <p style={{ fontSize: 13, color: "var(--violet-700)", fontWeight: 600, marginTop: 12 }}>⏳ {busy}</p>}
        {error && (
          <div style={{ marginTop: 12, background: "#fee2e2", color: "#991b1b", padding: 10, borderRadius: 10, fontSize: 13 }}>⚠️ {error}</div>
        )}

        {result && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <span style={{ background: "#d1fae5", color: "#065f46", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>✅ {ok} lista{ok === 1 ? "" : "s"}</span>
              {warnCount > 0 && <span style={{ background: "#fef3c7", color: "#92400e", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>⚠️ {warnCount} para revisar</span>}
              {skipped > 0 && <span style={{ background: "#fee2e2", color: "#991b1b", padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}>⛔ {skipped} omitida{skipped === 1 ? "" : "s"}</span>}
              <span style={{ fontSize: 12, color: "var(--ink-500)" }}>origen: {result.source}</span>
            </div>

            <div style={{ display: "grid", gap: 6, maxHeight: 260, overflowY: "auto", paddingRight: 4 }}>
              {result.report.map((r, i) => (
                <div key={i} style={{
                  display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, fontSize: 13,
                  background: r.skip ? "#fee2e2" : (r.warnings && r.warnings.length ? "#fef3c7" : "var(--ink-50)"),
                  border: "1px solid " + (r.skip ? "#fca5a5" : (r.warnings && r.warnings.length ? "#fcd34d" : "var(--ink-200)")),
                  color: "var(--ink-900)",
                }}>
                  <span style={{ minWidth: 92, fontSize: 11, fontWeight: 800, color: r.skip ? "#991b1b" : "var(--violet-700)", paddingTop: 2 }}>
                    {r.skip ? "OMITIDA" : IMP_TYPE_LABEL[r.type] || r.type}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.text || <i style={{ color: "var(--ink-400)" }}>(sin enunciado)</i>}
                    </div>
                    {r.skip && <div style={{ fontSize: 12, color: "#991b1b" }}>línea {r.line}: {r.skip}</div>}
                    {r.warnings && r.warnings.map((w, k) => <div key={k} style={{ fontSize: 12, color: "#92400e" }}>línea {r.line}: {w}</div>)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, justifyContent: "flex-end" }}>
              <button onClick={onClose} className="qs-btn qs-btn--ghost">Cancelar</button>
              <button disabled={!ok} onClick={() => {
                if (confirm(`¿Reemplazar las ${quiz.questions.length} preguntas actuales por las ${ok} importadas?`)) onImport(result.questions, true);
              }} className="qs-btn qs-btn--ghost" style={{ color: "var(--red-500)", borderColor: "var(--red-500)" }}>🔁 Reemplazar las actuales</button>
              <button disabled={!ok} onClick={() => onImport(result.questions, false)} className="qs-btn qs-btn--primary">
                ➕ Agregar {ok} al quiz
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.ImportQuestionsModal = ImportQuestionsModal;
window.impParseCommandText = impParseCommandText;
window.impBuildAll = impBuildAll;
