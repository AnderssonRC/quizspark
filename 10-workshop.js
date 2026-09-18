/* global React, I, youtubeId, tileColor, Field, Toggle, NumberField */
// ============================================================
// QuizSpark — TALLER EVALUATIVO (modo "workshop")
// Un tercer tipo de actividad, además de Quiz y Encuesta:
//   - Submodo En Vivo: sala en vivo (reutiliza LiveSessionHost/StudentJoinLive/
//     StudentLive de 09-live.js), pero con calificación 1-10 en las
//     preguntas abiertas en vez de las 3 etiquetas del quiz normal.
//   - Submodo Offline: el estudiante lo hace por su cuenta hasta una fecha
//     límite; el docente le pone UNA sola nota a toda la entrega.
// Preguntas cerradas: 10 puntos si acierta, 0 si no (automático en ambos
// submodos). Preguntas abiertas: el docente califica manualmente.
//
// Componentes expuestos (bare window, igual que 03-creator.js):
//   WorkshopEditorFields — campos extra en el Editor cuando mode === "workshop"
//   WorkshopHeader       — encabezado de presentación (objetivo/intro/entrega)
//   WorkshopOfflineFlow  — flujo completo del estudiante en submodo Offline
//   WorkshopHostReveal   — pantalla de revelación/calificación del docente (En vivo)
//   WorkshopGradeModal   — asignar la nota única de una entrega Offline (Resultados)
// ============================================================
const { useState: useStateW, useEffect: useEffectW } = React;

// Naranja de marca del Taller: se usa para acentos fijos (badges, botones)
// que no dependen del color elegido por el docente para ESTE taller.
const WORKSHOP_ORANGE = "#ea580c";
const WORKSHOP_ORANGE_DARK = "#7c2d12";

// ---- Carátula del Taller: color "general" + su pareja más cercana ----
// El docente elige UN color base (igual que la carátula del quiz), pero acá
// se combina con el color más próximo en el círculo cromático para dar un
// duo de acento — p.ej. azul (sky) combina con verde (emerald), y viceversa.
// El violeta queda deliberadamente FUERA de esta paleta: es la identidad del
// resto de la app, y la idea del Taller es que se sienta distinto a eso.
const WORKSHOP_COLORS = {
  "var(--amber-500)":   { hex: "#ff9f0a", pair: "#ff4d67", label: "Ámbar",     pairLabel: "Rojo" },
  "var(--emerald-500)": { hex: "#00e08c", pair: "#00aaff", label: "Esmeralda", pairLabel: "Cielo" },
  "var(--sky-500)":     { hex: "#00aaff", pair: "#00e08c", label: "Cielo",     pairLabel: "Esmeralda" },
  "var(--pink-500)":    { hex: "#fc2495", pair: "#ff4d67", label: "Rosa",      pairLabel: "Rojo" },
  "var(--red-500)":     { hex: "#ff4d67", pair: "#fc2495", label: "Rojo",      pairLabel: "Rosa" },
};
const WORKSHOP_COLOR_OPTIONS = Object.keys(WORKSHOP_COLORS);
const WORKSHOP_DEFAULT_COLOR = "var(--amber-500)";

// ---- Superficies NEUTRAS propias del Taller ----
// Los tokens "neutros" del resto de la app (--ink-50, --white, .qs-card,
// .qs-input) en realidad son violeta oscuro (--white: #221046, --ink-50:
// #140833) — por eso el morado se colaba en las tarjetas y cajas de texto
// aunque el acento de color sí cambiara. Acá NO se usan esos tokens: todo lo
// que ve el estudiante en el Taller usa esta paleta café-carbón, realmente
// neutra, para que solo el color elegido por el docente (y su pareja) den
// color a la pantalla.
const WORKSHOP_SURFACE = "#1d1814";       // tarjetas
const WORKSHOP_SURFACE_2 = "#141009";     // cajas internas / inputs (más oscuro)
const WORKSHOP_BORDER = "rgba(255,255,255,0.12)";
const WORKSHOP_TEXT = "#f6f1e8";          // texto principal (casi blanco, cálido)
const WORKSHOP_TEXT_MUTED = "#b7ad9e";    // texto secundario
// Tipografía redondeada y juvenil — deliberadamente distinta de Poppins
// (la del Quiz), para que el Taller también se sienta distinto en el trazo,
// no solo en el color. Legible y menos "formal", pensada para estudiantes.
const WORKSHOP_FONT = "'Fredoka', 'Poppins', 'Segoe UI', system-ui, sans-serif";

// Reemplazo de qs-card / qs-input sin ningún tinte violeta.
function WorkshopCard({ children, style }) {
  return (
    <div style={{
      background: WORKSHOP_SURFACE, border: "1px solid " + WORKSHOP_BORDER,
      borderRadius: 18, boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
      color: WORKSHOP_TEXT, ...style,
    }}>{children}</div>
  );
}
const workshopInputStyle = (extra) => ({
  width: "100%", padding: "11px 14px", borderRadius: 10,
  border: "1px solid " + WORKSHOP_BORDER, background: WORKSHOP_SURFACE_2,
  color: WORKSHOP_TEXT, fontFamily: "inherit", fontSize: 14, outline: "none",
  colorScheme: "dark", ...extra,
});
// Etiqueta de la pantalla "identifícate" (nombre/curso/pareja): centrada,
// grande y con el color propio del taller — en vez de la etiqueta gris
// genérica de un formulario cualquiera.
function workshopIdentifyLabelStyle(wc) {
  return {
    display: "block", textAlign: "center", marginBottom: 8,
    fontSize: 16, fontWeight: 700, fontFamily: WORKSHOP_FONT,
    color: wc.hex, letterSpacing: ".01em",
  };
}

function workshopColorInfo(colorVar) {
  return WORKSHOP_COLORS[colorVar] || WORKSHOP_COLORS[WORKSHOP_DEFAULT_COLOR];
}
function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// Botón/insignia sólido: degradado entre el color base y su pareja.
function workshopAccentGradient(colorVar) {
  const c = workshopColorInfo(colorVar);
  return `linear-gradient(135deg, ${c.hex}, ${c.pair})`;
}
// Fondo del flujo del ESTUDIANTE: oscuro y con textura (no un banner plano
// de un solo color) — dos resplandores tenues, uno del color base y otro de
// su pareja, sobre una base casi negra. Distinto en concepto al degradado
// violeta liso del Quiz, y distinto por taller según el color que elija
// cada docente.
function workshopStudentBg(colorVar) {
  const c = workshopColorInfo(colorVar);
  return (
    `radial-gradient(ellipse 900px 650px at 8% -10%, ${hexToRgba(c.hex, 0.32)}, transparent 60%), ` +
    `radial-gradient(ellipse 800px 600px at 105% 15%, ${hexToRgba(c.pair, 0.24)}, transparent 55%), ` +
    `linear-gradient(180deg, #130b08 0%, #0a0503 100%)`
  );
}

