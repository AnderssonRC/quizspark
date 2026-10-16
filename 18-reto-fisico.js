/* global React */
// ============================================================
// QuizSpark — RETO FÍSICO (sala en vivo: quiz y taller)
// ------------------------------------------------------------
// El docente pausa la sala y lanza un reto para hacer en el salón
// ("¡Todos de pie!", "Dibuja en una hoja…"). Los PRIMEROS que lo
// cumplan ganan puntos (solo ranking): el docente los marca desde
// su lista. Con los premiados completos aparece "Volver al quiz" y todo
// sigue donde estaba (el cronómetro se reanuda sin descontar la pausa).
//
// Estado en el documento de la sesión (liveSessions/{id}), que docente y
// celulares ya escuchan — no se agregan listeners:
//   physicalChallenge = { id, text, emoji, image, color, title1, title2,
//     intro, points, winnersMax, startedAt, winners: [pid], pausedByChallenge }
// El estilo viaja DENTRO del reto: el estudiante no puede leer el perfil
// del docente. La lógica que escribe en Firestore vive en 09-live.js
// (LiveSessionHost); aquí están las pantallas y el estudio de edición.
//
// ESTUDIO (dashboard, como el de Esmigol): el docente edita sus retos
// (texto, emoji, imagen), el color, el título de entrada, los puntos y
// cuántos ganan. Se guarda en users/{uid}.retoConfig.
// ============================================================

const { useState: useStateRF, useEffect: useEffectRF } = React;

const RF_POINTS = 10;
const RF_WINNERS = 3;
const RF_FONT = "var(--font-display, 'Poppins', 'Segoe UI', system-ui, sans-serif)";

// Colores del reto. neon = color principal; soft = brillo secundario;
// ink = texto sobre botones del color; bg/card = degradados oscuros.
const RF_THEMES = [
  { id: "verde",    label: "Verde neón",     neon: "#39ff14", soft: "#b2ff59", ink: "#03200b", text: "#eaffe0", bg: ["#0f3d1f", "#06210f", "#020a05"], card: ["#16502a", "#072a13", "#031a0b"] },
  { id: "azul",     label: "Azul eléctrico", neon: "#22d3ee", soft: "#a5f3fc", ink: "#04222b", text: "#e0f7ff", bg: ["#0b3550", "#061a2e", "#020812"], card: ["#0e4a6b", "#062b45", "#031726"] },
  { id: "rosa",     label: "Rosa",           neon: "#ff3ea5", soft: "#ffb3d9", ink: "#2b0418", text: "#ffe6f3", bg: ["#4a0f33", "#2a061c", "#10020a"], card: ["#5e1442", "#350a24", "#1c0413"] },
  { id: "naranja",  label: "Naranja fuego",  neon: "#ff8a00", soft: "#ffd166", ink: "#2b1400", text: "#fff1e0", bg: ["#4d2508", "#2a1304", "#0f0601"], card: ["#5f300b", "#361a05", "#1d0d02"] },
  { id: "morado",   label: "Morado",         neon: "#b26bff", soft: "#e0c3ff", ink: "#1c0636", text: "#f3e8ff", bg: ["#33115a", "#1c0836", "#0a0215"], card: ["#40166f", "#250a45", "#130426"] },
  { id: "amarillo", label: "Amarillo",       neon: "#ffe600", soft: "#fff59d", ink: "#2b2600", text: "#fffbe0", bg: ["#3d3a08", "#221f04", "#0b0a01"], card: ["#4e4a0b", "#2d2a05", "#171502"] },
];
function rfTheme(id) { return RF_THEMES.find(t => t.id === id) || RF_THEMES[0]; }
function rfRgba(hex, a) {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
// Variables CSS del tema: las animaciones (RFStyles) las leen, así sirven
// para cualquier color sin duplicar los keyframes.
function rfVars(t) {
  return {
    "--rf-neon": t.neon, "--rf-soft": t.soft,
    "--rf-glow": rfRgba(t.neon, 0.45), "--rf-glow-strong": rfRgba(t.neon, 0.75), "--rf-glow-weak": rfRgba(t.neon, 0.2),
  };
}
const rfBg = (t) => `radial-gradient(ellipse at 50% 30%, ${t.bg[0]} 0%, ${t.bg[1]} 45%, ${t.bg[2]} 100%)`;

const RF_PRESETS = [
  "El profe dice: ¡TODOS DE PIE!",
  "El profe dice: ¡Baila como gallina!",
  "El profe dice: ¡Haz diez flexiones de pecho!",
  "El profe dice: ¡Lee una frase de la última clase!",
  "Responde la pregunta del docente en una hoja.",
  "Dibuja en una hoja… ¡ESCUCHA al docente!",
];

// Retos escritos antes en este navegador (versión anterior, solo local).
// Se suman a los retos por defecto mientras el docente no guarde los suyos.
const RF_CUSTOM_KEY = "qs_reto_fisico_custom";
function rfLoadCustom() {
  try { const v = JSON.parse(localStorage.getItem(RF_CUSTOM_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}

// Emoji protagonista según de qué trata el reto (si el docente no eligió
// uno; si no coincide con nada, un rayo).
const RF_EMOJI_RULES = [
  [/gallina|pollo/i, "🐔"], [/bail|danz/i, "🕺"], [/flexi|lagartij|push/i, "💪"],
  [/salt/i, "🦘"], [/de pie|parad|levant/i, "🧍"], [/dibuj|pint/i, "🎨"],
  [/lee|lectur|frase/i, "📖"], [/respond|escrib|hoja/i, "✍️"], [/cant/i, "🎤"],
  [/escucha|oye/i, "👂"], [/corr/i, "🏃"], [/aplau/i, "👏"],
];
function rfEmojiFor(text) {
  const hit = RF_EMOJI_RULES.find(([re]) => re.test(String(text || "")));
  return hit ? hit[1] : "⚡";
}
const RF_EMOJI_PALETTE = ["⚡", "💪", "🧍", "🕺", "🐔", "🦘", "🏃", "👏", "🎤", "🎨", "✍️", "📖", "👂", "🤸", "🙌", "😂", "🤫", "🧠", "🎯", "🔥", "🏆", "🎵", "🤝", "🧘"];

// ---------- Configuración del docente ----------
const RF_DEFAULT_CONFIG = { color: "verde", title1: "MODO RETO", title2: "EN FÍSICO", intro: true, points: RF_POINTS, winners: RF_WINNERS };
function rfNewId() { return "rf-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function rfDefaultRetos() {
  const texts = [...RF_PRESETS, ...rfLoadCustom().filter(t => !RF_PRESETS.includes(t))];
  return texts.map((t, i) => ({ id: "rf-base-" + i, text: t, emoji: rfEmojiFor(t), image: "" }));
}
function rfClamp(n, min, max, def) {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}
function rfConfigFrom(userData) {
  const saved = (userData && userData.retoConfig) || {};
  return {
    ...RF_DEFAULT_CONFIG, ...saved,
    points: rfClamp(saved.points, 1, 100, RF_POINTS),
    winners: rfClamp(saved.winners, 1, 10, RF_WINNERS),
    retos: Array.isArray(saved.retos) && saved.retos.length ? saved.retos : rfDefaultRetos(),
  };
}
function rfUserConfig() { return rfConfigFrom(window.QS && window.QS.currentUserData); }
async function rfSaveConfig(cfg, uidArg) {
  const uid = uidArg || window.QS.currentUser?.uid || window.QS.auth.currentUser?.uid;
  if (!uid) throw new Error("No hay sesión activa.");
  await window.QS.db.collection("users").doc(uid).set({ retoConfig: cfg }, { merge: true });
  if (window.QS.currentUserData && window.QS.currentUser?.uid === uid) {
    window.QS.currentUserData = { ...window.QS.currentUserData, retoConfig: cfg };
  }
}
// Lo que se publica al lanzar un reto (sin undefined: Firestore lo rechaza).
function rfBuildChallenge(reto, cfg) {
  const c = cfg || rfUserConfig();
  const text = String((reto && reto.text) || "").trim();
  return {
    text,
    emoji: (reto && reto.emoji) || rfEmojiFor(text),
    image: (reto && reto.image) || "",
    color: rfTheme(c.color).id,
    title1: c.title1 || RF_DEFAULT_CONFIG.title1,
    title2: c.title2 || "",
    intro: c.intro !== false,
    points: rfClamp(c.points, 1, 100, RF_POINTS),
    winnersMax: rfClamp(c.winners, 1, 10, RF_WINNERS),
  };
}
// Orden del mando del celular: { text, retoId } → reto completo con el
// estilo del docente (el televisor sí tiene su perfil cargado).
function rfChallengeFromCommand(p) {
  const cfg = rfUserConfig();
  const reto = cfg.retos.find(r => r.id === p.retoId) || cfg.retos.find(r => r.text === p.text) || { text: p.text };
  return rfBuildChallenge(reto, cfg);
}
const rfPoints = (ch) => (ch && ch.points) || RF_POINTS;
const rfWinnersMax = (ch) => (ch && ch.winnersMax) || RF_WINNERS;

// Imagen subida por el docente: se reduce a 360 px y se guarda como texto
// (data URL) en su perfil; así viaja con el reto sin servicios extra.
function rfImageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error("El archivo no es una imagen.")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 360;
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let data = canvas.toDataURL("image/webp", 0.78);
      if (!/^data:image\/webp/.test(data)) data = canvas.toDataURL("image/jpeg", 0.78);
      if (data.length > 160000) { reject(new Error("La imagen quedó muy pesada. Prueba con otra más sencilla.")); return; }
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("No se pudo leer la imagen.")); };
    img.src = url;
  });
}

