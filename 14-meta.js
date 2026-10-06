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
// Nombres de archivo: "esmigol-<emoción>.webp", en minúsculas y sin espacios
// (el servidor distingue mayúsculas y un espacio rompe la URL).
const ESMIGOL_ASSET_VERSION = "2.0.0";
const ESMIGOL_EXPRESSIONS = {
  default:          "esmigol-alegre.webp",
  "alegre":         "esmigol-alegre.webp",
  "retador":        "esmigol-retador.webp",
  "sorprendido":    "esmigol-sorprendido.webp",
  "enojado":        "esmigol-enojado.webp",
  "triste":         "esmigol-triste.webp",
  "sin-tiempo":     "esmigol-sin-tiempo.webp",
  "empieza-a-leer": "esmigol-empieza-a-leer.webp",
  "pensativo":      "esmigol-pensativo.webp",
  "explorador":     "esmigol-explorador.webp",
  "aburrido":       "esmigol-aburrido.webp",
};
// Rostros de la primera versión (sus imágenes ya no existen). Las frases
// guardadas en Firestore todavía pueden traer estos ids: se muestran con
// el rostro nuevo más parecido en vez de una imagen rota.
const ESMIGOL_EXPRESSION_ALIASES = {
  "pocotiempo-1":  "sin-tiempo",
  "pensativo-1":   "pensativo",
  "sorprendido-1": "sorprendido",
  "feliz-1":       "alegre",
  "dormido-1":     "aburrido",
  "enojado-1":     "enojado",
  "confundido-1":  "pensativo",
};
function esmigolExpressionId(expression) {
  if (ESMIGOL_EXPRESSIONS[expression]) return expression;
  return ESMIGOL_EXPRESSION_ALIASES[expression] || "default";
}
// Lista en el mismo orden en que están guardados los rostros — se usa para
// construir los selectores del editor (17-richtext.js sigue el mismo patrón
// de exponer listas + mapa junto al helper que las resuelve).
const ESMIGOL_EXPRESSION_LIST = [
  { id: "alegre",         emoji: "😄", label: "Alegre" },
  { id: "retador",        emoji: "😏", label: "Retador" },
  { id: "sorprendido",    emoji: "😮", label: "Sorprendido" },
  { id: "enojado",        emoji: "😠", label: "Enojado" },
  { id: "triste",         emoji: "😢", label: "Triste" },
  { id: "sin-tiempo",     emoji: "⏰", label: "Sin tiempo" },
  { id: "empieza-a-leer", emoji: "📖", label: "Empieza a leer" },
  { id: "pensativo",      emoji: "🤔", label: "Pensativo" },
  { id: "explorador",     emoji: "🧭", label: "Explorador" },
  { id: "aburrido",       emoji: "😴", label: "Aburrido" },
];
function esmigolImageSrc(expression = "default") {
  const file = ESMIGOL_EXPRESSIONS[esmigolExpressionId(expression)];
  return `${file}?v=${ESMIGOL_ASSET_VERSION}`;
}