// Mensaje de retroalimentación según la nota (1-10) que el docente asigna a
// una respuesta abierta. Los rangos que dio el docente se solapan en los
// bordes (p.ej. 2 aparece en "1-2" y en "2-4"); se resuelven de menor a
// mayor tomando el primer tope que alcance la nota, así cada entero 1-10
// cae en un solo mensaje.
const WORKSHOP_FEEDBACK_BY_SCORE = [
  { max: 2,  text: "Incorrecta tu respuesta." },
  { max: 4,  text: "Tienes un pequeño acierto, pero sigues equivocado." },
  { max: 5,  text: "Tienes un valioso aporte, pero tu ortografía no ayuda." },
  { max: 7,  text: "Estuvo cerca, pero faltó organizar las ideas con comas o puntos." },
  { max: 8,  text: "Tienes un buen acierto en la respuesta, son pequeños errores." },
  { max: 10, text: "Excelente respuesta. ¡Sigue así!" },
];
function workshopFeedbackForScore(points) {
  const found = WORKSHOP_FEEDBACK_BY_SCORE.find(r => points <= r.max);
  return found ? found.text : "";
}

function formatDeadline(ts) {
  if (!ts) return "Sin fecha límite definida";
  try {
    return new Date(ts).toLocaleString("es-CO", { dateStyle: "full", timeStyle: "short" });
  } catch (e) {
    return "Sin fecha límite definida";
  }
}

// Corrección automática de preguntas CERRADAS (multi/truefalse/checks/order).
// Las preguntas de texto (abiertas) siempre se califican a mano → null.
function checkClosedWorkshopAnswer(q, answer) {
  if (q.type === "multi" || q.type === "truefalse") {
    const c = (q.options || []).find(o => o.correct);
    return !!c && answer === c.id;
  }
  if (q.type === "checks") {
    const correctIds = (q.options || []).filter(o => o.correct).map(o => o.id).sort();
    const userIds = Array.isArray(answer) ? [...answer].sort() : [];
    return JSON.stringify(correctIds) === JSON.stringify(userIds);
  }
  if (q.type === "order") {
    const correctIds = (q.items || []).map(it => it.id);
    const userIds = Array.isArray(answer) ? answer : [];
    return JSON.stringify(correctIds) === JSON.stringify(userIds);
  }
  return null;
}

// ============================================================
// EDITOR — campos propios del Taller (se insertan en 03-creator.js)
// ============================================================
function WorkshopEditorFields({ quiz, setQuiz }) {
  const workshopMode = quiz.workshopMode || "live";
  const deadlineObj = quiz.deliveryDeadline ? new Date(quiz.deliveryDeadline) : null;
  const pad2 = (n) => String(n).padStart(2, "0");
  const dateStr = deadlineObj ? `${deadlineObj.getFullYear()}-${pad2(deadlineObj.getMonth() + 1)}-${pad2(deadlineObj.getDate())}` : "";
  const timeStr = deadlineObj ? `${pad2(deadlineObj.getHours())}:${pad2(deadlineObj.getMinutes())}` : "";
  // Construye la fecha con los componentes de día/hora directamente en hora
  // LOCAL (evita el corrimiento de un día que da parsear "YYYY-MM-DD" como
  // si fuera UTC).
  const updateDeadline = (newDateStr, newTimeStr) => {
    if (!newDateStr) { setQuiz({ ...quiz, deliveryDeadline: null }); return; }
    const [y, m, d] = newDateStr.split("-").map(Number);
    const [hh, mm] = (newTimeStr || "23:59").split(":").map(Number);
    setQuiz({ ...quiz, deliveryDeadline: new Date(y, m - 1, d, hh, mm, 0, 0).getTime() });
  };
  const colorInfo = workshopColorInfo(quiz.color);
  return (
    <>
      <Field label="Carátula del Taller">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {["🛠️","🔬","🧪","📐","🧩","⚙️","🖊️","🔨","🧵","🗂️","📊","🧱","🎨","🧭","🧮","🚧"].map(em => (
            <button key={em} onClick={() => setQuiz({ ...quiz, cover: em })}
              title="Emoji de la carátula"
              style={{
                width: 36, height: 36, borderRadius: 10, fontSize: 18, cursor: "pointer",
                background: (quiz.cover || "🛠️") === em ? "rgba(234,88,12,0.18)" : "var(--ink-50)",
                border: "1px solid " + ((quiz.cover || "🛠️") === em ? WORKSHOP_ORANGE : "var(--ink-200)"),
                display: "grid", placeItems: "center", padding: 0,
              }}>{em}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, marginBottom: 6 }}>
          Color general (se combina automáticamente con su color más cercano)
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {WORKSHOP_COLOR_OPTIONS.map(cv => {
            const info = WORKSHOP_COLORS[cv];
            const on = (quiz.color || WORKSHOP_DEFAULT_COLOR) === cv;
            return (
              <button key={cv} onClick={() => setQuiz({ ...quiz, color: cv })}
                title={info.label}
                style={{
                  width: 40, height: 28, borderRadius: 8, cursor: "pointer", padding: 0,
                  border: on ? "2px solid white" : "2px solid transparent",
                  boxShadow: on ? "0 0 0 2px " + info.hex : "0 0 0 1px var(--ink-200)",
                  background: `linear-gradient(135deg, ${info.hex} 50%, ${info.pair} 50%)`,
                }} />
            );
          })}
        </div>
        <div style={{
          marginTop: 12, borderRadius: 12, overflow: "hidden", border: "1px solid var(--ink-200)",
        }}>
          <div style={{
            height: 64, background: workshopAccentGradient(quiz.color), display: "grid", placeItems: "center", fontSize: 30,
          }}>{quiz.cover || "🛠️"}</div>
          <div style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, background: "var(--white)" }}>
            {quiz.title || "Nuevo taller"} · {colorInfo.label} + {colorInfo.pairLabel}
          </div>
        </div>
      </Field>

      <Field label="Submodo del Taller">
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "live", label: "🔴 En Vivo" },
            { id: "offline", label: "📅 Offline" },
          ].map(opt => {
            const on = workshopMode === opt.id;
            return (
              <button key={opt.id} onClick={() => setQuiz({ ...quiz, workshopMode: opt.id })}
                style={{
                  flex: 1, padding: "10px 6px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: on ? "rgba(234,88,12,0.14)" : "var(--ink-50)",
                  color: on ? WORKSHOP_ORANGE : "var(--ink-500)",
                  border: "1px solid " + (on ? WORKSHOP_ORANGE : "var(--ink-200)"),
                }}>{opt.label}</button>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.5 }}>
          {workshopMode === "live"
            ? "Sala en vivo con código: las cerradas se corrigen solas y las abiertas las calificas de 1 a 10 al revelar cada pregunta."
            : "El estudiante lo hace por su cuenta hasta la fecha límite; luego le asignas una sola nota a toda la entrega desde Resultados."}
        </p>
      </Field>

      <Field label="Objetivo de aprendizaje">
        <input className="qs-input" value={quiz.learningObjective || ""}
          placeholder="¿Qué debe lograr el estudiante con este taller?"
          onChange={e => setQuiz({ ...quiz, learningObjective: e.target.value })} />
      </Field>

      <Field label="Introducción / resumen del contenido">
        <textarea className="qs-input" value={quiz.introText || ""}
          placeholder="Contexto, instrucciones, materiales de apoyo..."
          onChange={e => setQuiz({ ...quiz, introText: e.target.value })}
          style={{ minHeight: 90, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />
      </Field>

      <Field label="Imagen o video introductorio (opcional)">
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-700)", marginBottom: 6 }}>🖼️ Imagen</div>
        <input className="qs-input"
          placeholder="Enlace directo de la imagen (.jpg, .png, .webp...)"
          value={quiz.introImage || ""}
          onChange={e => setQuiz({ ...quiz, introImage: e.target.value.trim() })} />
        {quiz.introImage && (
          <img src={quiz.introImage} alt="Vista previa"
            onError={e => { e.currentTarget.style.display = "none"; }}
            onLoad={e => { e.currentTarget.style.display = "block"; }}
            style={{ marginTop: 8, maxWidth: "100%", maxHeight: 160, borderRadius: 10, border: "1px solid var(--ink-200)", display: "block" }} />
        )}
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-700)", marginTop: 12, marginBottom: 6 }}>▶️ Video de YouTube</div>
        <input className="qs-input"
          placeholder="Pega el enlace de YouTube"
          value={quiz.introVideo || ""}
          onChange={e => setQuiz({ ...quiz, introVideo: e.target.value.trim() })} />
        {quiz.introVideo && youtubeId(quiz.introVideo) && (
          <div style={{ marginTop: 8, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
            <iframe src={`https://www.youtube.com/embed/${youtubeId(quiz.introVideo)}`} title="Vista previa"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
          </div>
        )}
        <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.5 }}>
          Se muestra en grande arriba de todo, antes de que el estudiante ponga su nombre.
        </p>
      </Field>

      {workshopMode === "offline" && (
        <Field label="Tiempo de entrega (fecha y hora límite)">
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, display: "block", marginBottom: 4 }}>📅 Día</span>
              <input type="date" className="qs-input" value={dateStr}
                onChange={e => updateDeadline(e.target.value, timeStr)}
                style={{ colorScheme: "dark" }} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, display: "block", marginBottom: 4 }}>⏰ Hora</span>
              <input type="time" className="qs-input" value={timeStr || "23:59"}
                onChange={e => updateDeadline(dateStr, e.target.value)}
                disabled={!dateStr}
                style={{ colorScheme: "dark" }} />
            </div>
          </div>
          {quiz.deliveryDeadline ? (
            <div style={{
              marginTop: 10, padding: "8px 12px", borderRadius: 8,
              background: "rgba(234,88,12,0.14)", fontSize: 12, color: WORKSHOP_ORANGE, fontWeight: 700,
            }}>
              🔒 Se cierra: {formatDeadline(quiz.deliveryDeadline)}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8 }}>
              Elige un día para activar la fecha límite.
            </p>
          )}
          <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.5 }}>
            El estudiante verá esta fecha desde el inicio. Pasada esta fecha, el taller
            se cierra solo y ve "Habla con el profe, el tiempo ha terminado."
          </p>
        </Field>
      )}
    </>
  );
}