function RFStyles() {
  return (
    <style>{`
      @keyframes qs-rf-left  { 0% { transform: translateX(-130vw); } 28%,58% { transform: translateX(0); } 86% { transform: translateX(-38vw); opacity: 1; } 100% { transform: translateX(-130vw); opacity: 0; } }
      @keyframes qs-rf-right { 0% { transform: translateX(130vw); }  28%,58% { transform: translateX(0); } 86% { transform: translateX(38vw); opacity: 1; }  100% { transform: translateX(130vw); opacity: 0; } }
      @keyframes qs-rf-join  { 0%,24% { text-shadow: 0 0 6px var(--rf-neon); } 34%,56% { text-shadow: 0 0 18px var(--rf-neon), 0 0 46px var(--rf-neon), 0 0 80px var(--rf-soft); } 100% { text-shadow: 0 0 6px var(--rf-neon); } }
      @keyframes qs-rf-flash { 0%,30% { opacity: 0; } 36% { opacity: .55; } 52%,100% { opacity: 0; } }
      @keyframes qs-rf-card  { from { transform: scale(.55) rotate(-4deg); opacity: 0; } 70% { transform: scale(1.05) rotate(1deg); opacity: 1; } to { transform: scale(1) rotate(0); opacity: 1; } }
      @keyframes qs-rf-frame { 0%,100% { box-shadow: inset 0 0 0 6px var(--rf-neon), inset 0 0 40px var(--rf-glow); } 50% { box-shadow: inset 0 0 0 8px var(--rf-soft), inset 0 0 80px var(--rf-glow-strong); } }
      @keyframes qs-rf-pop   { 0% { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); } }
      @keyframes qs-rf-bob   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      @keyframes qs-rf-spin  { to { transform: translate(-50%, -50%) rotate(360deg); } }
      @keyframes qs-rf-glow  { 0%,100% { box-shadow: 0 0 24px var(--rf-glow), 0 0 60px var(--rf-glow-weak); } 50% { box-shadow: 0 0 44px var(--rf-glow-strong), 0 0 110px var(--rf-glow); } }
      @keyframes qs-rf-hero  { 0%,100% { transform: translateY(0) rotate(-6deg) scale(1); } 25% { transform: translateY(-14px) rotate(6deg) scale(1.08); } 50% { transform: translateY(0) rotate(-3deg) scale(1); } 75% { transform: translateY(-8px) rotate(4deg) scale(1.04); } }
      @keyframes qs-rf-halo  { 0%,100% { transform: scale(.85); opacity: .55; } 50% { transform: scale(1.15); opacity: .95; } }
    `}</style>
  );
}