// ---------- Dónde aparece en pantalla ----------
// "bottom-center" (abajo, en la mitad) es la posición por defecto: no
// tapa la pregunta. "Arriba · centro" y las esquinas quedan como
// alternativas. (Hubo un "center" a media pantalla que se retiró porque
// tapaba todo; si alguna config lo trae, se trata como "bottom-center".)
const ESMIGOL_POSITIONS = [
  { id: "bottom-center", label: "Abajo · centro",        icon: "▼" },
  { id: "top-center",    label: "Arriba · centro",       icon: "▲" },
  { id: "bottom-right",  label: "Abajo · derecha",       icon: "◢" },
  { id: "bottom-left",   label: "Abajo · izquierda",     icon: "◣" },
  { id: "top-right",     label: "Arriba · derecha",      icon: "◥" },
  { id: "top-left",      label: "Arriba · izquierda",    icon: "◤" },
];
const ESMIGOL_DEFAULT_POSITION = "bottom-center";
function esmigolIsCentered(position) {
  return position === "top-center" || position === "bottom-center"
    || !ESMIGOL_POSITIONS.some(p => p.id === position); // desconocida/"center" → abajo centro
}
function esmigolPositionStyle(position, offset = 16) {
  const id = ESMIGOL_POSITIONS.some(p => p.id === position) ? position : ESMIGOL_DEFAULT_POSITION;
  if (id === "top-center") return { top: offset, left: "50%", transform: "translateX(-50%)" };
  if (id === "bottom-center") return { bottom: offset, left: "50%", transform: "translateX(-50%)" };
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

// ---------- Grupos de frases (uno por situación) ----------
// Cada frase trae un rostro por defecto (editable frase por frase en el
// editor); "expression" debe ser uno de los ids de ESMIGOL_EXPRESSION_LIST.
// El tono de cada frase va con su rostro: triste = pide calma y leer bien,
// enojado = regaña, retador = provoca ("a ver si puedes"), etc.
//   tiempo      se quedó sin tiempo / tarda mucho → Sin tiempo, Enojado
//   recuerdo    va mal después de dos preguntas    → Enojado, Retador, Triste
//   racha       más de 3 aciertos seguidos         → Retador, Sorprendido
//   repaso      terminó y le fue mal               → Triste, Enojado, Empieza a leer
//   logro       terminó (o va) muy bien            → Alegre, Retador
//   motivacion  al empezar / cada 5 minutos        → Explorador, Pensativo, Alegre
// Al cambiar estas frases base, subir ESMIGOL_PHRASES_VERSION (ver
// esmigolConfigFor) para que las configs ya guardadas las reciban.
const ESMIGOL_PHRASES_VERSION = 3;
//   docenteVivo lo envía el docente a mano desde el tablero de la sala en
//               vivo (retar, motivar, "los observamos") → Retador, Alegre…
const ESMIGOL_TRIGGER_GROUP_ORDER = ["tiempo", "recuerdo", "racha", "repaso", "logro", "motivacion", "docenteVivo"];
const ESMIGOL_TRIGGER_GROUPS_DEFAULT = {
  tiempo: {
    label: "⏰ Tiempo",
    phrases: [
      { id: "tiempo-1", text: "¡Se acabó el tiempo! El reloj no espera a nadie.",   expression: "sin-tiempo" },
      { id: "tiempo-2", text: "Tic, tac… la próxima responde antes.",               expression: "sin-tiempo" },
      { id: "tiempo-3", text: "¡Corre! El tiempo vuela y tú sigues pensando.",      expression: "sin-tiempo" },
      { id: "tiempo-4", text: "¿En serio? Te quedaste sin tiempo otra vez…",        expression: "enojado" },
      { id: "tiempo-5", text: "¿Hasta qué hora? ¡Responde ya!",                     expression: "enojado" },
    ],
  },
  recuerdo: {
    label: "🧠 Recuerdo",
    phrases: [
      { id: "recuerdo-1", text: "Ayúdate un poco, lee bien.",                               expression: "triste" },
      { id: "recuerdo-2", text: "Me pones triste… respira y vuelve a leer la pregunta.",    expression: "triste" },
      { id: "recuerdo-3", text: "¡Otra vez no! Lee con calma antes de marcar.",             expression: "enojado" },
      { id: "recuerdo-4", text: "¿Estudiaste o viniste a adivinar?",                         expression: "enojado" },
      { id: "recuerdo-5", text: "¿Eso es todo lo que tienes? Demuéstrame lo contrario.",    expression: "retador" },
      { id: "recuerdo-6", text: "Apuesto a que tampoco aciertas la siguiente… ¿o sí?",      expression: "retador" },
    ],
  },
  racha: {
    label: "🔥 Racha",
    phrases: [
      { id: "racha-1", text: "A ver si continúa esa racha (no creo).",          expression: "retador" },
      { id: "racha-2", text: "¿Cuatro seguidas? Seguro la próxima fallas…",     expression: "retador" },
      { id: "racha-3", text: "Suerte de principiante… demuéstrame que no.",     expression: "retador" },
      { id: "racha-4", text: "¡¿Qué?! No me esperaba tantas seguidas.",         expression: "sorprendido" },
      { id: "racha-5", text: "Wow… ¿quién te enseñó tanto?",                    expression: "sorprendido" },
    ],
  },
  repaso: {
    label: "📚 Repaso",
    phrases: [
      { id: "repaso-1", text: "Esta vez no salió… ayúdate un poco y repasa.",   expression: "triste" },
      { id: "repaso-2", text: "Me dejaste triste. La próxima lee con calma.",   expression: "triste" },
      { id: "repaso-3", text: "Esto no me gustó nada. ¡A estudiar!",            expression: "enojado" },
      { id: "repaso-4", text: "Abre el cuaderno: la próxima será distinta.",    expression: "empieza-a-leer" },
      { id: "repaso-5", text: "Leer un poco más hoy es acertar mañana.",        expression: "empieza-a-leer" },
    ],
  },
  logro: {
    label: "🏆 Logro",
    phrases: [
      { id: "logro-1", text: "¡Excelente! Te luciste en este quiz.",                expression: "alegre" },
      { id: "logro-2", text: "¡Lo lograste! Esto se ve genial.",                    expression: "alegre" },
      { id: "logro-3", text: "Esa nota se ve muy bien en ti.",                      expression: "alegre" },
      { id: "logro-4", text: "Nada mal… pero el próximo será más difícil.",         expression: "retador" },
      { id: "logro-5", text: "Ganaste esta. ¿Te atreves con la siguiente?",         expression: "retador" },
    ],
  },
  motivacion: {
    label: "💪 Motivación",
    phrases: [
      { id: "motivacion-1", text: "¡A explorar! Cada pregunta es un camino nuevo.",  expression: "explorador" },
      { id: "motivacion-2", text: "¿Rendirse? Eso no es una opción.",                expression: "explorador" },
      { id: "motivacion-3", text: "Piensa con calma: ¿qué sabes de esto?",           expression: "pensativo" },
      { id: "motivacion-4", text: "Mmm… otros han salido de peores escenarios.",     expression: "pensativo" },
      { id: "motivacion-5", text: "¡Ánimo! Tú puedes.",                              expression: "alegre" },
    ],
  },
  // No lo dispara ningún momento automático: el docente elige la frase y
  // la envía en directo desde el tablero de la sala en vivo (09-live.js).
  docenteVivo: {
    label: "🎙️ Docente en vivo",
    phrases: [
      { id: "docenteVivo-1", text: "Yo y el profe los observamos, ojo con hacer trampa.",   expression: "retador" },
      { id: "docenteVivo-2", text: "El profe dice: ¡a ver quién acierta esta!",              expression: "retador" },
      { id: "docenteVivo-3", text: "¿Muy fácil? El profe guardó la difícil para el final.",  expression: "retador" },
      { id: "docenteVivo-4", text: "El profe está orgulloso de este grupo. ¡Sigan así!",     expression: "alegre" },
      { id: "docenteVivo-5", text: "¡Ánimo! El profe confía en ustedes.",                    expression: "alegre" },
      { id: "docenteVivo-6", text: "Lean con calma, el profe no tiene afán.",                expression: "pensativo" },
      { id: "docenteVivo-7", text: "Se acaba el tiempo… ¡el profe está contando!",           expression: "sin-tiempo" },
    ],
  },
};
// ---------- Dónde puede aparecer (modos de la plataforma) ----------
// La clave es la que usa el motor: `live ? "live" : mode` (ver
// esmigolModeKey). "Sala en vivo" cubre quiz y encuesta en vivo.
const ESMIGOL_MODE_LIST = [
  { id: "quiz",     emoji: "⚡", label: "Quiz online",          desc: "Examen con enlace, cada estudiante a su ritmo" },
  { id: "survey",   emoji: "💬", label: "Encuesta online",      desc: "Encuesta con enlace (no califica)" },
  { id: "workshop", emoji: "🛠️", label: "Taller evaluativo",   desc: "Taller paso a paso" },
  { id: "live",     emoji: "🎮", label: "Sala en vivo",         desc: "Quiz o encuesta en vivo, en el celular del estudiante" },
  { id: "lectio",   emoji: "📵", label: "Modo Sin Celular",     desc: "Presentación proyectada por el docente" },
];
function esmigolModeKey(mode, live) {
  return live ? "live" : (mode || "quiz");
}

// ---------- Cuándo aparece (momentos) ----------
// Cada momento dispara un grupo de frases. `modes` = en qué modos existe
// ese momento (según las señales que cada modo le da al motor); sirve para
// mostrarle al docente dónde puede aparecer cada uno. `defaultOn: false`
// = momento nuevo que no existía antes y queda apagado hasta activarlo.
const ESMIGOL_MOMENT_LIST = [
  { id: "inicio",      emoji: "🚀", label: "Al empezar la actividad",               group: "motivacion", modes: ["quiz", "survey", "workshop", "live", "lectio"], defaultOn: false },
  { id: "lento",       emoji: "🐢", label: "Tarda mucho en una pregunta (~1:15)",    group: "tiempo",     modes: ["quiz", "survey", "workshop", "live", "lectio"] },
  { id: "sinTiempo",   emoji: "⏰", label: "Se quedó sin tiempo sin responder",                     group: "tiempo",     modes: ["quiz", "live"] },
  { id: "vaMal",       emoji: "📉", label: "Va mal después de dos preguntas (menos de la mitad)",   group: "recuerdo",   modes: ["quiz", "workshop", "live"] },
  { id: "racha",       emoji: "🔥", label: "Racha de más de 3 aciertos seguidos",                   group: "racha",      modes: ["quiz", "workshop", "live"] },
  { id: "vaBien",      emoji: "📈", label: "Va muy bien (80 % o más de aciertos)",                  group: "logro",      modes: ["quiz", "workshop", "live"] },
  { id: "periodico",   emoji: "🔁", label: "Cada 5 minutos, para dar ánimo",                        group: "motivacion", modes: ["quiz", "survey", "workshop", "live", "lectio"] },
  { id: "finalBien",   emoji: "🏆", label: "Al terminar, si le fue bien (más de la mitad)",         group: "logro",      modes: ["quiz", "live"] },
  { id: "finalMal",    emoji: "📚", label: "Al terminar, si le fue mal (la mitad o menos)",         group: "repaso",     modes: ["quiz", "live"] },
  { id: "docenteVivo", emoji: "🎙️", label: "Cuando el docente lo envía en vivo desde el tablero",  group: "docenteVivo", modes: ["live"] },
];
const ESMIGOL_MODES_DEFAULT = ESMIGOL_MODE_LIST.reduce((o, m) => { o[m.id] = true; return o; }, {});
const ESMIGOL_MOMENTS_DEFAULT = ESMIGOL_MOMENT_LIST.reduce((o, m) => { o[m.id] = m.defaultOn !== false; return o; }, {});

// Configuración completa por defecto de "activadores metacognitivos".
// Desde el dashboard el docente la edita UNA vez para todos sus quizzes
// (users/{uid}.esmigolConfig); al guardar se copia a quiz.metaTriggers de
// cada quiz, que es lo que lee el estudiante (sin sesión, no puede leer
// la colección users).
const ESMIGOL_TRIGGERS_DEFAULT = {
  enabled: true,
  modes: ESMIGOL_MODES_DEFAULT,
  moments: ESMIGOL_MOMENTS_DEFAULT,
  position: ESMIGOL_DEFAULT_POSITION,
  // 2 = ya existe la posición "center". Una config sin esta marca que
  // traiga "bottom-right" (el antiguo valor por defecto) se muestra
  // centrada; ver esmigolConfigFor.
  layoutVersion: 2,
  phrasesVersion: ESMIGOL_PHRASES_VERSION,
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
// Elige una frase al azar de un grupo, evitando las ya usadas en esta
// sesión (para que Esmigol no repita frase mientras tenga otras sin usar
// en ese grupo). `avoid` acepta un solo id (compatibilidad con el botón
// "Probar" del editor) o un Set con varios ids (uso real en cada modo).
// Si ya se usaron todas las del grupo, se reinicia el ciclo con el grupo
// completo en vez de quedarse sin frase.
function esmigolPickPhrase(groups, groupId, avoid) {
  const list = (groups && groups[groupId] && groups[groupId].phrases) || [];
  if (!list.length) return null;
  const avoidSet = avoid instanceof Set ? avoid : new Set(avoid ? [avoid] : []);
  let pool = list.filter(p => !avoidSet.has(p.id));
  if (!pool.length) pool = list; // ya se usaron todas: reiniciar el ciclo
  if (pool.length === 1) return pool[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

// Máquina de estados simple: "enter" (desliza+fade) → "type" (letra por
// letra) → "hold" (quieto, leyendo) → "exit" (se retira) → desmontado.
const ESMIGOL_TYPE_MS = 28;   // por letra
const ESMIGOL_HOLD_MS = 2200; // pausa tras terminar de escribir (por defecto fuera de los activadores)
const ESMIGOL_EXIT_MS = 380;  // duración de la salida (debe calzar con qs-esmigol-exit)

// Props añadidas para los activadores metacognitivos (todas opcionales,
// compatibles con el ejemplo de uso mínimo de la ronda anterior):
//   position       uno de ESMIGOL_POSITIONS (default "center")
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
  position = ESMIGOL_DEFAULT_POSITION, placement = "side",
  imageSize = 120, fontFamily, fontColor, fontSize = 14, textAlign = "left",
  holdMs = ESMIGOL_HOLD_MS, dismissOnClick = true, contained = false,
  bubbleMaxWidth, // opcional: ancho máximo de la burbuja (la vista previa lo escala)
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
  const centered = esmigolIsCentered(position);
  const isLeft = !centered && String(position).indexOf("left") >= 0;
  const posStyle = esmigolPositionStyle(position, contained ? 8 : 16);
  // De qué lado entra/sale: desde el borde de pantalla más cercano a la
  // esquina elegida, para que nunca "aparezca" cruzando toda la pantalla.
  // Centrado: entra desde el borde de abajo (o de arriba si va arriba),
  // creciendo desde el 85 %.
  const dx = centered ? 0 : (isLeft ? -40 : 40);
  const dy = centered ? (position === "top-center" ? -40 : 40) : 0;
  const s0 = centered ? 0.85 : 1;
  // La burbuja crece junto con la imagen, para que una frase larga no
  // quede apretada al lado de un Esmigol grande.
  const bubbleMax = bubbleMaxWidth || Math.max(240, Math.round(imageSize * 1.8));
  const font = fontFamily || ESMIGOL_FONT_OPTIONS[0].value;
  const color = fontColor || ESMIGOL_TEXT_COLORS[0];

  return (
    <div className="qs-esmigol-outer" onClick={skip} style={{
      position: contained ? "absolute" : "fixed", ...posStyle, zIndex: 850,
      pointerEvents: dismissOnClick ? "auto" : "none",
      cursor: dismissOnClick ? "pointer" : "default",
    }}>
      <style>{`
        @keyframes qs-esmigol-enter { from { transform: translate(var(--esmigol-dx, 40px), var(--esmigol-dy, 0px)) scale(var(--esmigol-s0, 1)); opacity: 0; } to { transform: none; opacity: 1; } }
        @keyframes qs-esmigol-exit { from { transform: none; opacity: 1; } to { transform: translate(var(--esmigol-dx, 40px), var(--esmigol-dy, 0px)) scale(var(--esmigol-s0, 1)); opacity: 0; } }
        @keyframes qs-esmigol-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        @keyframes qs-esmigol-caret { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
        @media (max-width: 480px) {
          /* Móvil: en vez de quedar pegado a una esquina (poco espacio,
             se ve recortado), la caja completa se centra horizontalmente,
             conservando si va arriba o abajo según lo configurado. */
          .qs-esmigol-outer {
            left: 50% !important; right: auto !important;
            transform: translateX(-50%);
          }
          /* Móvil: SIEMPRE burbuja encima de la imagen, sin importar el
             modo elegido en el editor — el DOM va [burbuja, (colita), imagen],
             así que "column" (no "column-reverse") deja la burbuja arriba. */
          .qs-esmigol-wrap { flex-direction: column !important; align-items: center !important; gap: 6px !important; }
          /* Respeta el tamaño elegido en el editor; el único tope es que
             no pase del 40 % del alto de la pantalla (antes había un tope
             fijo de 200px que dejaba igual los tamaños grandes). */
          .qs-esmigol-img { height: min(var(--esmigol-img-size, 120px), 40vh) !important; }
        }
      `}</style>

      <div className="qs-esmigol-wrap" style={{
        "--esmigol-dx": dx + "px",
        "--esmigol-dy": dy + "px",
        "--esmigol-s0": s0,
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
          maxWidth: `min(${bubbleMax}px, 88vw)`, background: "#fff", color,
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
  const current = list.find(e => e.id === esmigolExpressionId(value)) || list[0];

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
            top: rect ? Math.min(rect.bottom + 4, window.innerHeight - 270) : 0,
            left: rect ? Math.min(rect.left, window.innerWidth - 200) : 0,
            width: 190, zIndex: 9999, padding: 10,
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
          }}>
            {list.map(ex => (
              <button key={ex.id} type="button" onClick={() => pick(ex.id)} title={ex.label} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                padding: 4, borderRadius: 10, cursor: "pointer",
                background: ex.id === current.id ? "var(--violet-100)" : "transparent",
                border: "2px solid " + (ex.id === current.id ? "var(--violet-500)" : "transparent"),
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
window.ESMIGOL_MODE_LIST = ESMIGOL_MODE_LIST;
window.ESMIGOL_MOMENT_LIST = ESMIGOL_MOMENT_LIST;
window.esmigolModeKey = esmigolModeKey;
window.esmigolCloneDefaultTriggers = esmigolCloneDefaultTriggers;
window.esmigolPickPhrase = esmigolPickPhrase;
window.esmigolImageSrc = esmigolImageSrc;
window.esmigolExpressionId = esmigolExpressionId;

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
//     moment: "vaMal",     // (opcional) id de ESMIGOL_MOMENT_LIST: si el
//                          // docente apaga ese momento, la regla no dispara
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
const ESMIGOL_LOW_GRADE_RATIO = 0.5;       // "va mal" → menos de la mitad de aciertos
const ESMIGOL_LOW_GRADE_MIN = 2;           // después de al menos 2 respuestas calificables
const ESMIGOL_STREAK_MIN = 3;              // "racha superior a 3" → 4 o más aciertos seguidos
const ESMIGOL_HIGH_GRADE_RATIO = 0.8;      // "va muy bien" → 80% o más de aciertos
const ESMIGOL_HIGH_GRADE_MIN = 3;          // con al menos 3 respuestas calificables

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
//   highGrade    () => boolean — igual que lowGrade pero para "va muy
//                bien" (regla 4, felicita con el grupo "logro"); si se
//                omite, esa regla queda desactivada para ese modo
//   streak       () => number — aciertos seguidos hasta ahora (el modo
//                decide cómo contarlos); al pasar de ESMIGOL_STREAK_MIN
//                sale el grupo "racha". Una vez por racha: si la racha se
//                corta y vuelve a crecer, puede salir de nuevo
//   rules        reglas EXTRA propias de este modo (ver comentario arriba)
//   live         true si es una sesión de sala en vivo (informativo, va en ctx)
function useEsmigolTriggers({ mode, cfg, active, questionId, startedAt, lowGrade, highGrade, streak, rules, live = false }) {
  // Apagado en general, o apagado solo en este modo (pestaña "Dónde
  // aparece" del editor del dashboard).
  const enabled = !!cfg && cfg.enabled !== false
    && !(cfg.modes && cfg.modes[esmigolModeKey(mode, live)] === false);
  const [phrase, setPhrase] = useStateMeta(null);
  // Ids de TODAS las frases ya mostradas en esta sesión (no solo la
  // anterior): así Esmigol no repite frase mientras el grupo tenga otras
  // sin usar (ver esmigolPickPhrase).
  const usedPhraseIdsRef = useRefMeta(new Set());
  const questionEnteredAtRef = useRefMeta(Date.now());
  const slowNudgedRef = useRefMeta(new Set());
  const lastMotivateAtRef = useRefMeta(null);
  const lowGradeFiredRef = useRefMeta(false);
  const highGradeFiredRef = useRefMeta(false);
  const startFiredRef = useRefMeta(false);
  const firedOnceRef = useRefMeta({});     // por id de regla extra → ya disparó ("once")
  const lastFiredAtRef = useRefMeta({});   // por id de regla extra → último disparo (cooldownMs)
  // Las funciones/arreglos que llegan por props suelen ser literales nuevos
  // en cada render (una arrow function, un array inline); se guardan en
  // refs para que el intervalo de abajo no tenga que recrearse a cada rato
  // y siempre lea la versión más reciente.
  const lowGradeRef = useRefMeta(lowGrade); lowGradeRef.current = lowGrade;
  const highGradeRef = useRefMeta(highGrade); highGradeRef.current = highGrade;
  const streakRef = useRefMeta(streak); streakRef.current = streak;
  const streakFiredRef = useRefMeta(false); // ya saludó a la racha actual
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

  // ¿El docente dejó activo este momento? (pestaña "Cuándo aparece").
  // Sin `moments` guardados (config vieja) se usan los valores por defecto.
  const momentOn = (momentId) => {
    if (!momentId) return true;
    const m = cfgRef.current && cfgRef.current.moments;
    const v = m && m[momentId];
    return v === undefined ? ESMIGOL_MOMENTS_DEFAULT[momentId] !== false : v !== false;
  };

  const fire = (groupId, momentId) => {
    const c = cfgRef.current;
    if (!c || c.enabled === false || !c.groups || !window.esmigolPickPhrase) return false;
    if (c.modes && c.modes[esmigolModeKey(mode, live)] === false) return false;
    if (!momentOn(momentId)) return false;
    const p = window.esmigolPickPhrase(c.groups, groupId, usedPhraseIdsRef.current);
    if (!p) return false;
    usedPhraseIdsRef.current.add(p.id);
    setPhrase({ ...p, _key: Date.now() });
    return true;
  };

  // Momento "inicio": una sola vez, poco después de que la actividad
  // arranca (tras la cuenta regresiva), sin esperar al tick de 5 s.
  useEffectMeta(() => {
    if (!active || !enabled || startFiredRef.current) return;
    const id = setTimeout(() => {
      startFiredRef.current = true;
      fire("motivacion", "inicio");
    }, 1500);
    return () => clearTimeout(id);
  }, [active, enabled]);

  useEffectMeta(() => {
    if (!active || !enabled) return;
    const tick = () => {
      if (phrase) return; // ya hay un mensaje en pantalla: no encimar otro
      const now = Date.now();
      const elapsedOnQuestionMs = now - questionEnteredAtRef.current;
      const elapsedTotalMs = startedAt ? now - startedAt : 0;

      // Regla 1: tarda mucho sin cambiar de pregunta/paso.
      if (questionId != null && !slowNudgedRef.current.has(questionId) && elapsedOnQuestionMs >= ESMIGOL_SLOW_MS) {
        slowNudgedRef.current.add(questionId);
        if (fire("tiempo", "lento")) return;
      }

      // Racha: más de ESMIGOL_STREAK_MIN aciertos seguidos (si el modo la
      // ofrece). Se rearma cuando la racha se corta.
      if (typeof streakRef.current === "function") {
        let s = 0;
        try { s = Number(streakRef.current()) || 0; } catch (e) { s = 0; }
        if (s <= ESMIGOL_STREAK_MIN) streakFiredRef.current = false;
        else if (!streakFiredRef.current) {
          streakFiredRef.current = true;
          if (fire("racha", "racha")) return;
        }
      }

      // Regla 3: va mal (si el modo la ofrece).
      if (!lowGradeFiredRef.current && typeof lowGradeRef.current === "function") {
        let isLow = false;
        try { isLow = !!lowGradeRef.current(); } catch (e) { isLow = false; }
        if (isLow) {
          lowGradeFiredRef.current = true;
          if (fire("recuerdo", "vaMal")) return;
        }
      }

      // Regla 4: va muy bien (si el modo la ofrece) — felicita a mitad de
      // camino, no solo al terminar.
      if (!highGradeFiredRef.current && typeof highGradeRef.current === "function") {
        let isHigh = false;
        try { isHigh = !!highGradeRef.current(); } catch (e) { isHigh = false; }
        if (isHigh) {
          highGradeFiredRef.current = true;
          if (fire("logro", "vaBien")) return;
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
        if (fire(r.group || "recuerdo", r.moment)) return;
      }

      // Regla 2: motivar cada cinco minutos desde que arrancó.
      const base = lastMotivateAtRef.current || startedAt || now;
      if (startedAt && (now - base) >= ESMIGOL_MOTIVATE_MS) {
        lastMotivateAtRef.current = now;
        fire("motivacion", "periodico");
      }
    };
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [active, enabled, mode, live, questionId, startedAt, phrase]);

  const dismiss = () => setPhrase(null);
  // Disparo puntual, para eventos exactos (se acabó el tiempo, terminó la
  // actividad...) en vez de esperar al siguiente tick de 5 s. Respeta el
  // mismo "no encimar mensajes": si ya hay uno en pantalla, no hace nada.
  // `momentId` (opcional) = id de ESMIGOL_MOMENT_LIST, para respetar si el
  // docente lo apagó.
  const fireNow = (groupId, momentId) => { if (phrase) return false; return fire(groupId, momentId); };
  // Frase EXACTA elegida por alguien (el docente desde el tablero en vivo):
  // no se sortea y, a diferencia de fireNow, reemplaza al mensaje que esté
  // en pantalla — lo que manda el docente tiene prioridad. Respeta igual el
  // interruptor general, el del modo y el del momento.
  const showNow = (p, momentId) => {
    const c = cfgRef.current;
    if (!p || !p.text || !c || c.enabled === false) return false;
    if (c.modes && c.modes[esmigolModeKey(mode, live)] === false) return false;
    if (!momentOn(momentId)) return false;
    setPhrase({ ...p, _key: Date.now() });
    return true;
  };
  const node = (phrase && enabled && window.Esmigol) ? (
    <Esmigol
      // key nueva por mensaje: si llega otro mientras uno está en
      // pantalla, entra y se escribe de nuevo en vez de quedar a medias.
      key={phrase._key || phrase.id}
      texto={phrase.text}
      expression={phrase.expression}
      position={cfg?.position || ESMIGOL_DEFAULT_POSITION}
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

  return { phrase, dismiss, node, fireNow, showNow };
}
window.useEsmigolTriggers = useEsmigolTriggers;
window.ESMIGOL_SLOW_MS = ESMIGOL_SLOW_MS;
window.ESMIGOL_MOTIVATE_MS = ESMIGOL_MOTIVATE_MS;
window.ESMIGOL_LOW_GRADE_RATIO = ESMIGOL_LOW_GRADE_RATIO;
window.ESMIGOL_LOW_GRADE_MIN = ESMIGOL_LOW_GRADE_MIN;
window.ESMIGOL_HIGH_GRADE_RATIO = ESMIGOL_HIGH_GRADE_RATIO;
window.ESMIGOL_HIGH_GRADE_MIN = ESMIGOL_HIGH_GRADE_MIN;
window.ESMIGOL_STREAK_MIN = ESMIGOL_STREAK_MIN;

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
  const groups = (saved.phrasesVersion || 0) < ESMIGOL_PHRASES_VERSION
    ? esmigolUpgradeGroups(saved.groups)
    : { ...ESMIGOL_TRIGGERS_DEFAULT.groups, ...(saved.groups || {}) };
  // Igual con los modos y momentos: una config guardada antes de que
  // existieran trae todo encendido como antes (y "inicio" apagado).
  const modes = { ...ESMIGOL_MODES_DEFAULT, ...(saved.modes || {}) };
  const moments = { ...ESMIGOL_MOMENTS_DEFAULT, ...(saved.moments || {}) };
  // Antes no existía "centro" y todo quedaba en "bottom-right" por
  // defecto: esas configs viejas pasan a "Abajo · centro". Una esquina
  // elegida después (layoutVersion 2) se respeta tal cual. El "center" a
  // media pantalla ya no existe: también pasa a "Abajo · centro".
  const oldDefault = !saved.layoutVersion && (!saved.position || saved.position === "bottom-right");
  const position = (oldDefault || !ESMIGOL_POSITIONS.some(p => p.id === saved.position))
    ? ESMIGOL_DEFAULT_POSITION : saved.position;
  return { ...ESMIGOL_TRIGGERS_DEFAULT, ...saved, groups, modes, moments, position, layoutVersion: 2, phrasesVersion: ESMIGOL_PHRASES_VERSION };
}
window.esmigolConfigFor = esmigolConfigFor;

// Config guardada con frases base de una versión anterior: se cambian por
// las frases base nuevas (otras reglas, otros rostros), pero las frases
// que escribió el docente ("custom-…") se conservan en su mismo grupo,
// con su rostro pasado al equivalente nuevo.
function esmigolUpgradeGroups(savedGroups) {
  const groups = JSON.parse(JSON.stringify(ESMIGOL_TRIGGER_GROUPS_DEFAULT));
  Object.keys(savedGroups || {}).forEach(gid => {
    const custom = ((savedGroups[gid] && savedGroups[gid].phrases) || [])
      .filter(p => p && String(p.id).indexOf("custom-") === 0)
      .map(p => ({ ...p, expression: esmigolExpressionId(p.expression) }));
    if (!custom.length) return;
    const target = groups[gid] ? gid : "motivacion";
    groups[target].phrases = [...groups[target].phrases, ...custom];
  });
  return groups;
}

// Config global del docente (dashboard): la guardada en su perfil, o los
// valores por defecto. Misma fusión que esmigolConfigFor.
function esmigolUserConfig(userData) {
  const saved = userData && userData.esmigolConfig;
  return esmigolConfigFor(saved ? { metaTriggers: saved } : null);
}
window.esmigolUserConfig = esmigolUserConfig;