// ============================================================
// HEADER — encabezado de presentación reutilizado en Vivo y Offline
// ============================================================
function WorkshopHeader({ title, cover, colorVar, learningObjective, introText, introImage, introVideo, deliveryInfo }) {
  const c = workshopColorInfo(colorVar);
  const accent = workshopAccentGradient(colorVar);
  const vid = introVideo ? youtubeId(introVideo) : null;
  return (
    <div style={{ marginBottom: 20, textAlign: "left", fontFamily: WORKSHOP_FONT }}>
      {/* El video (siempre 16:9, sin pérdida de calidad al estirarlo) se ve
          como portada con el título superpuesto. La imagen NO se estira ni
          se recorta para llenar el ancho — eso es lo que la pixelaba — se
          muestra a su tamaño natural, centrada sobre la superficie de la
          tarjeta, y el título va debajo. */}
      {vid ? (
        <div style={{
          position: "relative", borderRadius: 18, overflow: "hidden", marginBottom: 16,
          boxShadow: `0 0 0 1.5px ${hexToRgba(c.hex, 0.5)}, 0 20px 50px ${hexToRgba(c.hex, 0.25)}`,
        }}>
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
            <iframe src={`https://www.youtube.com/embed/${vid}`} title="Introducción"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
          </div>
        </div>
      ) : introImage ? (
        <div style={{
          borderRadius: 18, overflow: "hidden", marginBottom: 16, background: WORKSHOP_SURFACE,
          border: "1px solid " + WORKSHOP_BORDER, textAlign: "center",
        }}>
          <img src={introImage} alt=""
            style={{ maxWidth: "100%", maxHeight: 240, width: "auto", height: "auto", objectFit: "contain", display: "inline-block" }} />
        </div>
      ) : null}

      <div style={{ textAlign: "center", marginBottom: 18 }}>
        {!vid && !introImage && (
          <div style={{
            width: 84, height: 84, margin: "0 auto 12px", borderRadius: "50%",
            display: "grid", placeItems: "center", fontSize: 42, lineHeight: 1,
            background: `radial-gradient(circle, ${hexToRgba(c.hex, 0.35)}, transparent 70%)`,
          }}>{cover || "🛠️"}</div>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", color: c.hex, marginBottom: 6 }}>
          {(vid || introImage) ? (cover || "🛠️") + " " : ""}TALLER EVALUATIVO
        </div>
        <h2 style={{ fontSize: 28, fontFamily: WORKSHOP_FONT, fontWeight: 600, color: WORKSHOP_TEXT, lineHeight: 1.15 }}>{title}</h2>
      </div>

      <div style={{
        background: hexToRgba(c.hex, 0.14), border: "1px solid " + hexToRgba(c.hex, 0.4),
        borderRadius: 14, padding: "14px 16px", marginBottom: 12, display: "grid", gap: 10,
      }}>
        {learningObjective && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0, fontSize: 14,
              display: "grid", placeItems: "center", background: accent,
            }}>🎯</span>
            <div style={{ fontSize: 14, lineHeight: 1.5, color: WORKSHOP_TEXT }}>
              <strong>Objetivo de aprendizaje:</strong> {learningObjective}
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%", flexShrink: 0, fontSize: 14,
            display: "grid", placeItems: "center", background: accent,
          }}>⏰</span>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: WORKSHOP_TEXT }}>
            <strong>Tiempo de entrega:</strong> {deliveryInfo}
          </div>
        </div>
      </div>
      {introText && (
        <div style={{
          background: WORKSHOP_SURFACE_2, border: "1px solid " + WORKSHOP_BORDER, borderRadius: 12,
          padding: 14, fontSize: 14, lineHeight: 1.6, color: WORKSHOP_TEXT_MUTED, whiteSpace: "pre-wrap",
        }}>
          {introText}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Renderizadores de pregunta reutilizados por el flujo Offline
// ============================================================
function WorkshopTextArea({ value, onChange, colorInfo }) {
  const c = colorInfo || workshopColorInfo();
  const [focused, setFocused] = useStateW(false);
  return (
    <textarea
      style={workshopInputStyle({
        minHeight: 120, resize: "vertical", fontSize: 15, lineHeight: 1.5,
        border: "2px solid " + (focused ? c.hex : WORKSHOP_BORDER),
        boxShadow: focused ? `0 0 0 3px ${hexToRgba(c.hex, 0.25)}` : "none",
        transition: "border-color .15s ease, box-shadow .15s ease",
      })}
      value={value} onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      placeholder="Escribe tu respuesta..." />
  );
}

function WorkshopOrderAnswer({ items, value, onChange, colorInfo }) {
  const c = colorInfo || workshopColorInfo();
  const order = Array.isArray(value) && value.length ? value : items.map(it => it.id);
  useEffectW(() => { if (!Array.isArray(value) || !value.length) onChange(order); }, []);
  const byId = {}; items.forEach(it => { byId[it.id] = it; });
  const move = (idx, dir) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= order.length) return;
    const next = [...order];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    onChange(next);
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {order.map((id, i) => {
        const it = byId[id];
        if (!it) return null;
        return (
          <div key={id} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
            borderRadius: 12, background: WORKSHOP_SURFACE_2, border: "1px solid " + WORKSHOP_BORDER, color: WORKSHOP_TEXT,
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: "50%", background: hexToRgba(c.hex, 0.22), color: c.hex,
              display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}><window.RichText text={it.text} /></span>
            <button onClick={() => move(i, -1)} disabled={i === 0}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + WORKSHOP_BORDER, background: i === 0 ? "rgba(255,255,255,0.04)" : WORKSHOP_SURFACE, fontSize: 16, fontWeight: 800, color: i === 0 ? "rgba(255,255,255,0.3)" : c.hex }}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === order.length - 1}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + WORKSHOP_BORDER, background: i === order.length - 1 ? "rgba(255,255,255,0.04)" : WORKSHOP_SURFACE, fontSize: 16, fontWeight: 800, color: i === order.length - 1 ? "rgba(255,255,255,0.3)" : c.hex }}>↓</button>
          </div>
        );
      })}
    </div>
  );
}

