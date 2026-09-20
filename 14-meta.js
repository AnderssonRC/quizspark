/* global React, ReactDOM */
// ============================================================
// QuizSpark — META: espacio metacognitivo
// ------------------------------------------------------------
// Acompaña al estudiante en los distintos modos de la plataforma:
// motiva, informa, hace reír o simplemente da un respiro antes de
// empezar. Está pensado como un módulo transversal: NO pertenece a
// ningún modo en particular, cada modo lo invoca cuando le toca.
//
// Por ahora contiene una sola pieza:
//   <window.MetaCountdown mode onDone [seconds] [background] [allowSkip] />
//   Pantalla de cuenta regresiva que se SOBREPONE (overlay a pantalla
//   completa) justo antes de que arranque cualquier modo: quiz,
//   encuesta, taller, sala en vivo y modo sin celular.
// ============================================================

const { useState: useStateMeta, useEffect: useEffectMeta, useMemo: useMemoMeta, useRef: useRefMeta } = React;

// Cómo se presenta cada modo en la cuenta regresiva.
const META_MODE_INFO = {
  quiz:     { emoji: "⚡", title: "Tu quiz empieza en",             bg: "linear-gradient(135deg, #7c3aed, #2e1065)" },
  survey:   { emoji: "💬", title: "Tu encuesta empieza en",         bg: "linear-gradient(135deg, #0891b2, #164e63)" },
  workshop: { emoji: "🛠️", title: "Tu taller empieza en",           bg: "linear-gradient(135deg, #d97706, #451a03)" },
  live:     { emoji: "🎮", title: "La sala en vivo empieza en",     bg: "linear-gradient(135deg, #db2777, #500724)" },
  lectio:   { emoji: "📵", title: "Modo Sin Celular empieza en",    bg: "linear-gradient(135deg, #059669, #022c22)" },
};

// Frases metacognitivas: cortas, en segunda persona, sin sermón.
// Se elige una al azar por pantalla; las de "survey" no hablan de acertar.
const META_PHRASES_COMMON = [
  "Respira. Lee cada pregunta dos veces antes de responder.",
  "Equivocarse también es aprender.",
  "Lo que sabes hoy es más de lo que sabías ayer.",
  "Piensa: ¿qué estrategia me sirvió la última vez?",
  "No compitas con nadie: compite con tu versión de hace un mes.",
  "Si una pregunta se pone difícil, esa es la que más te enseña.",
  "Confía en lo que estudiaste.",
  "Dato: tu cerebro aprende más cuando intenta recordar que cuando relee.",
  "La calma también se entrena. Empieza ahora.",
  "Primero entiende la pregunta; después busca la respuesta.",
];
const META_PHRASES_SURVEY = [
  "Aquí no hay respuestas correctas: tu opinión es la respuesta.",
  "Responde con honestidad; nadie te va a calificar.",
  "Tu punto de vista ayuda a mejorar la clase.",
];
const META_PHRASES_LECTIO = [
  "Sin pantallas por un rato: ojos al frente y lápiz en mano.",
  "Marca con calma: un círculo bien lleno vale más que uno apurado.",
  "Piensa antes de marcar; borrar en papel es más difícil.",
];

function pickMetaPhrase(mode) {
  const pool = mode === "survey" ? META_PHRASES_SURVEY
    : mode === "lectio" ? META_PHRASES_LECTIO
    : META_PHRASES_COMMON;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- Cuenta regresiva ----------
// Props:
//   mode        "quiz" | "survey" | "workshop" | "live" | "lectio"
//   seconds     duración (por defecto 5)
//   onDone      se llama UNA sola vez cuando llega a cero
//   background  fondo opcional (para heredar el color del quiz/taller)
//   allowSkip   muestra "Saltar" (pensado para el docente en proyección)
//   playful     versión para el CELULAR del estudiante: más movimiento
//               (partículas que suben, fondo que respira, anillo que late,
//               pasos que se van encendiendo). La versión sobria es para
//               la proyección del docente.
//
// Partículas de la versión "playful": emojis por modo que flotan hacia
// arriba. Se generan una vez por pantalla (posición/retardo al azar).
const META_PARTICLES = {
  quiz:     ["⚡", "✨", "🎯", "💡", "⭐"],
  survey:   ["💬", "✨", "🗣️", "💭", "⭐"],
  workshop: ["🛠️", "✨", "📐", "💡", "⭐"],
  live:     ["🎮", "✨", "🏆", "⚡", "⭐"],
  lectio:   ["✏️", "✨", "📝", "💡", "⭐"],
};
function makeMetaParticles(mode, n = 14) {
  const set = META_PARTICLES[mode] || META_PARTICLES.quiz;
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    emoji: set[i % set.length],
    left: Math.round(Math.random() * 100),
    size: 16 + Math.round(Math.random() * 22),
    dur: 4 + Math.random() * 5,
    delay: -Math.random() * 8,
    drift: (Math.random() - 0.5) * 60,
  }));
}