// Pantalla completa del color del reto: marco neón + intro con el título
// del docente (cada línea entra por un lado, se juntan, se separan y
// revelan el reto). `contained` = vista previa dentro del estudio.
function RFShell({ children, introDone, ch, contained = false }) {
  const t = rfTheme(ch && ch.color);
  const title1 = (ch && ch.title1) || RF_DEFAULT_CONFIG.title1;
  const title2 = ch && ch.title2 != null ? ch.title2 : RF_DEFAULT_CONFIG.title2;
  const big = contained ? "34px" : "clamp(40px, 11vw, 120px)";
  return (
    <div style={{
      position: contained ? "absolute" : "fixed", inset: 0, zIndex: contained ? 1 : 950, overflowY: "auto", overflowX: "hidden",
      background: rfBg(t), color: t.text, fontFamily: RF_FONT,
      animation: "qs-rf-frame 2.2s ease-in-out infinite", ...rfVars(t),
    }}>
      <RFStyles />
      {!introDone && (
        <div aria-hidden="true" style={{ position: contained ? "absolute" : "fixed", inset: 0, pointerEvents: "none", zIndex: 2, display: "grid", placeItems: "center", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: t.neon, animation: "qs-rf-flash 2.6s ease forwards" }} />
          <div style={{ transform: "rotate(-32deg)", textAlign: "center", lineHeight: 1.05 }}>
            <div style={{
              fontSize: big, fontWeight: 900, letterSpacing: ".04em", color: t.neon,
              animation: "qs-rf-left 2.6s cubic-bezier(.6,.05,.3,1) forwards, qs-rf-join 2.6s ease forwards",
            }}>{title1}</div>
            {title2 && (
              <div style={{
                fontSize: big, fontWeight: 900, letterSpacing: ".04em", color: "#ffffff",
                animation: "qs-rf-right 2.6s cubic-bezier(.6,.05,.3,1) forwards, qs-rf-join 2.6s ease forwards",
              }}>{title2}</div>
            )}
          </div>
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, minHeight: "100%", padding: contained ? "16px 12px" : "28px 18px 40px" }}>
        {children}
      </div>
    </div>
  );
}

// La intro dura 2.5 s; si el docente la apagó, el reto sale de una vez.
function useRFIntro(id, enabled = true) {
  const [done, setDone] = useStateRF(!enabled);
  useEffectRF(() => {
    if (!enabled) { setDone(true); return; }
    setDone(false);
    const t = setTimeout(() => setDone(true), 2500);
    return () => clearTimeout(t);
  }, [id, enabled]);
  return done;
}
const rfDelay = (ch, s) => (ch && ch.intro === false ? Math.max(0, s - 2.2) : s);

// Imagen o emoji del reto, con halo del color.
function RFVisual({ ch, size }) {
  const t = rfTheme(ch.color);
  const emoji = ch.emoji || rfEmojiFor(ch.text);
  return (
    <div style={{ position: "relative", width: ch.image ? "auto" : size, height: size, margin: "4px auto 8px", display: "grid", placeItems: "center" }}>
      <div aria-hidden="true" style={{
        position: "absolute", inset: ch.image ? "-6%" : 0, borderRadius: "50%",
        background: `radial-gradient(circle, ${rfRgba(t.neon, 0.55)} 0%, ${rfRgba(t.neon, 0.12)} 55%, transparent 70%)`,
        animation: "qs-rf-halo 1.6s ease-in-out infinite",
      }} />
      {ch.image ? (
        <div style={{ position: "relative", height: "100%" }}>
          <img src={ch.image} alt="" style={{
            height: "100%", maxWidth: "100%", objectFit: "contain", borderRadius: 18, display: "block",
            filter: "drop-shadow(0 8px 18px rgba(0,0,0,.45))", animation: "qs-rf-bob 1.6s ease-in-out infinite",
          }} />
          <span style={{ position: "absolute", right: -10, bottom: -6, fontSize: Math.round(size * 0.28), lineHeight: 1 }}>{emoji}</span>
        </div>
      ) : (
        <div style={{
          position: "relative", fontSize: Math.round(size * 0.7), lineHeight: 1,
          filter: `drop-shadow(0 8px 18px rgba(0,0,0,.45)) drop-shadow(0 0 14px ${rfRgba(t.neon, 0.6)})`,
          animation: "qs-rf-hero 1.4s ease-in-out infinite",
        }}>{emoji}</div>
      )}
    </div>
  );
}

function RFChallengeCard({ ch }) {
  const t = rfTheme(ch.color);
  return (
    <div style={{
      maxWidth: 760, margin: "0 auto 22px", padding: "22px 22px", borderRadius: 24, textAlign: "center",
      background: `linear-gradient(160deg, ${rfRgba(t.neon, 0.18)}, rgba(0,0,0,.35))`,
      border: `3px solid ${t.neon}`, boxShadow: `0 0 30px ${rfRgba(t.neon, 0.45)}`,
      animation: `qs-rf-card .7s cubic-bezier(.2,.9,.3,1.3) ${rfDelay(ch, 2.2)}s both`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".18em", color: t.neon, marginBottom: 4 }}>💪 RETO EN FÍSICO</div>
      <RFVisual ch={ch} size={90} />
      <div style={{ fontSize: "clamp(24px, 4.6vw, 46px)", fontWeight: 900, lineHeight: 1.2, color: "#fff" }}>{ch.text}</div>
      <div style={{ marginTop: 14, fontSize: 15, fontWeight: 700, opacity: .9 }}>
        🏃 Solo los <b style={{ color: t.neon }}>primeros {rfWinnersMax(ch)}</b> que lo completen ganan <b style={{ color: t.neon }}>+{rfPoints(ch)} puntos</b>
      </div>
    </div>
  );
}