// Nota de contraste: los estados "seleccionado" usan un TINTE TRANSLÚCIDO
// del color elegido sobre el fondo oscuro de la tarjeta (no un color sólido
// claro) — así el texto casi-blanco heredado sigue siendo legible sin tener
// que alternar el color de texto por estado. Todas las superficies acá son
// WORKSHOP_SURFACE/_2 (café-carbón real), nunca var(--white)/var(--ink-*):
// esos tokens de la app son violeta oscuro por dentro.
function WorkshopQuestionCard({ q, answer, onAnswer, colorInfo }) {
  const c = colorInfo || workshopColorInfo();
  const selectedBg = hexToRgba(c.hex, 0.22);
  if (q.type === "slide") {
    return (
      <WorkshopCard style={{ padding: 28 }}>
        <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 10, background: hexToRgba(c.hex, 0.18), color: c.hex, fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
          📋 Diapositiva
        </div>
        {q.slideTitle && <h2 style={{ fontSize: 22, marginBottom: 12, fontFamily: WORKSHOP_FONT, fontWeight: 600 }}><window.RichText text={q.slideTitle} /></h2>}
        {q.image && (
          <div style={{ textAlign: "center", marginBottom: 14, background: WORKSHOP_SURFACE_2, borderRadius: 10, padding: 8 }}>
            <img src={q.image} alt="" style={{ maxWidth: "100%", maxHeight: 300, width: "auto", borderRadius: 6, objectFit: "contain" }} />
          </div>
        )}
        {q.video && youtubeId(q.video) && (
          <div style={{ marginBottom: 14, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
            <iframe src={`https://www.youtube.com/embed/${youtubeId(q.video)}`} title="Video"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
          </div>
        )}
        {q.slideBody && <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap" }}><window.RichText text={q.slideBody} /></div>}
        {!q.slideTitle && !q.slideBody && !q.image && !q.video && (
          <p style={{ color: WORKSHOP_TEXT_MUTED, fontStyle: "italic", textAlign: "center" }}>Esta diapositiva está vacía.</p>
        )}
      </WorkshopCard>
    );
  }
  return (
    <WorkshopCard style={{ padding: 28 }}>
      <h2 style={{ fontSize: 20, marginBottom: (q.image || q.video) ? 12 : 20, lineHeight: 1.4, fontFamily: WORKSHOP_FONT, fontWeight: 500 }}><window.RichText text={q.text} /></h2>
      {q.image && (
        <div style={{ textAlign: "center", marginBottom: q.video ? 12 : 20, background: WORKSHOP_SURFACE_2, borderRadius: 10, padding: 8 }}>
          <img src={q.image} alt="" style={{ maxWidth: "100%", maxHeight: 260, width: "auto", borderRadius: 6, objectFit: "contain" }} />
        </div>
      )}
      {q.video && youtubeId(q.video) && (
        <div style={{ marginBottom: 20, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
          <iframe src={`https://www.youtube.com/embed/${youtubeId(q.video)}`} title="Video"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
        </div>
      )}
      {q.type === "multi" && (
        <div style={{ display: "grid", gap: 10 }}>
          {(q.options || []).map(opt => (
            <button key={opt.id} onClick={() => onAnswer(opt.id)} style={{
              padding: 16, borderRadius: 12, textAlign: "left",
              background: answer === opt.id ? selectedBg : WORKSHOP_SURFACE_2, color: WORKSHOP_TEXT,
              border: "2px solid " + (answer === opt.id ? c.hex : WORKSHOP_BORDER),
              fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}><window.RichText text={opt.text} /></button>
          ))}
        </div>
      )}
      {q.type === "truefalse" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(q.options || []).map(opt => (
            <button key={opt.id} onClick={() => onAnswer(opt.id)} style={{
              padding: "20px 16px", borderRadius: 12,
              background: answer === opt.id ? selectedBg : WORKSHOP_SURFACE_2, color: WORKSHOP_TEXT,
              border: "2px solid " + (answer === opt.id ? c.hex : WORKSHOP_BORDER),
              fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}><window.RichText text={opt.text} /></button>
          ))}
        </div>
      )}
      {q.type === "checks" && (
        <div style={{ display: "grid", gap: 10 }}>
          {(q.options || []).map(opt => {
            const arr = Array.isArray(answer) ? answer : [];
            const selected = arr.includes(opt.id);
            return (
              <button key={opt.id} onClick={() => {
                const next = selected ? arr.filter(x => x !== opt.id) : [...arr, opt.id];
                onAnswer(next);
              }} style={{
                padding: 14, borderRadius: 12, textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                background: selected ? selectedBg : WORKSHOP_SURFACE_2, color: WORKSHOP_TEXT,
                border: "2px solid " + (selected ? c.hex : WORKSHOP_BORDER),
                fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: "2px solid " + (selected ? c.hex : "rgba(255,255,255,0.3)"),
                  background: selected ? c.hex : "transparent",
                  display: "grid", placeItems: "center", color: "white", fontSize: 14,
                }}>{selected ? "✓" : ""}</span>
                <window.RichText text={opt.text} />
              </button>
            );
          })}
        </div>
      )}
      {q.type === "text" && <WorkshopTextArea value={answer || ""} onChange={onAnswer} colorInfo={c} />}
      {q.type === "order" && <WorkshopOrderAnswer items={q.items || []} value={answer} onChange={onAnswer} colorInfo={c} />}
    </WorkshopCard>
  );
}

// ============================================================
// FLUJO OFFLINE — el estudiante lo hace por su cuenta hasta la fecha límite
// ============================================================
function WorkshopOfflineFlow({ quiz, onExit }) {
  const deadline = quiz.deliveryDeadline || null;
  const alreadyClosed = deadline && Date.now() > deadline;
  // identify | workshop | submitting | done | closed
  const [phase, setPhase] = useStateW(alreadyClosed ? "closed" : "identify");
  const [studentName, setStudentName] = useStateW("");
  const [studentCourse, setStudentCourse] = useStateW("");
  const [partnerName, setPartnerName] = useStateW("");
  const [currentIdx, setCurrentIdx] = useStateW(0);
  const [answers, setAnswers] = useStateW({});
  const [startedAt, setStartedAt] = useStateW(null);

  const questions = quiz.questions || [];

  // Vigilar el cierre por fecha límite mientras el estudiante trabaja
  useEffectW(() => {
    if (!deadline || phase === "closed" || phase === "done") return;
    const check = () => { if (Date.now() > deadline) setPhase("closed"); };
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [deadline, phase]);

  const handleStart = () => {
    if (!studentName.trim() || !studentCourse.trim()) {
      alert("Completa tu nombre y curso.");
      return;
    }
    if (deadline && Date.now() > deadline) { setPhase("closed"); return; }
    // Antes del taller: cuenta regresiva META (14-meta.js). startedAt
    // arranca recién cuando la cuenta llega a cero.
    setPhase("meta");
  };

  const setAnswer = (qid, value) => setAnswers(a => ({ ...a, [qid]: value }));

  const isAnswered = (q) => {
    if (q.type === "slide") return true;
    const a = answers[q.id];
    if (q.type === "checks" || q.type === "order") return Array.isArray(a) && a.length > 0;
    return a !== undefined && a !== "";
  };

  const handleNext = () => {
    if (deadline && Date.now() > deadline) { setPhase("closed"); return; }
    if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    if (deadline && Date.now() > deadline) { setPhase("closed"); return; }
    setPhase("submitting");
    try {
      const finishedAt = Date.now();
      const totalSeconds = startedAt ? Math.round((finishedAt - startedAt) / 1000) : 0;
      // Preguntas sin responder (el estudiante no alcanzó a llegar a ellas) no
      // cuentan como incorrectas: se marcan "attempted:false" y quedan fuera
      // de correctCount/totalGraded para no descontarle al docente lo que
      // el estudiante sí alcanzó a hacer.
      let correctCount = 0, totalGraded = 0, answeredCount = 0;
      const nonSlideQuestions = questions.filter(q => q.type !== "slide");
      const gradeDetail = nonSlideQuestions.map(q => {
        const userAnswer = answers[q.id];
        const attempted = isAnswered(q);
        if (attempted) answeredCount++;
        let correct = null, points = null;
        if (q.type !== "text") {
          if (attempted) {
            correct = checkClosedWorkshopAnswer(q, userAnswer);
            points = correct ? 10 : 0;
            totalGraded++;
            if (correct) correctCount++;
          }
        }
        return { qid: q.id, type: q.type, userAnswer: userAnswer ?? null, correct, points, pointsMax: 10, attempted };
      });
      const submission = {
        quizId: quiz.id,
        ownerId: quiz.ownerId,
        studentName: studentName.trim(),
        studentCourse: studentCourse.trim(),
        partnerName: partnerName.trim() || null,
        examDate: new Date().toISOString().slice(0, 10),
        activityType: "workshop",
        workshopMode: "offline",
        answers,
        gradeDetail,
        correct: correctCount,
        total: totalGraded,
        answered: answeredCount,
        totalQuestions: nonSlideQuestions.length,
        partial: answeredCount < nonSlideQuestions.length,
        percent: totalGraded > 0 ? Math.round((correctCount / totalGraded) * 100) : null,
        pointsEarned: null,
        pointsMax: null,
        score: null,       // el docente asigna la nota única después
        graded: false,
        startedAt, finishedAt, totalSeconds,
        submittedAt: Date.now(),
      };
      await window.QS.db.collection("results").add(submission);
      setPhase("done");
    } catch (err) {
      console.error("Error enviando el taller:", err);
      alert("Error al enviar el taller: " + err.message);
      setPhase("workshop");
    }
  };

  // Terminar antes de responder todo el taller (ej: se acabó la clase). Se
  // envía con lo alcanzado; lo que falta no descuenta ni cuenta como error.
  const handleFinishEarly = () => {
    const answeredCount = questions.filter(isAnswered).length;
    if (answeredCount >= questions.length) { handleSubmit(); return; }
    if (!window.confirm(
      `Vas a terminar con ${answeredCount} de ${questions.length} preguntas respondidas. ` +
      "Las que falten no se calificarán ni descontarán. ¿Enviar ahora?"
    )) return;
    handleSubmit();
  };

  const shellStyle = { minHeight: "100vh", background: workshopStudentBg(quiz.color), padding: 20 };
  const wc = workshopColorInfo(quiz.color);

  if (phase === "closed") {
    return (
      <div style={{ ...shellStyle, display: "grid", placeItems: "center", fontFamily: WORKSHOP_FONT }}>
        <WorkshopCard style={{ padding: 36, maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 14 }}>⏰</div>
          <h2 style={{ fontSize: 22, marginBottom: 10, fontFamily: WORKSHOP_FONT, fontWeight: 600 }}>Habla con el profe, el tiempo ha terminado.</h2>
          <p style={{ color: WORKSHOP_TEXT_MUTED, fontSize: 14, marginBottom: 20 }}>
            El taller "{quiz.title}" ya no acepta entregas.
          </p>
          <button onClick={onExit} className="qs-btn qs-btn--lg"
            style={{ background: "transparent", color: WORKSHOP_TEXT, border: "1px solid " + WORKSHOP_BORDER }}>
            Ir al inicio
          </button>
        </WorkshopCard>
      </div>
    );
  }

  if (phase === "identify") {
    return (
      <div style={{ ...shellStyle, fontFamily: WORKSHOP_FONT }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <WorkshopHeader
            title={quiz.title}
            cover={quiz.cover}
            colorVar={quiz.color}
            learningObjective={quiz.learningObjective}
            introText={quiz.introText}
            introImage={quiz.introImage}
            introVideo={quiz.introVideo}
            deliveryInfo={formatDeadline(deadline)}
          />
          <WorkshopCard style={{ padding: 28 }}>
            <div style={{ marginBottom: 18 }}>
              <label style={workshopIdentifyLabelStyle(wc)}>👤 Tu nombre completo</label>
              <input type="text" style={workshopInputStyle({ textAlign: "center", fontSize: 16, padding: "13px 14px" })}
                placeholder="Ana María Pérez"
                value={studentName} onChange={e => setStudentName(e.target.value)} autoFocus />
            </div>
            <div style={{ marginBottom: quiz.pairMode ? 18 : 24 }}>
              <label style={workshopIdentifyLabelStyle(wc)}>🏫 Curso</label>
              <input type="text" style={workshopInputStyle({ textAlign: "center", fontSize: 16, padding: "13px 14px" })}
                placeholder="Ej: 10A"
                value={studentCourse} onChange={e => setStudentCourse(e.target.value)} />
            </div>
            {quiz.pairMode && (
              <div style={{ marginBottom: 24 }}>
                <label style={workshopIdentifyLabelStyle(wc)}>👥 Nombre de tu compañero (opcional)</label>
                <input type="text" style={workshopInputStyle({ textAlign: "center", fontSize: 16, padding: "13px 14px" })}
                  placeholder="Ej: Juan Pérez"
                  value={partnerName} onChange={e => setPartnerName(e.target.value)} />
              </div>
            )}
            <button onClick={handleStart} className="qs-btn qs-btn--lg"
              style={{ width: "100%", background: workshopAccentGradient(quiz.color), color: "white", boxShadow: "0 4px 0 " + wc.pair, fontFamily: WORKSHOP_FONT, fontWeight: 600 }}>
              🚀 Empezar Taller
            </button>
          </WorkshopCard>
        </div>
      </div>
    );
  }

  if (phase === "meta") {
    return (
      <window.MetaCountdown
        mode="workshop"
        playful
        background={workshopAccentGradient(quiz.color)}
        onDone={() => { setStartedAt(Date.now()); setPhase("workshop"); }}
      />
    );
  }

  if (phase === "submitting") {
    return (
      <div style={{ ...shellStyle, display: "grid", placeItems: "center", color: WORKSHOP_TEXT, fontFamily: WORKSHOP_FONT }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 40 }}>📤</div><p>Enviando tu taller...</p></div>
      </div>
    );
  }

  if (phase === "done") {
    const nonSlideQuestions = questions.filter(q => q.type !== "slide");
    const answeredCount = nonSlideQuestions.filter(isAnswered).length;
    const wasPartial = answeredCount < nonSlideQuestions.length;
    return (
      <div style={{ ...shellStyle, display: "grid", placeItems: "center", fontFamily: WORKSHOP_FONT }}>
        <WorkshopCard style={{ padding: 32, maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 22, marginBottom: 8, fontFamily: WORKSHOP_FONT, fontWeight: 600 }}>¡Taller enviado!</h2>
          <p style={{ color: WORKSHOP_TEXT_MUTED, fontSize: 14, lineHeight: 1.6 }}>
            Gracias, {studentName}. Tu profesor revisará tu entrega y te asignará una nota
            para toda la actividad.
          </p>
          {wasPartial && (
            <p style={{
              marginTop: 14, fontSize: 12, fontWeight: 600, color: wc.hex,
              background: hexToRgba(wc.hex, 0.12), borderRadius: 8, padding: "8px 10px",
            }}>
              ⚠️ Respondiste {answeredCount} de {nonSlideQuestions.length} preguntas. Tu profesor
              verá exactamente cuáles alcanzaste a responder.
            </p>
          )}
        </WorkshopCard>
      </div>
    );
  }

  // === phase === "workshop" ===
  // Layout deliberadamente más angosto y centrado que el del Quiz: la barra
  // superior queda mínima (solo datos + progreso) y el peso visual completo
  // cae sobre la tarjeta de pregunta/respuesta, con un contorno naranja que
  // la separa del fondo oscuro.
  const q = questions[currentIdx];
  if (!q) return null;
  const progress = ((currentIdx + 1) / questions.length) * 100;
  return (
    <div style={{ ...shellStyle, paddingBottom: 100, fontFamily: WORKSHOP_FONT }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 13, color: "#e7dccf",
        }}>
          <div style={{ fontWeight: 700 }}>{studentName} · {studentCourse}</div>
          <div>Pregunta {currentIdx + 1} de {questions.length}</div>
        </div>
        {deadline && (
          <div style={{ fontSize: 12, color: wc.hex, marginBottom: 10, fontWeight: 600 }}>
            ⏰ Entrega hasta: {formatDeadline(deadline)}
          </div>
        )}
        <div style={{ height: 6, background: "rgba(255,255,255,0.12)", borderRadius: 3, marginBottom: 24, overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress + "%", background: `linear-gradient(90deg, ${wc.hex}, ${wc.pair})`, transition: "width 0.3s ease" }} />
        </div>
        <div key={q.id} className="qs-fade-in" style={{
          marginBottom: 16, borderRadius: 16,
          boxShadow: `0 0 0 1.5px ${hexToRgba(wc.hex, 0.5)}, 0 24px 60px ${hexToRgba(wc.hex, 0.18)}`,
        }}>
          <WorkshopQuestionCard q={q} answer={answers[q.id]} onAnswer={v => setAnswer(q.id, v)} colorInfo={wc} />
        </div>
        <button onClick={handleNext} disabled={!isAnswered(q)} className="qs-btn qs-btn--lg" style={{
          width: "100%", background: workshopAccentGradient(quiz.color), color: "white", fontWeight: 700,
          boxShadow: "0 4px 0 " + wc.pair,
          opacity: !isAnswered(q) ? 0.5 : 1,
        }}>
          {currentIdx < questions.length - 1 ? "Siguiente →" : "Enviar taller ✓"}
        </button>
        {currentIdx < questions.length - 1 && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button
              onClick={handleFinishEarly}
              style={{
                background: "none", border: "none", color: "#e7dccf",
                fontSize: 13, fontWeight: 600, textDecoration: "underline", cursor: "pointer",
              }}
            >
              🏁 No puedo continuar, terminar aquí con lo que llevo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DIAPOSITIVA EN VIVO — reemplaza HostSlide para mode === "workshop"
// (misma función: pantalla informativa que el docente pasa manualmente),
// pero con el fondo/tipografía/superficies del Taller en vez del violeta
// del Quiz.
// ============================================================
function WorkshopHostSlide({ session, quiz, currentQ, onNext, onFinish }) {
  const isLast = session.currentQuestionIdx >= quiz.questions.length - 1;
  return (
    <div style={{ minHeight: "100vh", background: workshopStudentBg(quiz.color), padding: 24, color: WORKSHOP_TEXT, fontFamily: WORKSHOP_FONT }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>
            {quiz.cover || "🛠️"} Diapositiva · {session.currentQuestionIdx + 1} de {quiz.questions.length}
          </span>
          <button onClick={onFinish} style={{
            background: "rgba(220,38,38,0.35)", color: "white", border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 10, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>🏁 Finalizar</button>
        </div>

        <WorkshopCard style={{ padding: 32, marginBottom: 20 }}>
          {currentQ.slideTitle && (
            <h1 style={{ fontSize: 30, marginBottom: 16, fontFamily: WORKSHOP_FONT, fontWeight: 600 }}>
              <window.RichText text={currentQ.slideTitle} />
            </h1>
          )}
          {currentQ.image && (
            <div style={{ textAlign: "center", marginBottom: 16, background: WORKSHOP_SURFACE_2, borderRadius: 12, padding: 10 }}>
              <img src={currentQ.image} alt=""
                style={{ maxWidth: "100%", maxHeight: 360, width: "auto", borderRadius: 8, objectFit: "contain" }}/>
            </div>
          )}
          {currentQ.video && youtubeId(currentQ.video) && (
            <div style={{ marginBottom: 16, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden" }}>
              <iframe src={`https://www.youtube.com/embed/${youtubeId(currentQ.video)}`} title="Video"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                allowFullScreen/>
            </div>
          )}
          {currentQ.slideBody && (
            <div style={{ fontSize: 16, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              <window.RichText text={currentQ.slideBody} />
            </div>
          )}
          {!currentQ.slideTitle && !currentQ.slideBody && !currentQ.image && !currentQ.video && (
            <p style={{ color: WORKSHOP_TEXT_MUTED, fontStyle: "italic", textAlign: "center" }}>
              Esta diapositiva está vacía.
            </p>
          )}
        </WorkshopCard>

        <button onClick={onNext} className="qs-btn qs-btn--lg" style={{
          width: "100%", background: workshopAccentGradient(quiz.color), color: "white", fontWeight: 700, fontSize: 16, fontFamily: WORKSHOP_FONT,
        }}>
          {isLast ? "🏁 Finalizar" : "➡️ Siguiente"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// REVELACIÓN EN VIVO — reemplaza HostReveal para mode === "workshop"
// ============================================================
function WorkshopHostReveal({ session, quiz, currentQ, answersThisQ, onNext, onGradeWorkshop, onFinish }) {
  const totalAnswers = Object.keys(answersThisQ || {}).length;
  const isLast = session.currentQuestionIdx >= quiz.questions.length - 1;
  const c = workshopColorInfo(quiz.color);
  const colors = [c.hex, c.pair, c.hex, c.pair];

  const shell = (inner, customFooter) => (
    <div style={{ minHeight: "100vh", background: workshopStudentBg(quiz.color), padding: 24, color: WORKSHOP_TEXT, fontFamily: WORKSHOP_FONT }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ opacity: 0.75, fontSize: 13 }}>{quiz.cover || "🛠️"} Taller — Pregunta {session.currentQuestionIdx + 1} de {quiz.questions.length}</p>
          <h2 style={{ fontSize: 26, marginTop: 4, fontFamily: WORKSHOP_FONT, fontWeight: 600 }}><window.RichText text={currentQ.text} /></h2>
        </div>
        {inner}
        {!customFooter && (
          <>
            <div style={{ marginTop: 4, marginBottom: 20, padding: 12, background: "rgba(255,255,255,0.08)", border: "1px solid " + WORKSHOP_BORDER, borderRadius: 10, textAlign: "center", fontSize: 13 }}>
              <b>{totalAnswers}</b> respuestas totales
            </div>
            <button onClick={onNext} className="qs-btn qs-btn--lg" style={{ width: "100%", background: workshopAccentGradient(quiz.color), color: "white", fontWeight: 700, fontFamily: WORKSHOP_FONT, fontSize: 16 }}>
              {isLast ? "🏁 Ver resultado final" : "➡️ Siguiente pregunta"}
            </button>
            {!isLast && onFinish && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <button onClick={onFinish} style={{
                  background: "none", border: "none", color: "#e7dccf",
                  fontSize: 13, fontWeight: 600, textDecoration: "underline", cursor: "pointer",
                }}>
                  🏁 Terminar aquí y guardar el puntaje actual
                </button>
              </div>
            )}
          </>
        )}
        {customFooter}
      </div>
    </div>
  );

  // ----- Preguntas cerradas: 10 puntos automáticos -----
  if (currentQ.type !== "text") {
    if (currentQ.type === "order") {
      const total = Object.keys(answersThisQ || {}).length;
      const correctCount = Object.values(answersThisQ || {}).filter(a => a.correct).length;
      return shell(
        <WorkshopCard style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--emerald-400)", marginBottom: 10, textAlign: "center" }}>✓ Orden correcto</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {(currentQ.items || []).map((it, i) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: hexToRgba(c.hex, 0.16), borderLeft: "4px solid " + c.hex }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: c.hex, color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: WORKSHOP_TEXT }}><window.RichText text={it.text} /></span>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div style={{ padding: 10, background: hexToRgba(c.hex, 0.16), borderRadius: 10, textAlign: "center", fontSize: 14, color: c.hex, fontWeight: 700 }}>
              {correctCount} de {total} acertaron el orden completo — 10 pts automáticos
            </div>
          )}
        </WorkshopCard>
      );
    }
    const optionCounts = {};
    (currentQ.options || []).forEach(o => { optionCounts[o.id] = 0; });
    Object.values(answersThisQ || {}).forEach(a => {
      if (Array.isArray(a.answer)) a.answer.forEach(id => { if (optionCounts.hasOwnProperty(id)) optionCounts[id]++; });
      else if (optionCounts.hasOwnProperty(a.answer)) optionCounts[a.answer]++;
    });
    const maxCount = Math.max(1, ...Object.values(optionCounts));
    return shell(
      <WorkshopCard style={{ padding: 28, marginBottom: 20 }}>
        <div style={{ display: "grid", gap: 12 }}>
          {(currentQ.options || []).map((opt, i) => {
            const count = optionCounts[opt.id] || 0;
            const widthPct = (count / maxCount) * 100;
            return (
              <div key={opt.id} className="qs-fade-in" style={{
                position: "relative", display: "flex", alignItems: "center", padding: 16,
                borderRadius: 12, background: opt.correct ? "var(--emerald-500)" : colors[i % 4],
                color: "white", overflow: "hidden", opacity: opt.correct || count > 0 ? 1 : 0.5,
              }}>
                <div style={{ position: "absolute", inset: 0, width: widthPct + "%", background: "rgba(255,255,255,0.15)", transition: "width 0.6s ease" }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    {opt.correct && <span style={{ fontSize: 22 }}>✓</span>}<window.RichText text={opt.text} />
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{count}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: WORKSHOP_TEXT_MUTED, textAlign: "center" }}>10 puntos automáticos si acierta, 0 si no.</p>
      </WorkshopCard>
    );
  }

  // ----- Pregunta abierta: calificación manual de 1 a 10 -----
  const entries = Object.entries(answersThisQ || {}).map(([pid, a]) => ({
    pid,
    text: (a.answer == null ? "" : String(a.answer)).trim(),
    graded: a.graded || false,
    points: a.points || null,
    name: session.participants?.[pid]?.name || "Estudiante",
  })).filter(e => e.text);
  const pending = entries.filter(e => !e.graded).length;
  const canAdvance = !(pending > 0 && entries.length > 0);

  return shell(
    <WorkshopCard style={{ padding: 24, marginBottom: 20, maxHeight: "58vh", overflowY: "auto" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: c.hex, marginBottom: 12 }}>
        ✍️ Califica cada respuesta de 1 a 10 — faltan {pending}
      </div>
      {entries.length === 0 ? (
        <p style={{ textAlign: "center", color: WORKSHOP_TEXT_MUTED }}>Aún no hay respuestas.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {entries.map(e => (
            <div key={e.pid} style={{ padding: 12, borderRadius: 10, background: WORKSHOP_SURFACE_2, border: "1px solid " + (e.graded ? c.hex : WORKSHOP_BORDER) }}>
              <div style={{ fontSize: 12, color: WORKSHOP_TEXT_MUTED, marginBottom: 2 }}>{e.name}</div>
              <div style={{ fontSize: 15, marginBottom: 8 }}>{e.text}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                  const on = e.graded && e.points === n;
                  return (
                    <button key={n} onClick={() => onGradeWorkshop(e.pid, n)}
                      style={{
                        width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer",
                        fontWeight: 800, fontSize: 13,
                        color: on ? "white" : WORKSHOP_TEXT,
                        background: on ? c.hex : hexToRgba(c.hex, 0.2),
                      }}>{n}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </WorkshopCard>,
    <button onClick={onNext} disabled={!canAdvance} className="qs-btn qs-btn--lg" style={{
      width: "100%", marginTop: 4, fontFamily: WORKSHOP_FONT,
      background: canAdvance ? workshopAccentGradient(quiz.color) : "rgba(255,255,255,0.08)",
      color: canAdvance ? "white" : "rgba(255,255,255,0.35)",
      fontWeight: 800, fontSize: 16,
    }}>
      {canAdvance ? (isLast ? "🏁 Ver resultado final" : "➡️ Siguiente pregunta") : `Califica a todos para continuar (${pending} restantes)`}
    </button>
  );
}

// ============================================================
// MODAL DE CALIFICACIÓN — nota única para una entrega Offline (Resultados)
// ============================================================
function WorkshopGradeModal({ submission, quiz, onClose, onSaved }) {
  const [grade, setGrade] = useStateW(submission.score != null ? submission.score : null);
  const [saving, setSaving] = useStateW(false);
  const questions = quiz?.questions || [];

  const answerText = (q, userAnswer) => {
    if (userAnswer == null || userAnswer === "") return "—";
    if (Array.isArray(userAnswer)) {
      if (q.type === "order") {
        const byId = {}; (q.items || []).forEach(it => { byId[it.id] = it.text; });
        return userAnswer.map(id => byId[id] || id).join(" → ");
      }
      return userAnswer.map(id => (q.options || []).find(o => o.id === id)?.text || id).join(", ");
    }
    if (q.type === "multi" || q.type === "truefalse") {
      return (q.options || []).find(o => o.id === userAnswer)?.text || String(userAnswer);
    }
    return String(userAnswer);
  };

  const handleSave = async () => {
    const num = grade;
    if (num == null || isNaN(num) || num < 0 || num > 5) {
      alert("Ingresa una nota válida entre 0 y 5.");
      return;
    }
    setSaving(true);
    try {
      await window.QS.db.collection("results").doc(submission.id).update({
        score: num, graded: true, gradedAt: Date.now(),
      });
      onSaved({ id: submission.id, score: num, graded: true });
    } catch (err) {
      alert("Error al guardar la nota: " + err.message);
    }
    setSaving(false);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
      display: "grid", placeItems: "center", padding: 20, zIndex: 60, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{
        padding: 24, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto",
        borderTop: "4px solid " + WORKSHOP_ORANGE,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: 20 }}>{submission.studentName}</h3>
            <p style={{ fontSize: 13, color: "var(--ink-500)" }}>
              {submission.studentCourse} · {submission.examDate}
              {submission.partnerName ? <><br />👥 Con {submission.partnerName}</> : null}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(234,88,12,0.14)", color: WORKSHOP_ORANGE }}>
              🛠️ Taller Offline
            </span>
            {submission.partial && (
              <span title="Terminó antes de responder todo el taller"
                style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "var(--ink-200)", color: "var(--ink-700)" }}>
                ✂️ Parcial · {submission.answered} de {submission.totalQuestions}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          {questions.filter(q => q.type !== "slide").map((q, i) => {
            const det = (submission.gradeDetail || []).find(d => d.qid === q.id) || {};
            const userAnswer = submission.answers ? submission.answers[q.id] : det.userAnswer;
            return (
              <div key={q.id} style={{
                padding: 14, borderRadius: 12, border: "1px solid var(--ink-200)",
                background: q.type === "text" ? "#fff7ed" : "var(--white)",
                color: q.type === "text" ? WORKSHOP_ORANGE_DARK : "var(--ink-900)",
              }}>
                <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.75 }}>
                  Pregunta {i + 1} · {q.type === "text" ? "Respuesta abierta" : q.type}
                </div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{q.text || "(sin enunciado)"}</div>
                <div style={{ padding: 10, borderRadius: 8, background: "var(--ink-50)", fontSize: 14, color: "var(--ink-900)" }}>
                  {answerText(q, userAnswer)}
                </div>
                {q.type !== "text" && det.correct != null && (
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: det.correct ? "var(--emerald-600)" : "var(--red-500)" }}>
                    {det.correct ? "✓ Correcta (referencia, 10 pts)" : "✗ Incorrecta (referencia, 0 pts)"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 12, padding: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: WORKSHOP_ORANGE, display: "block", marginBottom: 8 }}>
            🎯 Nota para toda la actividad (0 a 5)
          </label>
          <NumberField value={grade} fallback={0} step="0.1" min="0" max="5"
            onChange={setGrade}
            style={{
              maxWidth: 160, padding: "8px 10px", borderRadius: 8, border: "1px solid #fdba74",
              background: "white", fontWeight: 700, fontSize: 18, color: WORKSHOP_ORANGE_DARK,
            }} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} className="qs-btn qs-btn--ghost qs-btn--lg" style={{ flex: 1 }}>Cerrar</button>
          <button onClick={handleSave} disabled={saving} className="qs-btn qs-btn--lg" style={{ flex: 1, background: WORKSHOP_ORANGE, color: "white" }}>
            {saving ? "Guardando..." : "💾 Guardar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  WorkshopEditorFields, WorkshopHeader, WorkshopOfflineFlow, WorkshopHostSlide, WorkshopHostReveal, WorkshopGradeModal,
  workshopColorInfo, workshopFeedbackForScore,
});