function MetaCountdown({ mode = "quiz", seconds = 5, onDone, background, allowSkip = false, playful = false }) {
  const info = META_MODE_INFO[mode] || META_MODE_INFO.quiz;
  const total = Math.max(1, Math.round(seconds));
  const [left, setLeft] = useStateMeta(total);
  const phrase = useMemoMeta(() => pickMetaPhrase(mode), [mode]);
  const particles = useMemoMeta(() => (playful ? makeMetaParticles(mode) : []), [mode, playful]);
  const doneRef = useRefMeta(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone && onDone();
  };

  // Un tick por segundo. Al llegar a 0 se muestra "¡Vamos!" un instante
  // y recién ahí se avisa al modo que puede arrancar.
  useEffectMeta(() => {
    if (left > 0) {
      const id = setTimeout(() => setLeft(l => l - 1), 1000);
      return () => clearTimeout(id);
    }
    const id = setTimeout(finish, 650);
    return () => clearTimeout(id);
  }, [left]);

  // Anillo de progreso (SVG): se vacía a medida que baja el contador.
  const R = 54;
  const CIRC = 2 * Math.PI * R;
  const offset = CIRC * (1 - left / total);

  const ringSize = playful ? 190 : 160;
  const isGo = left <= 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900, overflow: "hidden",
      background: background || info.bg, color: "#fff",
      display: "grid", placeItems: "center", padding: 20,
      fontFamily: "var(--font-display, 'Poppins', 'Segoe UI', system-ui, sans-serif)",
      animation: "qs-meta-fade 0.35s ease",
    }}>
      <style>{`
        @keyframes qs-meta-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qs-meta-pop { 0% { transform: scale(0.55); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes qs-meta-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes qs-meta-bounce { 0%,100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-18px) rotate(6deg); } }
        @keyframes qs-meta-breathe { 0%,100% { transform: scale(1); opacity: .55; } 50% { transform: scale(1.35); opacity: .9; } }
        @keyframes qs-meta-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes qs-meta-rise { 0% { transform: translateY(110vh) translateX(0) rotate(0deg); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { transform: translateY(-15vh) translateX(var(--drift)) rotate(360deg); opacity: 0; } }
        @keyframes qs-meta-slideup { from { transform: translateY(24px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes qs-meta-go { 0% { transform: scale(0.4) rotate(-12deg); opacity: 0; } 50% { transform: scale(1.25) rotate(4deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
        @keyframes qs-meta-flash { 0% { opacity: 0; } 30% { opacity: .55; } 100% { opacity: 0; } }
        @keyframes qs-meta-dot { 0% { transform: scale(0.6); } 60% { transform: scale(1.3); } 100% { transform: scale(1); } }
      `}</style>

      {/* Fondo que "respira": dos manchas de luz grandes detrás de todo */}
      {playful && (
        <>
          <div style={{
            position: "absolute", width: 420, height: 420, borderRadius: "50%", left: "-15%", top: "-12%",
            background: "radial-gradient(circle, rgba(255,255,255,0.35), transparent 65%)",
            animation: "qs-meta-breathe 4s ease-in-out infinite", pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", width: 380, height: 380, borderRadius: "50%", right: "-18%", bottom: "-14%",
            background: "radial-gradient(circle, rgba(255,255,255,0.28), transparent 65%)",
            animation: "qs-meta-breathe 5.2s ease-in-out infinite 1.4s", pointerEvents: "none",
          }} />
          {particles.map(p => (
            <div key={p.id} style={{
              position: "absolute", left: p.left + "%", bottom: 0, fontSize: p.size, lineHeight: 1,
              "--drift": p.drift + "px",
              animation: `qs-meta-rise ${p.dur}s linear ${p.delay}s infinite`,
              pointerEvents: "none", opacity: 0, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))",
            }}>{p.emoji}</div>
          ))}
          {/* Destello blanco al llegar a "¡Vamos!" */}
          {isGo && (
            <div style={{ position: "absolute", inset: 0, background: "#fff", animation: "qs-meta-flash 0.7s ease-out forwards", pointerEvents: "none" }} />
          )}
        </>
      )}

      <div style={{ textAlign: "center", maxWidth: 520, width: "100%", position: "relative" }}>
        <div style={{
          fontSize: playful ? 84 : 64, lineHeight: 1, marginBottom: 6,
          filter: "drop-shadow(0 10px 22px rgba(0,0,0,0.35))",
          animation: playful ? "qs-meta-bounce 1.1s ease-in-out infinite" : "qs-meta-float 2.4s ease-in-out infinite",
        }}>{info.emoji}</div>

        <p style={{
          fontSize: playful ? 20 : 18, fontWeight: 700, opacity: 0.95, margin: "0 0 14px", letterSpacing: ".02em",
          textShadow: "0 2px 10px rgba(0,0,0,0.3)",
        }}>
          {info.title}
        </p>

        <div style={{
          position: "relative", width: ringSize, height: ringSize, margin: "0 auto 18px",
          animation: playful && !isGo ? "qs-meta-pulse 1s ease-in-out infinite" : "none",
        }}>
          <svg width={ringSize} height={ringSize} viewBox="0 0 160 160" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}>
            <circle cx="80" cy="80" r={R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="10" />
            {playful && (
              <circle cx="80" cy="80" r={R + 9} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" strokeDasharray="4 8" />
            )}
            <circle cx="80" cy="80" r={R} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1s linear", filter: playful ? "drop-shadow(0 0 6px rgba(255,255,255,0.8))" : "none" }} />
          </svg>
          <div key={left} style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            fontSize: isGo ? (playful ? 40 : 34) : (playful ? 88 : 72), fontWeight: 800, lineHeight: 1,
            textShadow: "0 6px 18px rgba(0,0,0,0.35)",
            animation: isGo && playful ? "qs-meta-go 0.6s cubic-bezier(.2,.9,.3,1.3)" : "qs-meta-pop 0.45s cubic-bezier(.2,.9,.3,1.3)",
          }}>
            {isGo ? "¡Vamos!" : left}
          </div>
        </div>

        {/* Pasos: un punto por segundo, se van encendiendo */}
        {playful && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 18 }}>
            {Array.from({ length: total }, (_, i) => {
              const on = i < total - left;
              return (
                <div key={i} style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: on ? "#fff" : "rgba(255,255,255,0.28)",
                  boxShadow: on ? "0 0 10px rgba(255,255,255,0.9)" : "none",
                  animation: on ? "qs-meta-dot 0.4s ease" : "none",
                  transition: "background 0.3s",
                }} />
              );
            })}
          </div>
        )}

        <p style={{
          fontSize: playful ? 18 : 17, lineHeight: 1.55, fontWeight: 600, margin: "0 auto",
          maxWidth: 420, opacity: 0.97,
          background: "rgba(255,255,255,0.14)", borderRadius: 18, padding: "14px 18px",
          backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.22)",
          animation: playful ? "qs-meta-slideup 0.6s ease 0.25s both" : "none",
        }}>
          💡 {phrase}
        </p>

        {allowSkip && (
          <button onClick={finish} style={{
            marginTop: 22, background: "rgba(255,255,255,0.16)", color: "#fff",
            border: "1px solid rgba(255,255,255,0.35)", borderRadius: 12,
            padding: "10px 18px", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>Saltar →</button>
        )}
      </div>
    </div>
  );
}

