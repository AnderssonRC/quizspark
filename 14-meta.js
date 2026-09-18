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
