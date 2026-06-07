/* global React */
// ============================================================
// QuizSpark — shared atoms: icons, mock data, helpers, store
// ============================================================
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- Icons (inline SVG, stroke-based) ----------
const Icon = ({ d, size = 20, fill = "none", stroke = "currentColor", sw = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d ? <path d={d} /> : children}
  </svg>
);

const I = {
  spark:    (p)=> <Icon {...p}><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z"/></Icon>,
  plus:     (p)=> <Icon d="M12 5v14M5 12h14" {...p}/>,
  play:     (p)=> <Icon {...p}><path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/></Icon>,
  pause:    (p)=> <Icon {...p}><rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/></Icon>,
  check:    (p)=> <Icon d="M5 12.5l4.5 4.5L19 7" {...p}/>,
  x:        (p)=> <Icon d="M6 6l12 12M18 6L6 18" {...p}/>,
  trash:    (p)=> <Icon {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></Icon>,
  copy:     (p)=> <Icon {...p}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></Icon>,
  edit:     (p)=> <Icon d="M4 20h4l10-10-4-4L4 16zM14 6l4 4" {...p}/>,
  bookCopy: (p)=> <Icon {...p}><path d="M5 7a2 2 0 0 0-2 2v11"/><path d="M5.803 18H5a2 2 0 0 0 0 4h9.5a.5.5 0 0 0 .5-.5V21"/><path d="M9 15V4a2 2 0 0 1 2-2h9.5a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H11a2 2 0 0 1 0-4h10"/></Icon>,
  arrowR:   (p)=> <Icon d="M5 12h14M13 6l6 6-6 6" {...p}/>,
  arrowL:   (p)=> <Icon d="M19 12H5M11 6l-6 6 6 6" {...p}/>,
  download: (p)=> <Icon d="M12 4v12M6 12l6 6 6-6M4 21h16" {...p}/>,
  excel:    (p)=> <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16M14 13l4 4M18 13l-4 4"/></Icon>,
  users:    (p)=> <Icon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15 14.5a4.5 4.5 0 0 1 6.5 4"/></Icon>,
  trophy:   (p)=> <Icon {...p}><path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M16 6h3v2a3 3 0 0 1-3 3M8 6H5v2a3 3 0 0 0 3 3M9 17h6M10 17l-1 4h6l-1-4"/></Icon>,
  clock:    (p)=> <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>,
  lock:     (p)=> <Icon {...p}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></Icon>,
  hash:     (p)=> <Icon d="M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16" {...p}/>,
  eye:      (p)=> <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></Icon>,
  sheets:   (p)=> <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18M16 3v18"/></Icon>,
  back:     (p)=> <Icon d="M15 18l-6-6 6-6" {...p}/>,
  list:     (p)=> <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...p}/>,
  bar:      (p)=> <Icon {...p}><path d="M3 21h18"/><rect x="5" y="11" width="3" height="9"/><rect x="11" y="6" width="3" height="14"/><rect x="17" y="14" width="3" height="6"/></Icon>,
  search:   (p)=> <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></Icon>,
  more:     (p)=> <Icon {...p}><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></Icon>,
  share:    (p)=> <Icon {...p}><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8 11l8-4M8 13l8 4"/></Icon>,
  truefalse:(p)=> <Icon {...p}><path d="M5 12l3 3 5-7"/><path d="M15 8l4 4M19 8l-4 4"/></Icon>,
  multi:    (p)=> <Icon {...p}><circle cx="6" cy="7" r="2"/><circle cx="6" cy="17" r="2"/><path d="M11 7h9M11 17h9"/></Icon>,
  checks:   (p)=> <Icon {...p}><rect x="3" y="4" width="6" height="6" rx="1"/><path d="M4 7l1.5 1.5L8 6"/><rect x="3" y="14" width="6" height="6" rx="1"/><path d="M4 17l1.5 1.5L8 16"/><path d="M12 7h9M12 17h9"/></Icon>,
  text:     (p)=> <Icon d="M4 6h16M4 12h10M4 18h16" {...p}/>,
  timer:    (p)=> <Icon {...p}><circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 9v4l2 2"/></Icon>,
  hand:     (p)=> <Icon {...p}><path d="M9 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11"/><path d="M15 11V6a1.5 1.5 0 0 1 3 0v9a6 6 0 0 1-6 6h-1.5a4.5 4.5 0 0 1-4-2.4l-3-5.6a1.5 1.5 0 0 1 2.6-1.5L8 13"/></Icon>,
  star:     (p)=> <Icon {...p}><path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.5 6.8 19.2l1-5.9L3.5 9.2l5.9-.8z"/></Icon>,
  flame:    (p)=> <Icon {...p}><path d="M12 2s4 4 4 8a4 4 0 1 1-8 0c0-1 .5-2 1-2.5C9 9 8 8 8 6c2 0 3 1 4-4z"/></Icon>,
};