window.MetaCountdown = MetaCountdown;

// ---------- Cronómetro del CELULAR con aviso de "queda poco" ----------
// Reemplaza el numerito plano del tiempo en la pregunta del estudiante.
//   · > 10 s: badge normal.
//   · ≤ 10 s: se agranda, se pone ámbar y late.
//   · ≤ 5 s:  más grande aún, rojo, con "latido" en cada segundo y un
//             borde rojo pulsante en toda la pantalla (no tapa nada:
//             pointer-events none), para que el estudiante lo note aunque
//             esté mirando las opciones.
function MetaTimerBadge({ secondsLeft, paused = false, style }) {
  const s = Math.max(0, Math.ceil(Number(secondsLeft) || 0));
  const low = !paused && s <= 10;
  const critical = !paused && s <= 5;
  const bg = paused ? "var(--amber-400)" : critical ? "#dc2626" : low ? "#f59e0b" : "white";
  const color = paused ? "#7c2d12" : (critical || low) ? "#fff" : "var(--violet-700)";
  return (
    <>
      <style>{`
        @keyframes qs-timer-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
        @keyframes qs-timer-beat { 0% { transform: scale(1.45); } 40% { transform: scale(0.96); } 70% { transform: scale(1.08); } 100% { transform: scale(1); } }
        @keyframes qs-timer-vignette { from { opacity: .35; } to { opacity: .9; } }
      `}</style>
      <span key={critical ? "c" + s : low ? "l" : "n"} style={{
        display: "inline-block", background: bg, color,
        padding: critical ? "8px 18px" : low ? "7px 16px" : "6px 14px",
        borderRadius: 12, fontWeight: 900, fontFamily: "var(--font-display)",
        fontSize: critical ? 30 : low ? 22 : 15, lineHeight: 1,
        boxShadow: critical ? "0 0 0 4px rgba(220,38,38,.35), 0 8px 24px rgba(220,38,38,.5)" : low ? "0 6px 18px rgba(245,158,11,.45)" : "none",
        animation: critical ? "qs-timer-beat .55s cubic-bezier(.2,.9,.3,1.2)" : low ? "qs-timer-pulse 1s ease-in-out infinite" : "none",
        transition: "background .3s, font-size .25s, padding .25s",
        ...style,
      }}>
        {paused ? "⏸ Pausa" : (critical ? "⏰ " : low ? "⏱ " : "") + s + "s"}
      </span>
      {critical && ReactDOM.createPortal(
        <div style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 700,
          boxShadow: "inset 0 0 0 6px rgba(220,38,38,.9), inset 0 0 90px rgba(220,38,38,.55)",
          animation: "qs-timer-vignette .5s ease-in-out infinite alternate",
        }} />,
        document.body
      )}
    </>
  );
}
window.MetaTimerBadge = MetaTimerBadge;

// ---------- Esmigol: mascota guía ----------
// Personaje que aparece en una esquina con un mensaje corto, para
// acompañar/orientar al estudiante en cualquier pantalla (no solo en el
// countdown). Las imágenes viven en la raíz del proyecto, igual que
// apple-touch-icon.png / logo-res-cogitas.png (sin carpeta assets/ propia
// todavía) — versionadas con ?v=1.0.0 para poder invalidar caché al subir
// una expresión nueva sin tocar el número de versión del script en index.html.
const ESMIGOL_ASSET_VERSION = "1.0.0";
const ESMIGOL_EXPRESSIONS = {
  default:         "esmigol-cuerpo-completo.webp",
  "pocotiempo-1":  "esmigol-pocotiempo-1.webp",
  "pensativo-1":   "esmigol-pensativo-1.webp",
  "sorprendido-1": "esmigol-sorprendido-1.webp",
  "feliz-1":       "esmigol-feliz-1.webp",
  "dormido-1":     "esmigol-dormido-1.webp",
  "enojado-1":     "esmigol-enojado-1.webp",
  "confundido-1":  "esmigol-confundido-1.webp",
};
// Lista en el mismo orden en que están guardados los rostros — se usa para
// construir los selectores del editor (17-richtext.js sigue el mismo patrón
// de exponer listas + mapa junto al helper que las resuelve).
const ESMIGOL_EXPRESSION_LIST = [
  { id: "pocotiempo-1",  emoji: "⏰", label: "Poco tiempo" },
  { id: "pensativo-1",   emoji: "🤔", label: "Pensativo" },
  { id: "sorprendido-1", emoji: "😮", label: "Sorprendido" },
  { id: "feliz-1",       emoji: "😄", label: "Feliz" },
  { id: "dormido-1",     emoji: "😴", label: "Dormido" },
  { id: "enojado-1",     emoji: "😠", label: "Enojado" },
  { id: "confundido-1",  emoji: "😵", label: "Confundido" },
];
function esmigolImageSrc(expression = "default") {
  const file = ESMIGOL_EXPRESSIONS[expression] || ESMIGOL_EXPRESSIONS.default;
  return `${file}?v=${ESMIGOL_ASSET_VERSION}`;
}

// ---------- Dónde aparece en pantalla ----------
const ESMIGOL_POSITIONS = [
  { id: "bottom-right", label: "Abajo · derecha",  icon: "◢" },
  { id: "bottom-left",  label: "Abajo · izquierda", icon: "◣" },
  { id: "top-right",    label: "Arriba · derecha",  icon: "◥" },
  { id: "top-left",     label: "Arriba · izquierda", icon: "◤" },
];
function esmigolPositionStyle(position, offset = 16) {
  const id = ESMIGOL_POSITIONS.some(p => p.id === position) ? position : "bottom-right";
  const style = {};
  style[id.indexOf("top") === 0 ? "top" : "bottom"] = offset;
  style[id.indexOf("left") >= 0 ? "left" : "right"] = offset;
  return style;
}