// ---------- DOCENTE: botón + selector de reto ----------
function PhysicalChallengeButton({ onLaunch, style }) {
  const [open, setOpen] = useStateRF(false);
  const [cfg, setCfg] = useStateRF(rfUserConfig);
  const [draft, setDraft] = useStateRF("");
  const [pickedId, setPickedId] = useStateRF(null);
  const [busy, setBusy] = useStateRF(false);
  const t = rfTheme(cfg.color);
  const picked = cfg.retos.find(r => r.id === pickedId) || cfg.retos[0] || null;

  const openPicker = () => { setCfg(rfUserConfig()); setOpen(true); };
  // Un reto escrito aquí queda guardado en "tus retos" (perfil del docente).
  const addCustom = () => {
    const text = draft.trim();
    if (!text) return;
    const reto = { id: rfNewId(), text, emoji: rfEmojiFor(text), image: "" };
    const next = { ...cfg, retos: [...cfg.retos, reto] };
    setCfg(next); setPickedId(reto.id); setDraft("");
    rfSaveConfig(next).catch(err => console.warn("No se pudo guardar el reto nuevo:", err));
  };
  const launch = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try { await onLaunch(rfBuildChallenge(picked, cfg)); setOpen(false); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={openPicker} title="Pausar la sala y lanzar un reto en el salón" style={{
        position: "fixed", bottom: 16, left: 220, zIndex: 860,
        padding: "10px 16px", borderRadius: 999, cursor: "pointer", fontWeight: 900, fontSize: 14,
        fontFamily: RF_FONT, color: t.ink, background: t.neon, border: 0,
        boxShadow: `0 4px 0 ${rfRgba("#000000", 0.35)}, 0 0 22px ${rfRgba(t.neon, 0.6)}`, whiteSpace: "nowrap", ...style,
      }}>💪 ¡Reto Físico!</button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: "fixed", inset: 0, zIndex: 940, background: "rgba(0,0,0,.6)",
          display: "grid", placeItems: "center", padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", borderRadius: 22, padding: 20,
            background: rfBg(t), color: t.text, fontFamily: RF_FONT,
            border: `3px solid ${t.neon}`, boxShadow: `0 0 40px ${rfRgba(t.neon, 0.35)}`,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: t.neon }}>💪 ¡Reto Físico!</div>
                <div style={{ fontSize: 13, opacity: .85, lineHeight: 1.5 }}>
                  La sala se pausa y todos ven el reto. Los primeros {cfg.winners} que lo cumplan ganan +{cfg.points} puntos.
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: 0, color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "grid", gap: 6, margin: "12px 0" }}>
              {cfg.retos.map(r => {
                const on = picked && picked.id === r.id;
                return (
                  <button key={r.id} onClick={() => setPickedId(r.id)} style={{
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "8px 12px", borderRadius: 12, cursor: "pointer",
                    fontWeight: 700, fontSize: 14, fontFamily: RF_FONT, color: t.text,
                    background: on ? rfRgba(t.neon, 0.22) : "rgba(255,255,255,.05)",
                    border: "2px solid " + (on ? t.neon : "rgba(255,255,255,.12)"),
                  }}>
                    <span style={{ fontSize: 22, width: 28, textAlign: "center", flexShrink: 0 }}>{r.emoji || rfEmojiFor(r.text)}</span>
                    <span style={{ flex: 1 }}>{r.text}</span>
                    {r.image && <img src={r.image} alt="" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                    {on && <span style={{ color: t.neon }}>✅</span>}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <input className="qs-input" value={draft} maxLength={140} placeholder="Escribe un reto nuevo…"
                onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustom()}
                style={{ flex: 1, minWidth: 0 }} />
              <button onClick={addCustom} disabled={!draft.trim()} className="qs-btn qs-btn--sm" style={{
                background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)",
              }}>+ Agregar</button>
            </div>
            <p style={{ fontSize: 12, opacity: .7, margin: "8px 0 0" }}>
              🎨 Cambia los emojis, las imágenes y el color en el dashboard: «Editar Reto Físico».
            </p>

            <button onClick={launch} disabled={busy || !picked} className="qs-btn qs-btn--lg" style={{
              width: "100%", marginTop: 16, background: t.neon, color: t.ink, fontWeight: 900, border: 0,
              boxShadow: "0 4px 0 rgba(0,0,0,.35)",
            }}>{busy ? "Lanzando…" : "🚀 Lanzar reto a todos"}</button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- DOCENTE: pantalla del reto en curso ----------
function PhysicalChallengeHost({ session, onAward, onFinish }) {
  const ch = session.physicalChallenge;
  const t = rfTheme(ch.color);
  const introDone = useRFIntro(ch.id, ch.intro !== false);
  const pts = rfPoints(ch), max = rfWinnersMax(ch);
  const winners = ch.winners || [];
  const participants = Object.values(session.participants || {})
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const goal = Math.min(max, participants.length);
  const complete = winners.length >= goal && goal > 0;
  const medal = (i) => ["🥇", "🥈", "🥉"][i] || "🏅";

  return (
    <RFShell introDone={introDone} ch={ch}>
      <RFChallengeCard ch={ch} />
      <div style={{ maxWidth: 760, margin: "0 auto", animation: `qs-rf-card .6s ease ${rfDelay(ch, 2.5)}s both` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>
            🏆 Premiados: <span style={{ color: t.neon }}>{winners.length} / {goal || max}</span>
          </div>
          <div style={{ fontSize: 13, opacity: .8 }}>Toca +{pts} a quien lo cumpla primero</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
          {participants.map(p => {
            const place = winners.indexOf(p.id);
            const won = place >= 0;
            const locked = !won && winners.length >= max;
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 14,
                background: won ? rfRgba(t.neon, 0.2) : "rgba(255,255,255,.06)",
                border: "1px solid " + (won ? t.neon : "rgba(255,255,255,.12)"),
                opacity: locked ? .5 : 1,
              }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {won ? medal(place) + " " : ""}{p.name}
                </span>
                <button onClick={() => onAward(p.id)} disabled={won || locked} style={{
                  padding: "6px 12px", borderRadius: 10, fontWeight: 900, fontSize: 14, fontFamily: RF_FONT, border: 0,
                  cursor: won || locked ? "default" : "pointer",
                  background: won ? "transparent" : t.neon, color: won ? t.neon : t.ink,
                }}>{won ? `✓ +${pts}` : `+${pts}`}</button>
              </div>
            );
          })}
          {participants.length === 0 && <p style={{ opacity: .8 }}>No hay estudiantes en la sala.</p>}
        </div>

        <div style={{ textAlign: "center", marginTop: 22 }}>
          {complete ? (
            <button onClick={onFinish} className="qs-btn qs-btn--lg" style={{
              background: t.neon, color: t.ink, fontWeight: 900, border: 0, padding: "14px 28px",
              boxShadow: `0 4px 0 rgba(0,0,0,.35), 0 0 26px ${rfRgba(t.neon, 0.6)}`, animation: "qs-rf-pop .5s ease both",
            }}>↩️ Volver al quiz</button>
          ) : (
            <button onClick={() => { if (confirm("¿Terminar el reto sin premiar a los " + (goal || max) + "?")) onFinish(); }} style={{
              background: "transparent", border: 0, color: t.text, opacity: .7, textDecoration: "underline", cursor: "pointer", fontSize: 13,
            }}>Terminar el reto sin completarlo</button>
          )}
        </div>
      </div>
    </RFShell>
  );
}

// Tarjeta protagonista del reto: contorno de luz giratoria (un degradado
// cónico gira DETRÁS de la tarjeta y solo asoma por el borde), imagen o
// emoji grande que baila con halo y el texto del reto. `tv` = versión para
// televisor o videobeam (todo más grande). `footer` = línea de premio.
// `preview` = sin la espera de la intro (vista previa del estudio).
function RFHeroCard({ ch, tv = false, footer, preview = false }) {
  const t = rfTheme(ch.color);
  const hero = tv ? 230 : preview ? 110 : 150;
  const delay = preview ? 0 : rfDelay(ch, 2.2);
  return (
    <div style={{
      position: "relative", width: "100%", maxWidth: tv ? 1000 : 560, borderRadius: tv ? 40 : 30, padding: tv ? 6 : 4, overflow: "hidden",
      animation: `qs-rf-card .7s cubic-bezier(.2,.9,.3,1.3) ${delay}s both, qs-rf-glow 1.8s ease-in-out ${delay + 0.7}s infinite`,
    }}>
      <div aria-hidden="true" style={{
        position: "absolute", top: "50%", left: "50%", width: "160%", aspectRatio: "1 / 1",
        background: `conic-gradient(from 0deg, transparent 0deg, ${t.neon} 50deg, #ffffff 80deg, ${t.neon} 110deg, transparent 170deg, transparent 190deg, ${t.soft} 240deg, ${t.neon} 270deg, transparent 330deg)`,
        animation: "qs-rf-spin 3s linear infinite",
      }} />
      <div style={{
        position: "relative", borderRadius: tv ? 34 : 26, padding: tv ? "40px 36px 38px" : preview ? "18px 14px" : "26px 20px 24px", textAlign: "center",
        background: `radial-gradient(ellipse at 50% 0%, ${t.card[0]} 0%, ${t.card[1]} 60%, ${t.card[2]} 100%)`,
      }}>
        <div style={{ fontSize: tv ? 22 : 13, fontWeight: 900, letterSpacing: ".2em", color: t.neon, marginBottom: 6 }}>💪 RETO EN FÍSICO</div>
        <RFVisual ch={ch} size={hero} />
        <div style={{
          fontSize: tv ? "clamp(40px, 5.6vw, 84px)" : preview ? 22 : "clamp(26px, 7vw, 44px)", fontWeight: 900, lineHeight: 1.12, color: "#fff",
          textShadow: `0 0 18px ${rfRgba(t.neon, 0.55)}`, overflowWrap: "anywhere",
        }}>{ch.text}</div>
        {footer && (
          <div style={{
            display: "inline-block", marginTop: tv ? 22 : 14, padding: tv ? "12px 24px" : "8px 14px", borderRadius: 999,
            background: rfRgba(t.neon, 0.14), border: `1px solid ${t.neon}`, fontSize: tv ? 24 : preview ? 12 : 14, fontWeight: 800,
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}

const rfPrizeLine = (ch) => {
  const t = rfTheme(ch.color);
  return <>🏆 Los <b style={{ color: t.neon }}>primeros {rfWinnersMax(ch)}</b> ganan <b style={{ color: t.neon }}>+{rfPoints(ch)} puntos</b></>;
};

// ---------- TELEVISOR / VIDEOBEAM (Modo Sin Celular) ----------
// El docente lo lanza desde el mando del celular (19-mando.js). No hay
// celulares de estudiantes ni puntos digitales: solo el reto, en grande.
function PhysicalChallengeTV({ challenge }) {
  const introDone = useRFIntro(challenge.id, challenge.intro !== false);
  return (
    <RFShell introDone={introDone} ch={challenge}>
      <div style={{ minHeight: "calc(100vh - 68px)", display: "grid", placeItems: "center" }}>
        <RFHeroCard ch={challenge} tv footer={<>🏃 ¡El primero que lo cumpla gana!</>} />
      </div>
    </RFShell>
  );
}

// ---------- ESTUDIANTE: reto en su celular ----------
// El reto va centrado en la pantalla, con una luz que recorre todo el
// contorno de la tarjeta y la imagen o el emoji del reto bailando.
function PhysicalChallengeStudent({ session, myId }) {
  const ch = session.physicalChallenge;
  const t = rfTheme(ch.color);
  const introDone = useRFIntro(ch.id, ch.intro !== false);
  const pts = rfPoints(ch), max = rfWinnersMax(ch);
  const winners = ch.winners || [];
  const place = winners.indexOf(myId);
  const left = Math.max(0, max - winners.length);
  const placeText = ["🥇 Fuiste el primero", "🥈 Segundo lugar", "🥉 Tercer lugar"][place] || `🏅 Puesto ${place + 1}`;

  return (
    <RFShell introDone={introDone} ch={ch}>
      <div style={{
        minHeight: "calc(100vh - 68px)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 18,
      }}>
        <RFHeroCard ch={ch} footer={rfPrizeLine(ch)} />

      <div style={{ width: "100%", maxWidth: 520, textAlign: "center", animation: `qs-rf-card .6s ease ${rfDelay(ch, 2.5)}s both` }}>
        {place >= 0 ? (
          <div key="won" style={{ animation: "qs-rf-pop .6s cubic-bezier(.2,.9,.3,1.3) both" }}>
            <div style={{ fontSize: "clamp(72px, 22vw, 140px)", fontWeight: 900, color: t.neon, lineHeight: 1, textShadow: `0 0 30px ${t.neon}` }}>
              +{pts}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 8 }}>Excelente… ¡pero vendrán más…! 😏</div>
            <div style={{ fontSize: 14, opacity: .85, marginTop: 6 }}>{placeText}</div>
          </div>
        ) : (
          <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.5 }}>
            {/* Las copas: se apagan a medida que el docente premia */}
            <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 14, marginBottom: 8 }}>
              {Array.from({ length: max }, (_, i) => {
                const taken = i < winners.length;
                return (
                  <span key={i} style={{
                    fontSize: max > 5 ? 28 : 38, lineHeight: 1, transition: "filter .3s, opacity .3s",
                    filter: taken ? "grayscale(1)" : `drop-shadow(0 0 10px ${t.neon})`,
                    opacity: taken ? .35 : 1,
                    animation: taken ? "none" : `qs-rf-bob 1.2s ease-in-out ${i * .2}s infinite`,
                  }}>🏆</span>
                );
              })}
            </div>
            {left > 0 ? (
              <>
                ¡Rápido! Quedan <span style={{ color: t.neon }}>{left}</span> {left === 1 ? "premio" : "premios"}.<br />
                <span style={{ fontSize: 14, opacity: .8 }}>Cuando lo cumplas, el docente te da los puntos.</span>
              </>
            ) : (
              <>
                Ya ganaron los {max} primeros.<br />
                <span style={{ fontSize: 14, opacity: .8 }}>¡En el próximo reto sé más rápido!</span>
              </>
            )}
          </div>
        )}
        <p style={{ marginTop: 14, fontSize: 13, opacity: .7 }}>El quiz está en pausa: tu tiempo no corre.</p>
      </div>
      </div>
    </RFShell>
  );
}

// ============================================================
// ESTUDIO DE RETO FÍSICO (dashboard)
// ============================================================
const RF_INVITES = [
  "¿Qué reto les pones hoy? Edita la lista a tu gusto.",
  "Ponle a cada reto su emoji o una imagen.",
  "Elige el color con el que aparece en los celulares.",
  "¿Cuántos ganan y cuántos puntos? Tú decides.",
];

// Tarjeta del dashboard: invita a editar los retos (como la de Esmigol).
function RetoFisicoDashboardCard({ onEdit }) {
  const cfg = rfUserConfig();
  const t = rfTheme(cfg.color);
  const [inviteIdx, setInviteIdx] = useStateRF(0);
  useEffectRF(() => {
    const id = setInterval(() => setInviteIdx(i => (i + 1) % RF_INVITES.length), 6000);
    return () => clearInterval(id);
  }, []);
  const sample = cfg.retos[inviteIdx % Math.max(1, cfg.retos.length)];
  return (
    <div className="qs-card qs-rf-card" style={{
      padding: "20px 24px", marginBottom: 32, display: "flex", alignItems: "center", gap: 20,
      background: rfBg(t), border: `2px solid ${t.neon}`, color: t.text, ...rfVars(t),
    }}>
      <RFStyles />
      <style>{`@media (max-width: 640px) { .qs-rf-card { flex-direction: column; text-align: center; } .qs-rf-card-chips { justify-content: center; } }`}</style>
      <div style={{
        width: 104, height: 104, flexShrink: 0, borderRadius: 24, display: "grid", placeItems: "center",
        background: rfRgba(t.neon, 0.14), border: `2px solid ${t.neon}`, overflow: "hidden",
        animation: "qs-rf-glow 1.8s ease-in-out infinite",
      }}>
        {sample && sample.image
          ? <img src={sample.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 60, animation: "qs-rf-hero 1.4s ease-in-out infinite" }}>{(sample && (sample.emoji || rfEmojiFor(sample.text))) || "💪"}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".16em", color: t.neon, marginBottom: 4 }}>💪 RETO FÍSICO</div>
        <div key={inviteIdx} style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{RF_INVITES[inviteIdx]}</div>
        <div className="qs-rf-card-chips" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, fontSize: 12, fontWeight: 800 }}>
          {[`💪 ${cfg.retos.length} retos`, `🎨 ${t.label}`, `🏆 +${cfg.points} pts · ${cfg.winners} ganan`, cfg.intro ? "🎬 Con entrada" : "🎬 Sin entrada"].map(s => (
            <span key={s} style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.18)", borderRadius: 999, padding: "3px 10px" }}>{s}</span>
          ))}
        </div>
        <button onClick={onEdit} className="qs-btn qs-btn--sm" style={{
          background: t.neon, color: t.ink, border: 0, boxShadow: "0 3px 0 rgba(0,0,0,.35)", fontWeight: 900,
        }}>🎨 Editar Reto Físico: retos, emojis, imágenes y color</button>
      </div>
    </div>
  );
}