// ---------- Mock data ----------
const MOCK_QUIZ = {
  id: "q-001",
  title: "Cultura general — Edición Latam",
  cover: "🌎",
  password: "VOLCAN42",
  roomCode: "8264-19",
  pacing: "manual", // 'timer' or 'manual'
  defaultTimer: 20,
  questions: [
    {
      id: "qq-1",
      type: "multi",
      text: "¿Cuál es la capital de Perú?",
      timer: 20,
      options: [
        { id: "a", text: "Bogotá", correct: false },
        { id: "b", text: "Lima", correct: true },
        { id: "c", text: "Quito", correct: false },
        { id: "d", text: "La Paz", correct: false },
      ],
    },
    {
      id: "qq-2",
      type: "truefalse",
      text: "El río Amazonas atraviesa Argentina.",
      timer: 15,
      options: [
        { id: "t", text: "Verdadero", correct: false },
        { id: "f", text: "Falso", correct: true },
      ],
    },
    {
      id: "qq-3",
      type: "checks",
      text: "Selecciona los países que comparten frontera con Brasil.",
      timer: 30,
      options: [
        { id: "a", text: "Colombia", correct: true },
        { id: "b", text: "Chile", correct: false },
        { id: "c", text: "Perú", correct: true },
        { id: "d", text: "Uruguay", correct: true },
      ],
    },
    {
      id: "qq-4",
      type: "text",
      text: "¿Qué moneda se usa en Costa Rica?",
      timer: 25,
      acceptedAnswers: ["colón", "colones", "colón costarricense"],
    },
  ],
};

const MOCK_PARTICIPANTS = [
  { id: "p1",  name: "Mariana",  avatar: "🦊", score: 0, streak: 0 },
  { id: "p2",  name: "Diego",    avatar: "🐼", score: 0, streak: 0 },
  { id: "p3",  name: "Sofía",    avatar: "🦄", score: 0, streak: 0 },
  { id: "p4",  name: "Andrés",   avatar: "🐯", score: 0, streak: 0 },
  { id: "p5",  name: "Lucía",    avatar: "🐸", score: 0, streak: 0 },
  { id: "p6",  name: "Camilo",   avatar: "🦁", score: 0, streak: 0 },
  { id: "p7",  name: "Valentina",avatar: "🐙", score: 0, streak: 0 },
  { id: "p8",  name: "Mateo",    avatar: "🐧", score: 0, streak: 0 },
  { id: "p9",  name: "Isabella", avatar: "🐨", score: 0, streak: 0 },
  { id: "p10", name: "Julián",   avatar: "🦉", score: 0, streak: 0 },
  { id: "p11", name: "Renata",   avatar: "🐰", score: 0, streak: 0 },
  { id: "p12", name: "Tomás",    avatar: "🐺", score: 0, streak: 0 },
];

// Pre-computed plausible session results (used in results screen)
const MOCK_RESULTS = (() => {
  // Each participant has an answer matrix and final score
  const seed = MOCK_PARTICIPANTS.map((p, i) => {
    const hash = (i * 13 + 7) % 16; // deterministic
    const answers = MOCK_QUIZ.questions.map((q, qi) => {
      const r = (hash + qi * 5) % 9;
      const correct = r < 6; // ~66% accuracy
      const time = 3 + ((r * 1.7) % 14);
      return { qid: q.id, correct, time: +time.toFixed(1) };
    });
    const correctCount = answers.filter(a => a.correct).length;
    const score = answers.reduce((acc, a) =>
      acc + (a.correct ? Math.round(800 + (1 - a.time / 20) * 400) : 0), 0);
    return { ...p, answers, score, correctCount };
  });
  return seed.sort((a, b) => b.score - a.score);
})();

// ---------- Helpers ----------
const QUESTION_TYPES = [
  { id: "multi",     label: "Opción múltiple",   icon: "multi",     desc: "Una respuesta correcta" },
  { id: "truefalse", label: "Verdadero / Falso", icon: "truefalse", desc: "Dos opciones" },
  { id: "checks",    label: "Selección múltiple",icon: "checks",    desc: "Varias correctas" },
  { id: "text",      label: "Respuesta corta",   icon: "text",      desc: "Texto libre" },
  { id: "order",     label: "Ordenar",           icon: "list",      desc: "Ordenar elementos en secuencia" },
  { id: "slide",     label: "Diapositiva",       icon: "eye",       desc: "Solo informativa, no se califica" },
];

// Tipos de pregunta para el MODO ENCUESTA (sin respuesta correcta, no califica)
const SURVEY_TYPES = [
  { id: "poll",      label: "Opciones",          icon: "bar",   desc: "Vota una opción; se muestra la distribución" },
  { id: "wordcloud", label: "Nube de palabras",  icon: "hash",  desc: "Respuesta libre; las más repetidas crecen" },
  { id: "scale",     label: "Escala de acuerdo", icon: "list",  desc: "De muy en desacuerdo a muy de acuerdo" },
  { id: "text",      label: "Respuesta abierta", icon: "text",  desc: "Cada estudiante escribe su propia respuesta" },
  { id: "slide",     label: "Diapositiva",       icon: "eye",   desc: "Pantalla informativa (no se responde)" },
];

// Etiquetas por defecto para la escala de acuerdo (modo encuesta)
const SCALE_LABELS = [
  "Muy en desacuerdo", "En desacuerdo", "Neutral", "De acuerdo", "Muy de acuerdo",
];

const tileColor = (idx) => ["var(--tile-1)", "var(--tile-2)", "var(--tile-3)", "var(--tile-4)"][idx % 4];
const tileShape = (idx) => ["▲", "◆", "●", "■"][idx % 4];

// Extrae el ID de un enlace de YouTube (varias formas: watch?v=, youtu.be/, embed/, shorts/)
function youtubeId(url) {
  if (!url) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,        // youtube.com/watch?v=ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,    // youtu.be/ID
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/, // /embed/ID
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/, // /shorts/ID
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// Make any of these globals
Object.assign(window, {
  I, MOCK_QUIZ, MOCK_PARTICIPANTS, MOCK_RESULTS,
  QUESTION_TYPES, SURVEY_TYPES, SCALE_LABELS, tileColor, tileShape, youtubeId,
  useState, useEffect, useRef, useMemo, useCallback,
});