// ---------- Tipografía y color del texto (editable en el editor) ----------
const ESMIGOL_FONT_OPTIONS = [
  { id: "display", label: "Poppins (por defecto)", value: "var(--font-display, 'Poppins', 'Segoe UI', system-ui, sans-serif)" },
  { id: "fredoka", label: "Fredoka (redondeada)",   value: "'Fredoka', system-ui, sans-serif" },
  { id: "system",  label: "Del sistema",            value: "system-ui, sans-serif" },
  { id: "mono",    label: "Monoespaciada",          value: "ui-monospace, Consolas, monospace" },
];
const ESMIGOL_TEXT_COLORS = ["#1f1300", "#7c3aed", "#dc2626", "#059669", "#d97706", "#0891b2"];
const ESMIGOL_TEXT_ALIGN_OPTIONS = [
  { id: "left",   label: "Izquierda" },
  { id: "center", label: "Centrado" },
];

// ---------- Los tres grupos de frases que se alternan ----------
// Cada frase trae un rostro por defecto (editable frase por frase en el
// editor); "expression" debe ser uno de los ids de ESMIGOL_EXPRESSION_LIST.
const ESMIGOL_TRIGGER_GROUP_ORDER = ["tiempo", "motivacion", "recuerdo", "logro"];
const ESMIGOL_TRIGGER_GROUPS_DEFAULT = {
  tiempo: {
    label: "⏰ Tiempo",
    phrases: [
      { id: "tiempo-1", text: "Corre que te queda poco ¡TIEMPO!",                         expression: "pocotiempo-1" },
      { id: "tiempo-2", text: "¡Ey!, más rápido que se agota el tiempo",                   expression: "pocotiempo-1" },
      { id: "tiempo-3", text: "¡Bu!, te has demorado mucho…",                              expression: "sorprendido-1" },
      { id: "tiempo-4", text: "¿Hasta qué hora? Responde ya…",                             expression: "enojado-1" },
      { id: "tiempo-5", text: "Un caracol es mil veces más rápido, ironía, ¿Entiendes?",   expression: "confundido-1" },
      { id: "tiempo-6", text: "Ey, me dormí al ver que no avanzas…",                       expression: "dormido-1" },
      { id: "tiempo-7", text: "Tardas demasiado",                                          expression: "enojado-1" },
    ],
  },
  motivacion: {
    label: "💪 Motivación",
    phrases: [
      { id: "motivacion-1", text: "Animo… Tú puedes.",                                          expression: "feliz-1" },
      { id: "motivacion-2", text: "Mmmm… Otros se han parado de peores escenarios",              expression: "pensativo-1" },
      { id: "motivacion-3", text: "¿Rendirse? Eso no es una opción…",                            expression: "feliz-1" },
      { id: "motivacion-4", text: "¿Ya entiendes por qué es importante estudiar? Estudia…",      expression: "pensativo-1" },
      { id: "motivacion-5", text: "¡Ey! no es momento para lamentarse",                          expression: "feliz-1" },
    ],
  },
  recuerdo: {
    label: "🧠 Recuerdo",
    phrases: [
      { id: "recuerdo-1", text: "Anota esa pregunta",                                    expression: "pensativo-1" },
      { id: "recuerdo-2", text: "Recuerda…Leer bien importa",                             expression: "pensativo-1" },
      { id: "recuerdo-3", text: "Preguntar no te hace menos… Pregunta",                   expression: "feliz-1" },
      { id: "recuerdo-4", text: "Un paso a la vez: verifica antes de enviar",              expression: "pensativo-1" },
      { id: "recuerdo-5", text: "Memorizar es importante y necesario para comprender",     expression: "pensativo-1" },
    ],
  },
  // Grupo nuevo: felicitación al terminar un quiz con más de la mitad del
  // puntaje (regla propia de Quiz, ver 08-online.js). Separado de
  // "motivacion" porque el tono es distinto: celebrar un logro ya hecho,
  // no empujar a seguir intentando.
  logro: {
    label: "🏆 Logro",
    phrases: [
      { id: "logro-1", text: "¡Excelente! Te luciste en este quiz.",       expression: "feliz-1" },
      { id: "logro-2", text: "¡Wow! Ibas que volabas.",                    expression: "feliz-1" },
      { id: "logro-3", text: "Esa nota se ve muy bien en ti.",             expression: "feliz-1" },
      { id: "logro-4", text: "¡Lo lograste! Esto se ve genial.",           expression: "feliz-1" },
    ],
  },
};
// Configuración completa por defecto de "activadores metacognitivos" — lo
// que trae un quiz que nunca abrió el editor de Esmigol (quiz.metaTriggers).
const ESMIGOL_TRIGGERS_DEFAULT = {
  enabled: true,
  position: "bottom-right",
  imageSize: 120,
  fontFamily: ESMIGOL_FONT_OPTIONS[0].value,
  fontColor: ESMIGOL_TEXT_COLORS[0],
  fontSize: 14,
  textAlign: "left",
  holdSeconds: 4,
  groups: ESMIGOL_TRIGGER_GROUPS_DEFAULT,
};
function esmigolCloneDefaultTriggers() {
  return JSON.parse(JSON.stringify(ESMIGOL_TRIGGERS_DEFAULT));
}
// Elige una frase al azar de un grupo, evitando repetir la anterior si hay
// más de una para elegir. Uso futuro (disparo real en cada modo) y del
// botón "Probar" del editor.
function esmigolPickPhrase(groups, groupId, avoidId) {
  const list = (groups && groups[groupId] && groups[groupId].phrases) || [];
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let pick;
  do { pick = list[Math.floor(Math.random() * list.length)]; } while (pick.id === avoidId);
  return pick;
}

// Máquina de estados simple: "enter" (desliza+fade) → "type" (letra por
// letra) → "hold" (quieto, leyendo) → "exit" (se retira) → desmontado.
const ESMIGOL_TYPE_MS = 28;   // por letra
const ESMIGOL_HOLD_MS = 2200; // pausa tras terminar de escribir (por defecto fuera de los activadores)
const ESMIGOL_EXIT_MS = 380;  // duración de la salida (debe calzar con qs-esmigol-exit)