function RetoFisicoStudioModal({ onClose, onSaved }) {
  const [cfg, setCfg] = useStateRF(() => JSON.parse(JSON.stringify(rfUserConfig())));
  const [dirty, setDirty] = useStateRF(false);
  const [saving, setSaving] = useStateRF(false);
  const [saveMsg, setSaveMsg] = useStateRF("");
  const [tab, setTab] = useStateRF("retos");
  const [selId, setSelId] = useStateRF(() => (cfg.retos[0] ? cfg.retos[0].id : null));
  const [introKey, setIntroKey] = useStateRF(0);   // repetir la entrada en la vista previa
  const [showIntro, setShowIntro] = useStateRF(false);
  const t = rfTheme(cfg.color);
  const sel = cfg.retos.find(r => r.id === selId) || cfg.retos[0] || null;

  const patch = (p) => { setCfg(c => ({ ...c, ...p })); setDirty(true); setSaveMsg(""); };
  const setRetos = (retos) => patch({ retos });
  const updateReto = (id, p) => setRetos(cfg.retos.map(r => r.id === id ? { ...r, ...p } : r));
  const moveReto = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= cfg.retos.length) return;
    const list = [...cfg.retos]; [list[i], list[j]] = [list[j], list[i]]; setRetos(list);
  };
  const deleteReto = (id) => {
    if (cfg.retos.length <= 1) { alert("Debe quedar al menos un reto."); return; }
    const list = cfg.retos.filter(r => r.id !== id);
    setRetos(list);
    if (selId === id) setSelId(list[0].id);
  };
  const addReto = () => {
    const reto = { id: rfNewId(), text: "Nuevo reto: escríbelo aquí", emoji: "⚡", image: "" };
    setRetos([...cfg.retos, reto]); setSelId(reto.id);
  };
  const resetRetos = () => {
    if (!confirm("¿Volver a los retos originales? Se pierden los cambios y los retos nuevos.")) return;
    const base = RF_PRESETS.map((x, i) => ({ id: "rf-base-" + i, text: x, emoji: rfEmojiFor(x), image: "" }));
    setRetos(base); setSelId(base[0].id);
  };
  const uploadImage = async (file) => {
    if (!sel || !file) return;
    try { updateReto(sel.id, { image: await rfImageFileToDataUrl(file) }); }
    catch (err) { alert(err.message); }
  };
  const linkImage = () => {
    if (!sel) return;
    const url = prompt("Pega el enlace de la imagen (https://…):", /^https?:/.test(sel.image || "") ? sel.image : "");
    if (url == null) return;
    const u = url.trim();
    if (u && !/^https?:\/\//i.test(u)) { alert("El enlace debe empezar por http:// o https://"); return; }
    updateReto(sel.id, { image: u });
  };

  const save = async () => {
    const clean = {
      ...cfg,
      title1: String(cfg.title1 || "").trim() || RF_DEFAULT_CONFIG.title1,
      title2: String(cfg.title2 || "").trim(),
      points: rfClamp(cfg.points, 1, 100, RF_POINTS),
      winners: rfClamp(cfg.winners, 1, 10, RF_WINNERS),
      retos: cfg.retos.map(r => ({ id: r.id, text: String(r.text || "").trim(), emoji: r.emoji || "", image: r.image || "" }))
        .filter(r => r.text),
    };
    if (clean.retos.length === 0) { alert("Escribe al menos un reto."); return; }
    if (JSON.stringify(clean).length > 700000) { alert("Hay demasiadas imágenes subidas. Quita algunas o usa enlaces."); return; }
    setSaving(true);
    try {
      await rfSaveConfig(clean);
      setCfg(clean); setDirty(false); setSaveMsg("✅ Guardado. Así aparecerán tus próximos retos.");
      onSaved && onSaved(clean);
    } catch (err) {
      console.error("Error guardando Reto Físico:", err);
      alert("No se pudo guardar: " + err.message);
    } finally { setSaving(false); }
  };
  const requestClose = () => {
    if (dirty && !confirm("Tienes cambios sin guardar en Reto Físico. ¿Salir sin guardar?")) return;
    onClose();
  };

  const previewCh = sel ? { id: "preview-" + introKey, ...rfBuildChallenge(sel, cfg) } : null;
  const label = { fontSize: 12, fontWeight: 800, color: "var(--ink-500)", marginBottom: 6, display: "block" };
  const smallBtn = { padding: "6px 9px", borderRadius: 8, border: "1px solid var(--ink-200)", background: "var(--ink-50)", color: "var(--ink-700)", cursor: "pointer", fontSize: 13 };

  return (
    <div onClick={requestClose} style={{
      position: "fixed", inset: 0, zIndex: 900, background: "rgba(10,4,28,.72)", display: "grid", placeItems: "center", padding: 16,
    }}>
      <style>{`
        .qs-rf-studio { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; }
        @media (max-width: 860px) { .qs-rf-studio { grid-template-columns: 1fr; } }
      `}</style>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{
        width: "100%", maxWidth: 1000, maxHeight: "92vh", overflowY: "auto", padding: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 22, flex: 1, margin: 0 }}>💪 Estudio de Reto Físico</h2>
          {saveMsg && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--emerald-500)" }}>{saveMsg}</span>}
          <button onClick={save} disabled={saving || !dirty} className="qs-btn qs-btn--primary qs-btn--sm">{saving ? "Guardando…" : "💾 Guardar"}</button>
          <button onClick={requestClose} className="qs-btn qs-btn--ghost qs-btn--sm">Cerrar</button>
        </div>

        <div className="qs-rf-studio">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              {[{ id: "retos", label: "💪 Retos" }, { id: "apariencia", label: "🎨 Apariencia" }].map(x => (
                <button key={x.id} onClick={() => setTab(x.id)} className={"qs-btn qs-btn--sm " + (tab === x.id ? "qs-btn--primary" : "qs-btn--ghost")}>{x.label}</button>
              ))}
            </div>

            {tab === "retos" && (
              <>
                <div style={{ display: "grid", gap: 6 }}>
                  {cfg.retos.map((r, i) => {
                    const on = sel && sel.id === r.id;
                    return (
                      <div key={r.id} onClick={() => setSelId(r.id)} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: 6, borderRadius: 12, cursor: "pointer",
                        background: on ? "var(--violet-50)" : "transparent", border: "1px solid " + (on ? "var(--violet-400)" : "var(--ink-200)"),
                      }}>
                        <input value={r.emoji || ""} maxLength={8} placeholder={rfEmojiFor(r.text)} title="Emoji del reto"
                          onChange={e => updateReto(r.id, { emoji: e.target.value.trim() })}
                          className="qs-input" style={{ width: 48, padding: "6px 4px", fontSize: 20, textAlign: "center", flexShrink: 0 }} />
                        <input value={r.text} maxLength={140} onChange={e => updateReto(r.id, { text: e.target.value })}
                          className="qs-input" style={{ flex: 1, minWidth: 0, padding: "8px 10px", fontSize: 14 }} />
                        {r.image && <img src={r.image} alt="" title="Tiene imagen" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                        <button onClick={e => { e.stopPropagation(); moveReto(i, -1); }} disabled={i === 0} title="Subir" style={smallBtn}>↑</button>
                        <button onClick={e => { e.stopPropagation(); moveReto(i, 1); }} disabled={i === cfg.retos.length - 1} title="Bajar" style={smallBtn}>↓</button>
                        <button onClick={e => { e.stopPropagation(); deleteReto(r.id); }} title="Eliminar reto" style={{ ...smallBtn, color: "var(--red-500)" }}>🗑️</button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={addReto} className="qs-btn qs-btn--sm qs-btn--primary">+ Nuevo reto</button>
                  <button onClick={resetRetos} className="qs-btn qs-btn--sm qs-btn--ghost">↺ Retos originales</button>
                </div>

                {sel && (
                  <div style={{ marginTop: 16, padding: 14, borderRadius: 14, border: "1px solid var(--ink-200)", background: "var(--ink-50)" }}>
                    <div style={{ fontWeight: 800, marginBottom: 10, fontSize: 14 }}>Reto elegido: <span style={{ color: "var(--violet-400)" }}>{sel.text || "(sin texto)"}</span></div>
                    <span style={label}>Emoji rápido</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                      {RF_EMOJI_PALETTE.map(e => (
                        <button key={e} onClick={() => updateReto(sel.id, { emoji: e })} style={{
                          width: 38, height: 38, fontSize: 20, borderRadius: 10, cursor: "pointer",
                          background: (sel.emoji || rfEmojiFor(sel.text)) === e ? "var(--violet-100)" : "transparent",
                          border: "1px solid " + ((sel.emoji || rfEmojiFor(sel.text)) === e ? "var(--violet-400)" : "var(--ink-200)"),
                        }}>{e}</button>
                      ))}
                    </div>
                    <span style={label}>Imagen (opcional: reemplaza al emoji grande)</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      {sel.image && <img src={sel.image} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10 }} />}
                      <label className="qs-btn qs-btn--sm qs-btn--ghost" style={{ cursor: "pointer" }}>
                        📷 Subir imagen
                        <input type="file" accept="image/*" style={{ display: "none" }}
                          onChange={e => { uploadImage(e.target.files && e.target.files[0]); e.target.value = ""; }} />
                      </label>
                      <button onClick={linkImage} className="qs-btn qs-btn--sm qs-btn--ghost">🔗 Pegar enlace</button>
                      {sel.image && <button onClick={() => updateReto(sel.id, { image: "" })} className="qs-btn qs-btn--sm qs-btn--ghost" style={{ color: "var(--red-500)" }}>Quitar imagen</button>}
                    </div>
                    <p style={{ fontSize: 11, color: "var(--ink-500)", margin: "8px 0 0", lineHeight: 1.5 }}>
                      Las imágenes subidas se reducen para que carguen rápido en los celulares. Para un GIF animado, usa «Pegar enlace».
                    </p>
                  </div>
                )}
              </>
            )}

            {tab === "apariencia" && (
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <span style={label}>Color</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {RF_THEMES.map(th => (
                      <button key={th.id} onClick={() => patch({ color: th.id })} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 999, cursor: "pointer",
                        background: rfBg(th), color: th.text, fontWeight: 800, fontSize: 13,
                        border: `2px solid ${cfg.color === th.id ? th.neon : "transparent"}`,
                        boxShadow: cfg.color === th.id ? `0 0 14px ${rfRgba(th.neon, 0.6)}` : "none",
                      }}>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", background: th.neon }} />{th.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span style={label}>Título de la entrada (las dos palabras que se cruzan)</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input className="qs-input" value={cfg.title1} maxLength={18} placeholder="MODO RETO"
                      onChange={e => patch({ title1: e.target.value })} style={{ flex: "1 1 160px" }} />
                    <input className="qs-input" value={cfg.title2} maxLength={18} placeholder="EN FÍSICO (opcional)"
                      onChange={e => patch({ title2: e.target.value })} style={{ flex: "1 1 160px" }} />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 14, cursor: "pointer" }}>
                    <input type="checkbox" checked={cfg.intro !== false} onChange={e => patch({ intro: e.target.checked })} />
                    🎬 Mostrar la animación de entrada antes del reto
                  </label>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <span style={label}>Puntos por ganador</span>
                    <input type="number" min={1} max={100} className="qs-input" value={cfg.points}
                      onChange={e => patch({ points: e.target.value })} style={{ width: 110 }} />
                  </div>
                  <div>
                    <span style={label}>¿Cuántos ganan?</span>
                    <input type="number" min={1} max={10} className="qs-input" value={cfg.winners}
                      onChange={e => patch({ winners: e.target.value })} style={{ width: 110 }} />
                  </div>
                </div>
                <button onClick={() => patch({ ...RF_DEFAULT_CONFIG })} className="qs-btn qs-btn--sm qs-btn--ghost" style={{ justifySelf: "start" }}>
                  ↺ Apariencia original
                </button>
              </div>
            )}
          </div>

          {/* Vista previa: el mismo componente que ve el estudiante */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ ...label, marginBottom: 0 }}>📱 Así lo verán los estudiantes</span>
              <button onClick={() => { setShowIntro(true); setIntroKey(k => k + 1); }} className="qs-btn qs-btn--sm qs-btn--ghost"
                disabled={cfg.intro === false} title={cfg.intro === false ? "La entrada está apagada" : "Ver la entrada"}>▶ Entrada</button>
            </div>
            <div style={{ position: "relative", height: 520, borderRadius: 28, overflow: "hidden", border: "6px solid #0b0b14", boxShadow: "0 12px 30px rgba(0,0,0,.4)" }}>
              {previewCh && (
                <RFPreviewPhone key={previewCh.id} ch={previewCh} intro={showIntro && cfg.intro !== false} onIntroEnd={() => setShowIntro(false)} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Vista previa del celular dentro del estudio.
function RFPreviewPhone({ ch, intro, onIntroEnd }) {
  useEffectRF(() => {
    if (!intro) return;
    const id = setTimeout(onIntroEnd, 2600);
    return () => clearTimeout(id);
  }, [intro]);
  const shown = intro ? ch : { ...ch, intro: false };
  return (
    <RFShell introDone={!intro} ch={shown} contained>
      <div style={{ minHeight: 470, display: "grid", placeItems: "center" }}>
        <RFHeroCard ch={shown} preview={!intro} footer={rfPrizeLine(shown)} />
      </div>
    </RFShell>
  );
}

window.RF_POINTS = RF_POINTS;
window.RF_WINNERS = RF_WINNERS;
window.PhysicalChallengeButton = PhysicalChallengeButton;
window.PhysicalChallengeHost = PhysicalChallengeHost;
window.PhysicalChallengeStudent = PhysicalChallengeStudent;
window.PhysicalChallengeTV = PhysicalChallengeTV;
window.RetoFisicoDashboardCard = RetoFisicoDashboardCard;
window.RetoFisicoStudioModal = RetoFisicoStudioModal;
window.rfConfigFrom = rfConfigFrom;
window.rfUserConfig = rfUserConfig;
window.rfSaveConfig = rfSaveConfig;
window.rfBuildChallenge = rfBuildChallenge;
window.rfChallengeFromCommand = rfChallengeFromCommand;
window.rfEmojiFor = rfEmojiFor;