// Props añadidas para los activadores metacognitivos (todas opcionales,
// compatibles con el ejemplo de uso mínimo de la ronda anterior):
//   position       uno de ESMIGOL_POSITIONS (default "bottom-right")
//   placement      "side" (burbuja al lado, comportamiento original) |
//                  "above" (burbuja ENCIMA de Esmigol, con colita — lo que
//                  piden los activadores)
//   imageSize      alto en px de la imagen (default 120)
//   fontFamily/fontColor/fontSize   tipografía de la burbuja
//   holdMs         cuánto se queda visible ya escrito (default 2200; los
//                  activadores pasan holdSeconds*1000, 4000 por defecto)
//   dismissOnClick si true (default), un clic en cualquier parte del
//                  personaje lo retira de inmediato — "o al darle clic"
//   contained      true para incrustarlo dentro de un contenedor con
//                  position:relative (la mini-simulación de celular del
//                  editor) en vez de position:fixed sobre toda la pantalla
function Esmigol({
  texto = "", visible = true, onCerrar, expression = "default",
  position = "bottom-right", placement = "side",
  imageSize = 120, fontFamily, fontColor, fontSize = 14, textAlign = "left",
  holdMs = ESMIGOL_HOLD_MS, dismissOnClick = true, contained = false,
}) {
  const [phase, setPhase] = useStateMeta(visible ? "enter" : "idle");
  const [shown, setShown] = useStateMeta("");
  const reducedMotion = useMemoMeta(() => {
    try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }, []);

  // Aparecer/ocultar según la prop `visible`.
  useEffectMeta(() => {
    if (visible) { setPhase("enter"); setShown(reducedMotion ? texto : ""); }
    else if (phase !== "idle") setPhase("exit");
  }, [visible]);

  // "enter" es solo la animación de entrada; al terminar pasa a "type".
  useEffectMeta(() => {
    if (phase !== "enter") return;
    const id = setTimeout(() => setPhase("type"), reducedMotion ? 0 : 260);
    return () => clearTimeout(id);
  }, [phase]);

  // Tecleo letra por letra (se salta si hay reduced-motion: el texto ya
  // se puso completo al entrar).
  useEffectMeta(() => {
    if (phase !== "type" || reducedMotion) { if (phase === "type") setPhase("hold"); return; }
    if (shown.length >= texto.length) { setPhase("hold"); return; }
    const id = setTimeout(() => setShown(texto.slice(0, shown.length + 1)), ESMIGOL_TYPE_MS);
    return () => clearTimeout(id);
  }, [phase, shown, texto, reducedMotion]);

  // Tras un momento leyendo, se retira sola (salvo que ya la hayan ocultado
  // o que hagan clic antes — ver `skip`).
  useEffectMeta(() => {
    if (phase !== "hold") return;
    const id = setTimeout(() => setPhase("exit"), holdMs);
    return () => clearTimeout(id);
  }, [phase, holdMs]);

  // "exit" desmonta al terminar la animación y avisa con onCerrar.
  useEffectMeta(() => {
    if (phase !== "exit") return;
    const id = setTimeout(() => { setPhase("idle"); onCerrar && onCerrar(); }, reducedMotion ? 0 : ESMIGOL_EXIT_MS);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === "idle") return null;
  const exiting = phase === "exit";
  // Clic en el personaje: se retira ya (desde cualquier fase activa), sin
  // esperar los 4 segundos — así el useEffect de "hold" de arriba queda
  // cancelado automáticamente al cambiar `phase`.
  const skip = () => { if (!dismissOnClick || phase === "exit") return; setPhase("exit"); };

  const above = placement === "above";
  const isLeft = String(position).indexOf("left") >= 0;
  const posStyle = esmigolPositionStyle(position, contained ? 8 : 16);
  // De qué lado entra/sale: desde el borde de pantalla más cercano a la
  // esquina elegida, para que nunca "aparezca" cruzando toda la pantalla.
  const dx = isLeft ? -40 : 40;
  const font = fontFamily || ESMIGOL_FONT_OPTIONS[0].value;
  const color = fontColor || ESMIGOL_TEXT_COLORS[0];

  return (
    <div onClick={skip} style={{
      position: contained ? "absolute" : "fixed", ...posStyle, zIndex: 850,
      pointerEvents: dismissOnClick ? "auto" : "none",
      cursor: dismissOnClick ? "pointer" : "default",
    }}>
      <style>{`
        @keyframes qs-esmigol-enter { from { transform: translateX(var(--esmigol-dx, 40px)); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes qs-esmigol-exit { from { transform: translateX(0); opacity: 1; } to { transform: translateX(var(--esmigol-dx, 40px)); opacity: 0; } }
        @keyframes qs-esmigol-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes qs-esmigol-caret { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        @media (max-width: 480px) {
          /* Móvil: SIEMPRE burbuja encima de la imagen, sin importar el
             modo elegido en el editor — el DOM va [burbuja, (colita), imagen],
             así que "column" (no "column-reverse") deja la burbuja arriba. */
          .qs-esmigol-wrap { flex-direction: column !important; align-items: center !important; gap: 6px !important; }
          /* Antes esto era un 92px fijo que tapaba SIEMPRE el tamaño
             configurado en el editor (por eso "en el celular no se agranda
             mucho" aunque en el editor sí). Ahora respeta el tamaño
             elegido, con un tope para que no invada una pantalla chica. */
          .qs-esmigol-img { height: min(var(--esmigol-img-size, 120px), 140px) !important; }
        }
      `}</style>

      <div className="qs-esmigol-wrap" style={{
        "--esmigol-dx": dx + "px",
        // El tamaño configurado en el editor viaja como variable CSS para
        // que la regla de móvil (abajo) pueda usarlo con min() en vez de
        // taparlo con un número fijo — así si el docente lo agranda, en el
        // celular también se nota más grande (con un tope para no invadir
        // la pantalla).
        "--esmigol-img-size": imageSize + "px",
        display: "flex",
        flexDirection: above ? "column" : (isLeft ? "row-reverse" : "row"),
        alignItems: above ? "center" : "flex-end",
        gap: above ? 6 : 10,
        animation: reducedMotion
          ? `qs-esmigol-${exiting ? "exit" : "enter"} 0.01s linear forwards`
          : `qs-esmigol-${exiting ? "exit" : "enter"} ${exiting ? ESMIGOL_EXIT_MS : 320}ms ease both`,
      }}>
        <div className="qs-esmigol-bubble" role="status" aria-live="polite" style={{
          maxWidth: 240, background: "#fff", color,
          borderRadius: 16, padding: "10px 14px", fontSize, fontWeight: 600, lineHeight: 1.4,
          boxShadow: "0 8px 22px rgba(0,0,0,0.25)",
          fontFamily: font, textAlign: textAlign === "center" ? "center" : "left",
        }}>
          {(reducedMotion ? texto : shown) || " "}
          {!reducedMotion && phase === "type" && (
            <span aria-hidden="true" style={{ animation: "qs-esmigol-caret 0.9s step-end infinite" }}>▍</span>
          )}
        </div>

        {/* Colita del globo, solo cuando la burbuja va ENCIMA del personaje */}
        {above && (
          <div aria-hidden="true" style={{
            width: 0, height: 0, margin: "-4px 0 -2px",
            borderLeft: "7px solid transparent", borderRight: "7px solid transparent",
            borderTop: "8px solid #fff",
          }} />
        )}

        <img
          className="qs-esmigol-img"
          src={esmigolImageSrc(expression)}
          alt="Esmigol, el perrito guía de Desafíate, saludando"
          style={{
            height: "var(--esmigol-img-size)", width: "auto", display: "block",
            filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.35))",
            animation: reducedMotion ? "none" : "qs-esmigol-bob 2.4s ease-in-out infinite",
          }}
        />
      </div>
    </div>
  );
}
window.Esmigol = Esmigol;

// ---------- Selector visual de rostro (con miniaturas REALES) ----------
// Se usa en el editor de activadores: en vez de un <select> de solo texto,
// muestra la imagen de miniatura ya elegida y, al abrir, una cuadrícula con
// las 7 miniaturas reales — así se ve de una vez qué imagen acompaña a cada
// frase, no solo su nombre. Con portal a document.body (mismo patrón que
// OMRStudentPicker en 13c-omr-results.js) para que el menú nunca quede
// recortado por el scroll del modal que lo contiene.
function EsmigolExpressionPicker({ value, onChange, size = 30 }) {
  const btnRef = useRefMeta(null);
  const [open, setOpen] = useStateMeta(false);
  const [rect, setRect] = useStateMeta(null);
  const list = ESMIGOL_EXPRESSION_LIST;
  const current = list.find(e => e.id === value) || list[0];

  const openMenu = () => {
    if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(true);
  };
  const pick = (id) => { onChange(id); setOpen(false); };

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : openMenu())}
        title={current.label} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 4px",
          borderRadius: 10, border: "1px solid var(--ink-200)", background: "var(--ink-50)", cursor: "pointer",
        }}>
        <img src={esmigolImageSrc(current.id)} alt={current.label}
          style={{ width: size, height: size, objectFit: "contain" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-600)" }}>▾</span>
      </button>

      {open && window.ReactDOM && ReactDOM.createPortal(
        <>
          {/* Capa invisible: cerrar al hacer clic afuera */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div className="qs-card" style={{
            position: "fixed",
            top: rect ? Math.min(rect.bottom + 4, window.innerHeight - 190) : 0,
            left: rect ? Math.min(rect.left, window.innerWidth - 200) : 0,
            width: 190, zIndex: 9999, padding: 10,
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
          }}>
            {list.map(ex => (
              <button key={ex.id} type="button" onClick={() => pick(ex.id)} title={ex.label} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: 4, borderRadius: 10, cursor: "pointer",
                background: ex.id === value ? "var(--violet-100)" : "transparent",
                border: "2px solid " + (ex.id === value ? "var(--violet-500)" : "transparent"),
              }}>
                <img src={esmigolImageSrc(ex.id)} alt={ex.label} style={{ width: 40, height: 40, objectFit: "contain" }} />
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ink-600)", textAlign: "center", lineHeight: 1.15 }}>{ex.label}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}
window.EsmigolExpressionPicker = EsmigolExpressionPicker;

window.ESMIGOL_EXPRESSIONS = ESMIGOL_EXPRESSIONS;
window.ESMIGOL_EXPRESSION_LIST = ESMIGOL_EXPRESSION_LIST;
window.ESMIGOL_POSITIONS = ESMIGOL_POSITIONS;
window.ESMIGOL_FONT_OPTIONS = ESMIGOL_FONT_OPTIONS;
window.ESMIGOL_TEXT_COLORS = ESMIGOL_TEXT_COLORS;
window.ESMIGOL_TEXT_ALIGN_OPTIONS = ESMIGOL_TEXT_ALIGN_OPTIONS;
window.ESMIGOL_TRIGGER_GROUP_ORDER = ESMIGOL_TRIGGER_GROUP_ORDER;
window.ESMIGOL_TRIGGERS_DEFAULT = ESMIGOL_TRIGGERS_DEFAULT;
window.esmigolCloneDefaultTriggers = esmigolCloneDefaultTriggers;
window.esmigolPickPhrase = esmigolPickPhrase;
window.esmigolImageSrc = esmigolImageSrc;

// ============================================================
// MOTOR DE REGLAS DE APARICIÓN (transversal a todos los modos)
// ------------------------------------------------------------
// Las tres reglas base viven AQUÍ una sola vez (antes estaban copiadas
// dentro del Taller); cada modo solo aporta sus propias "señales"
// (pregunta actual, cuándo arrancó, cómo calcular si la nota va muy baja)
// y el motor decide cuándo mostrar a Esmigol.
//
//   Regla 1 "tiempo":      lleva más de ~1:15 sin cambiar de pregunta.
//   Regla 2 "motivacion":  cada 5 minutos desde que arrancó.
//   Regla 3 "recuerdo":    nota muy baja (el modo decide cómo se calcula;
//                          si el modo no pasa `lowGrade`, esta regla se
//                          omite — así Encuesta, por ejemplo, no la usa).
//
// AGREGAR UNA REGLA NUEVA — dos formas, sin tocar este archivo:
//   1) Solo para un modo: pasarla en `rules` al llamar useEsmigolTriggers.
//   2) Para TODOS los modos a la vez, desde cualquier archivo (incluso
//      uno nuevo que se cargue después): window.esmigolRegisterRule({...}).
// Forma de una regla:
//   {
//     id: "identificador-único",
//     group: "tiempo" | "motivacion" | "recuerdo",  // qué frase alterna
//     once: true,        // (opcional, default true) solo se dispara una vez
//     cooldownMs: 0,      // (opcional) o en vez de "once", espaciarla
//     modes: ["quiz","survey","workshop","lectio"], // (opcional) limitar a
//                          // ciertos modos; si se omite, aplica a todos
//     test(ctx) { return true/false; },
//       // ctx = { mode, live, now, startedAt, questionId,
//       //         elapsedOnQuestionMs, elapsedTotalMs }
//   }
// Ejemplo real (pégalo en cualquier archivo cargado después de 14-meta.js):
//   window.esmigolRegisterRule({
//     id: "diez-minutos-sin-parar", group: "motivacion", cooldownMs: 600000,
//     test: (ctx) => ctx.elapsedTotalMs > 0 && ctx.elapsedTotalMs % 600000 < 5000,
//   });
const ESMIGOL_SLOW_MS = 75000;             // "un minuto o 1:30" → punto medio
const ESMIGOL_MOTIVATE_MS = 5 * 60 * 1000; // "cada cinco minutos"
const ESMIGOL_LOW_GRADE_RATIO = 0.4;       // "nota muy baja" → menos del 40%
const ESMIGOL_LOW_GRADE_MIN = 2;           // con al menos 2 respuestas calificables

const ESMIGOL_CUSTOM_RULES = [];
// Registro público de reglas nuevas — ver el bloque de comentarios de
// arriba para la forma exacta. Se puede llamar desde cualquier archivo,
// en cualquier momento (incluso antes de que exista ningún quiz en pantalla).
function esmigolRegisterRule(rule) {
  if (!rule || !rule.id || typeof rule.test !== "function") {
    console.error("Regla de Esmigol inválida (necesita id y test):", rule);
    return;
  }
  const i = ESMIGOL_CUSTOM_RULES.findIndex(r => r.id === rule.id);
  if (i >= 0) ESMIGOL_CUSTOM_RULES[i] = rule; else ESMIGOL_CUSTOM_RULES.push(rule);
}
window.esmigolRegisterRule = esmigolRegisterRule;
window.ESMIGOL_CUSTOM_RULES = ESMIGOL_CUSTOM_RULES;

// Hook principal. Cada modo lo llama con sus propias señales y solo
// necesita renderizar `.node` en algún punto de su árbol.
//   mode         "quiz" | "survey" | "workshop" | "lectio" (= quiz.mode)
//   cfg          quiz.metaTriggers (o el objeto por defecto si no existe)
//   active       ¿debe vigilar ahora mismo? (false en pantallas de espera,
//                resultados, lobby, etc. — así no dispara fuera de lugar)
//   questionId   cambia → reinicia el reloj de la regla 1
//   startedAt    marca de tiempo (ms) en que arrancó la actividad
//   lowGrade     () => boolean — el modo decide cómo calcularlo; si se
//                omite, la regla 3 queda desactivada para ese modo
//   rules        reglas EXTRA propias de este modo (ver comentario arriba)
//   live         true si es una sesión de sala en vivo (informativo, va en ctx)
function useEsmigolTriggers({ mode, cfg, active, questionId, startedAt, lowGrade, rules, live = false }) {
  const enabled = !!cfg && cfg.enabled !== false;
  const [phrase, setPhrase] = useStateMeta(null);
  const lastPhraseIdRef = useRefMeta(null);
  const questionEnteredAtRef = useRefMeta(Date.now());
  const slowNudgedRef = useRefMeta(new Set());
  const lastMotivateAtRef = useRefMeta(null);
  const lowGradeFiredRef = useRefMeta(false);
  const firedOnceRef = useRefMeta({});     // por id de regla extra → ya disparó ("once")
  const lastFiredAtRef = useRefMeta({});   // por id de regla extra → último disparo (cooldownMs)
  // Las funciones/arreglos que llegan por props suelen ser literales nuevos
  // en cada render (una arrow function, un array inline); se guardan en
  // refs para que el intervalo de abajo no tenga que recrearse a cada rato
  // y siempre lea la versión más reciente.
  const lowGradeRef = useRefMeta(lowGrade); lowGradeRef.current = lowGrade;
  const rulesRef = useRefMeta(rules); rulesRef.current = rules;
  // `cfg` llega recalculado (objeto NUEVO) en cada render — por ejemplo
  // esmigolConfigFor() arma un objeto de fusión distinto cada vez que se
  // llama. Si ese objeto entrara en las dependencias del reloj de abajo,
  // el intervalo se destruiría y volvería a crear en CADA render (el
  // examen re-renderiza ~1 vez por segundo por el cronómetro), y el tick
  // de 5 s nunca llegaría a completarse — Esmigol dejaría de aparecer por
  // completo. Por eso se lee por esta ref, igual que lowGrade/rules.
  const cfgRef = useRefMeta(cfg); cfgRef.current = cfg;

  useEffectMeta(() => { questionEnteredAtRef.current = Date.now(); }, [questionId]);

  // DIAGNÓSTICO TEMPORAL: registra en la consola (F12) cada intento de
  // mostrar a Esmigol y por qué no se mostró, si fue el caso. Se puede
  // quitar una vez confirmado qué está pasando.
  const fire = (groupId) => {
    const c = cfgRef.current;
    if (!c) { console.warn("[Esmigol] fire('" + groupId + "') bloqueado: sin configuración (cfg vacío)"); return false; }
    if (c.enabled === false) { console.warn("[Esmigol] fire('" + groupId + "') bloqueado: enabled=false en quiz.metaTriggers"); return false; }
    if (!c.groups) { console.warn("[Esmigol] fire('" + groupId + "') bloqueado: cfg.groups no existe"); return false; }
    if (!window.esmigolPickPhrase) { console.warn("[Esmigol] fire('" + groupId + "') bloqueado: esmigolPickPhrase no cargó"); return false; }
    const p = window.esmigolPickPhrase(c.groups, groupId, lastPhraseIdRef.current);
    if (!p) { console.warn("[Esmigol] fire('" + groupId + "') bloqueado: el grupo '" + groupId + "' no tiene frases", c.groups[groupId]); return false; }
    lastPhraseIdRef.current = p.id;
    console.info("[Esmigol] ✅ mostrando frase del grupo '" + groupId + "':", p.text);
    setPhrase(p);
    return true;
  };

  useEffectMeta(() => {
    if (!active || !enabled) { console.info("[Esmigol] reloj NO armado (active=" + active + ", enabled=" + enabled + ")"); return; }
    console.info("[Esmigol] reloj armado (revisa reglas cada 5s) para questionId=" + questionId);
    const tick = () => {
      if (phrase) return; // ya hay un mensaje en pantalla: no encimar otro
      const now = Date.now();
      const elapsedOnQuestionMs = now - questionEnteredAtRef.current;
      const elapsedTotalMs = startedAt ? now - startedAt : 0;

      // Regla 1: tarda mucho sin cambiar de pregunta/paso.
      if (questionId != null && !slowNudgedRef.current.has(questionId) && elapsedOnQuestionMs >= ESMIGOL_SLOW_MS) {
        slowNudgedRef.current.add(questionId);
        if (fire("tiempo")) return;
      }

      // Regla 3: nota muy baja (si el modo la ofrece).
      if (!lowGradeFiredRef.current && typeof lowGradeRef.current === "function") {
        let isLow = false;
        try { isLow = !!lowGradeRef.current(); } catch (e) { isLow = false; }
        if (isLow) {
          lowGradeFiredRef.current = true;
          if (fire("recuerdo")) return;
        }
      }

      // Reglas extra: las propias del modo + las registradas globalmente
      // (filtradas por `modes`, si las traen).
      const ctx = { mode, live, now, startedAt, questionId, elapsedOnQuestionMs, elapsedTotalMs };
      const extra = [...(rulesRef.current || []), ...ESMIGOL_CUSTOM_RULES]
        .filter(r => !r.modes || r.modes.includes(mode));
      for (const r of extra) {
        const once = r.once !== false; // por defecto true
        if (once && firedOnceRef.current[r.id]) continue;
        if (r.cooldownMs && lastFiredAtRef.current[r.id] && (now - lastFiredAtRef.current[r.id]) < r.cooldownMs) continue;
        let hit = false;
        try { hit = !!r.test(ctx); } catch (e) { console.error("Error en regla de Esmigol '" + r.id + "':", e); }
        if (!hit) continue;
        if (once) firedOnceRef.current[r.id] = true;
        lastFiredAtRef.current[r.id] = now;
        if (fire(r.group || "recuerdo")) return;
      }

      // Regla 2: motivar cada cinco minutos desde que arrancó.
      const base = lastMotivateAtRef.current || startedAt || now;
      if (startedAt && (now - base) >= ESMIGOL_MOTIVATE_MS) {
        lastMotivateAtRef.current = now;
        fire("motivacion");
      }
    };
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [active, enabled, mode, live, questionId, startedAt, phrase]);

  const dismiss = () => setPhrase(null);
  // Disparo puntual, para eventos exactos (se acabó el tiempo, terminó la
  // actividad...) en vez de esperar al siguiente tick de 5 s. Respeta el
  // mismo "no encimar mensajes": si ya hay uno en pantalla, no hace nada.
  const fireNow = (groupId) => {
    if (phrase) { console.warn("[Esmigol] fireNow('" + groupId + "') ignorado: ya hay un mensaje en pantalla", phrase); return false; }
    console.info("[Esmigol] fireNow('" + groupId + "') llamado (enabled=" + enabled + ")");
    return fire(groupId);
  };
  const node = (phrase && enabled && window.Esmigol) ? (
    <Esmigol
      texto={phrase.text}
      expression={phrase.expression}
      position={cfg?.position || "bottom-right"}
      placement="above"
      imageSize={cfg?.imageSize || 120}
      fontFamily={cfg?.fontFamily}
      fontColor={cfg?.fontColor}
      fontSize={cfg?.fontSize || 14}
      textAlign={cfg?.textAlign || "left"}
      holdMs={(cfg?.holdSeconds || 4) * 1000}
      onCerrar={dismiss}
    />
  ) : null;

  return { phrase, dismiss, node, fireNow };
}
window.useEsmigolTriggers = useEsmigolTriggers;
window.ESMIGOL_SLOW_MS = ESMIGOL_SLOW_MS;
window.ESMIGOL_MOTIVATE_MS = ESMIGOL_MOTIVATE_MS;
window.ESMIGOL_LOW_GRADE_RATIO = ESMIGOL_LOW_GRADE_RATIO;
window.ESMIGOL_LOW_GRADE_MIN = ESMIGOL_LOW_GRADE_MIN;

// Config efectiva de un quiz: lo que configuró el docente, o los valores
// por defecto si nunca abrió el editor de Esmigol. Cada modo debería usar
// esto en vez de leer quiz.metaTriggers directamente.
function esmigolConfigFor(quiz) {
  const saved = quiz && quiz.metaTriggers;
  if (!saved) return ESMIGOL_TRIGGERS_DEFAULT;
  // Completar con los grupos por defecto los que falten: una configuración
  // guardada ANTES de que existiera un grupo nuevo (p. ej. "logro") no lo
  // trae, y sin este relleno esa regla fallaría en silencio para siempre
  // en ese quiz aunque el catálogo se actualice después. Los grupos que sí
  // están guardados (con las frases propias del docente) se respetan tal cual.
  const groups = { ...ESMIGOL_TRIGGERS_DEFAULT.groups, ...(saved.groups || {}) };
  return { ...ESMIGOL_TRIGGERS_DEFAULT, ...saved, groups };
}
window.esmigolConfigFor = esmigolConfigFor;
