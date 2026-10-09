/* global React, I, youtubeId, tileColor, hexToRgba */
// ============================================================
// QuizSpark — LECTIO (modo "Modo Sin Celular")
// ------------------------------------------------------------
// Un cuarto tipo de actividad, junto a Quiz, Encuesta y Taller:
// el docente crea preguntas de opción múltiple (por ahora, el único
// tipo soportado) y las PROYECTA una por una desde este equipo, sin
// que los estudiantes necesiten celular ni haya sala en línea. El
// propio docente revela la respuesta correcta cuando quiere.
//
// Hoja de ruta (no implementado todavía): este modo se irá "escalando"
// hasta poder calificar automáticamente hojas de respuesta escaneadas
// (lectura óptica de marcas / OMR) en vez de revelar manualmente.
//
// Componente expuesto (bare window, igual que 10-workshop.js):
//   LectioPresenter — pantalla de presentación tipo diapositivas,
//   usada por el Editor cuando quiz.mode === "lectio".
// ============================================================
const { useState: useStateLec, useEffect: useEffectLec, useCallback: useCallbackLec, useRef: useRefLec } = React;

// ---- Temas de proyección ----
// El salón de clase no siempre tiene las mismas condiciones de luz: un
// proyector viejo o un salón muy iluminado "lava" los colores oscuros.
// Por eso el docente puede cambiar de tema en caliente durante la
// presentación (se recuerda en este equipo para la próxima vez).
const LECTIO_THEMES = {
  dark: {
    id: "dark", label: "🌙 Oscuro",
    bg: "radial-gradient(ellipse 900px 650px at 10% -10%, rgba(20,184,166,0.20), transparent 60%), " +
      "radial-gradient(ellipse 800px 600px at 105% 15%, rgba(14,165,233,0.16), transparent 55%), " +
      "linear-gradient(180deg, #0b1220 0%, #060a13 100%)",
    surface: "#101a2e", surface2: "#0b1526", border: "rgba(255,255,255,0.12)",
    text: "#f1f5f9", textMuted: "#94a3b8", accent: "#14b8a6", accent2: "#0ea5e9",
    chipBg: "rgba(255,255,255,0.08)",
  },
  light: {
    id: "light", label: "☀️ Claro",
    bg: "linear-gradient(180deg, #ffffff 0%, #eef2f7 100%)",
    surface: "#ffffff", surface2: "#f1f5f9", border: "rgba(15,23,42,0.14)",
    text: "#0f172a", textMuted: "#475569", accent: "#0d9488", accent2: "#0369a1",
    chipBg: "rgba(15,23,42,0.06)",
  },
  bw: {
    id: "bw", label: "⬛ Blanco y negro",
    bg: "#ffffff",
    surface: "#ffffff", surface2: "#f4f4f4", border: "#000000",
    text: "#000000", textMuted: "#3a3a3a", accent: "#000000", accent2: "#000000",
    chipBg: "#f4f4f4",
  },
  contrast: {
    id: "contrast", label: "⚡ Alto contraste",
    bg: "#000000",
    surface: "#000000", surface2: "#0a0a0a", border: "#facc15",
    text: "#facc15", textMuted: "#fde68a", accent: "#facc15", accent2: "#fde047",
    chipBg: "#0a0a0a",
  },
};
const LECTIO_THEME_ORDER = ["dark", "light", "bw", "contrast"];
const LECTIO_THEME_STORAGE_KEY = "qs_lectio_theme";

// Estilo de cada tile de opción según el tema y su estado (revelada/correcta).
// Cada tema resuelve el contraste distinto: "bw" invierte relleno/texto en vez
// de usar color (para quedar realmente en blanco y negro), "contrast" usa
// amarillo puro sobre negro, y "dark"/"light" usan un tinte del acento.
function lectioOptionStyle(theme, i, revealed, isCorrect) {
  const dim = revealed && !isCorrect;
  if (theme.id === "bw") {
    return {
      background: revealed && isCorrect ? "#000000" : "#ffffff",
      color: revealed && isCorrect ? "#ffffff" : "#000000",
      border: "3px solid #000000",
      opacity: dim ? 0.45 : 1,
      boxShadow: "none",
    };
  }
  if (theme.id === "contrast") {
    return {
      background: revealed && isCorrect ? theme.accent : "#000000",
      color: revealed && isCorrect ? "#000000" : theme.accent,
      border: `3px solid ${theme.accent}`,
      opacity: dim ? 0.4 : 1,
      boxShadow: "none",
    };
  }
  if (theme.id === "light") {
    return {
      background: revealed && isCorrect ? hexToRgba(theme.accent, 0.16) : theme.surface2,
      color: theme.text,
      border: revealed && isCorrect ? `3px solid ${theme.accent}` : "3px solid rgba(15,23,42,0.12)",
      opacity: dim ? 0.5 : 1,
      boxShadow: revealed && isCorrect ? `0 0 0 4px ${hexToRgba(theme.accent, 0.18)}` : "0 2px 8px rgba(15,23,42,0.08)",
    };
  }
  // dark (por defecto)
  return {
    background: revealed && isCorrect ? hexToRgba(theme.accent, 0.22) : tileColor(i),
    color: "#fff",
    border: revealed && isCorrect ? `3px solid ${theme.accent}` : "3px solid transparent",
    opacity: dim ? 0.4 : 1,
    boxShadow: revealed && isCorrect ? `0 0 0 4px ${hexToRgba(theme.accent, 0.28)}` : "var(--shadow-tile)",
  };
}
function lectioBadgeStyle(theme) {
  if (theme.id === "bw") return { background: "#ffffff", color: "#000000" };
  if (theme.id === "contrast") return { background: "#000000", color: theme.accent };
  if (theme.id === "light") return { background: theme.accent, color: "#ffffff" };
  return { background: theme.accent, color: "#04201b" };
}
// Insignia con la letra A/B/C/D de cada opción — siempre visible (no solo
// al revelar), para que coincida con las columnas de la hoja OMR impresa.
function lectioLetterStyle(theme) {
  if (theme.id === "bw") return { background: "#000000", color: "#ffffff" };
  if (theme.id === "contrast") return { background: theme.accent, color: "#000000" };
  if (theme.id === "light") return { background: hexToRgba(theme.accent, 0.18), color: theme.text };
  return { background: "rgba(255,255,255,0.22)", color: "#ffffff" }; // dark
}

function LectioCard({ theme, children, style }) {
  return (
    <div style={{
      background: theme.surface, border: "1px solid " + theme.border,
      borderRadius: 20, boxShadow: theme.id === "dark" ? "0 10px 34px rgba(0,0,0,0.5)" : "0 6px 20px rgba(15,23,42,0.08)",
      color: theme.text, ...style,
    }}>{children}</div>
  );
}

// Selector de tema: un botón discreto en la esquina inferior izquierda que
// despliega las opciones hacia arriba (para ajustar sobre la marcha según la
// luz del salón / calidad del proyector, sin quitarle espacio a la pregunta).
function LectioThemeSwitcher({ theme, onChange }) {
  const [open, setOpen] = useStateLec(false);
  const onColor = theme.id === "contrast" ? "#000000" : "#ffffff";
  return (
    <div style={{ position: "fixed", left: 18, bottom: 16, zIndex: 520 }}>
      {open && (
        <>
          {/* Capa invisible: cerrar al hacer clic afuera */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0 }} />
          <div style={{
            position: "absolute", left: 0, bottom: "calc(100% + 8px)", display: "grid", gap: 6, minWidth: 180,
            padding: 8, borderRadius: 14, background: theme.surface, border: "1px solid " + theme.border,
            boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}>
            {LECTIO_THEME_ORDER.map(id => {
              const t = LECTIO_THEMES[id];
              const on = theme.id === id;
              return (
                <button key={id} onClick={() => { onChange(id); setOpen(false); }} style={{
                  textAlign: "left", padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  background: on ? theme.accent : "transparent",
                  color: on ? onColor : theme.text,
                  border: "1px solid " + (on ? theme.accent : "transparent"),
                }}>{t.label}</button>
              );
            })}
          </div>
        </>
      )}
      <button onClick={() => setOpen(o => !o)} title="Cambiar el tema de la proyección" style={{
        position: "relative", padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
        background: theme.chipBg, color: theme.textMuted, border: "1px solid " + theme.border,
      }}>🎨 Tema {open ? "▾" : "▴"}</button>
    </div>
  );
}

// ============================================================
// PRESENTADOR — diapositivas de una en una, revelación manual
// ============================================================
function LectioPresenter({ quiz, onExit }) {
  // Por ahora este modo solo soporta opción múltiple: se filtra por si
  // el quiz trae preguntas de otro tipo (p. ej. quedaron de un cambio
  // de modo anterior).
  const slides = (quiz.questions || []).filter(q => q.type === "multi");
  const [idx, setIdx] = useStateLec(0);
  const [revealed, setRevealed] = useStateLec(false);
  const [finished, setFinished] = useStateLec(false);
  // Cuenta regresiva META (14-meta.js) antes de la primera diapositiva.
  const [metaDone, setMetaDone] = useStateLec(false);
  const [themeId, setThemeId] = useStateLec(() => {
    try { return localStorage.getItem(LECTIO_THEME_STORAGE_KEY) || "dark"; } catch (e) { return "dark"; }
  });
  const theme = LECTIO_THEMES[themeId] || LECTIO_THEMES.dark;

  useEffectLec(() => {
    try { localStorage.setItem(LECTIO_THEME_STORAGE_KEY, themeId); } catch (e) { /* almacenamiento no disponible: no es crítico */ }
  }, [themeId]);

  const safeIdx = Math.min(idx, Math.max(0, slides.length - 1));
  const q = slides[safeIdx];
  const isLast = safeIdx >= slides.length - 1;

  const goNext = useCallbackLec(() => {
    if (isLast) { setFinished(true); return; }
    setIdx(i => i + 1);
    setRevealed(false);
  }, [isLast]);

  const goPrev = useCallbackLec(() => {
    if (safeIdx === 0) return;
    setIdx(i => i - 1);
    setRevealed(false);
  }, [safeIdx]);

  // Atajos de teclado: flechas para avanzar/retroceder, espacio/R para
  // revelar, Escape para salir — pensado para controlar desde el mismo
  // teclado o un "clicker" de presentaciones.
  useEffectLec(() => {
    const onKey = (e) => {
      if (finished || !slides.length || !metaDone) return;
      if (e.key === "ArrowRight") { goNext(); }
      else if (e.key === "ArrowLeft") { goPrev(); }
      else if (e.key === " " || e.key === "r" || e.key === "R") { e.preventDefault(); setRevealed(v => !v); }
      else if (e.key === "Escape") { onExit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, slides.length, metaDone, goNext, goPrev, onExit]);

  // Esmigol (14-meta.js): reglas de aparición. Este modo es presentación
  // manejada por el DOCENTE (no hay respuestas digitales de estudiantes),
  // así que solo aplican la regla 1 (mucho tiempo en la misma diapositiva)
  // y la 2 (motivar cada 5 min) — no hay "nota" en vivo que ofrecer para
  // la regla 3, así que se omite `lowGrade` y el motor la deja apagada.
  const presentationStartedAtRef = useRefLec(Date.now());
  const esmigol = window.useEsmigolTriggers ? window.useEsmigolTriggers({
    mode: quiz.mode, cfg: window.esmigolConfigFor ? window.esmigolConfigFor(quiz) : quiz.metaTriggers,
    active: metaDone && !finished && slides.length > 0,
    questionId: q?.id,
    startedAt: presentationStartedAtRef.current,
  }) : { node: null };

  // ---- RELOJ POR PREGUNTA ----
  // Cada pregunta usa el tiempo que se le asignó en el editor (q.timer, en
  // segundos; 60 por defecto). Se reinicia al cambiar de pregunta, se congela
  // al revelar la respuesta y, al llegar a 0, muestra "Fin del tiempo…" en
  // grande. Se maneja con una hora de fin (clockEnd) o, en pausa, con lo que
  // quedaba (clockPausedLeft).
  const qSeconds = q && Number(q.timer) > 0 ? Number(q.timer) : 60;
  const [clockEnd, setClockEnd] = useStateLec(null);
  const [clockPausedLeft, setClockPausedLeft] = useStateLec(null);
  const [clockNow, setClockNow] = useStateLec(Date.now());
  const [timeUpFor, setTimeUpFor] = useStateLec(null);   // id de la pregunta cuyo tiempo ya se anunció
  const [timeUpShow, setTimeUpShow] = useStateLec(false); // "Fin del tiempo…" en pantalla
  useEffectLec(() => {
    if (!metaDone || finished || !q) { setClockEnd(null); setClockPausedLeft(null); return; }
    const now = Date.now();
    setClockEnd(now + qSeconds * 1000); setClockPausedLeft(null); setClockNow(now);
    setTimeUpFor(null); setTimeUpShow(false);
  }, [metaDone, finished, q?.id]);
  useEffectLec(() => {
    if (clockEnd == null || clockPausedLeft != null) return;
    const id = setInterval(() => setClockNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [clockEnd, clockPausedLeft]);
  const clockOn = clockEnd != null || clockPausedLeft != null;
  const clockLeft = clockPausedLeft != null ? clockPausedLeft : Math.max(0, (clockEnd || 0) - clockNow);
  // Se acabó el tiempo (una vez por pregunta, y no si ya se reveló).
  useEffectLec(() => {
    if (!clockOn || clockLeft > 0 || revealed || !q || timeUpFor === q.id) return;
    setTimeUpFor(q.id); setTimeUpShow(true);
  }, [clockLeft <= 0, clockOn, revealed, q?.id]);
  useEffectLec(() => {
    if (!timeUpShow) return;
    const t = setTimeout(() => setTimeUpShow(false), 4500);
    return () => clearTimeout(t);
  }, [timeUpShow]);
  // Revelar la respuesta congela el reloj; ocultarla (en la MISMA pregunta)
  // lo reanuda. Si se pasó a otra pregunta, el reinicio de arriba manda.
  const revealedOnQRef = useRefLec(null);
  useEffectLec(() => {
    if (revealed) { revealedOnQRef.current = q?.id; clockPause(); setTimeUpShow(false); }
    else { if (revealedOnQRef.current && revealedOnQRef.current === q?.id) clockResume(); revealedOnQRef.current = null; }
  }, [revealed]);
  // sec: segundos a sumar (negativo para restar), desde el mando o el botón.
  const clockAdd = (sec) => {
    const ms = sec * 1000;
    if (clockPausedLeft != null) { setClockPausedLeft(l => Math.max(0, l + ms)); return; }
    const now = Date.now();
    setClockEnd(e => Math.max(now, (e == null ? now : Math.max(e, now))) + ms);
    setClockNow(now);
    if (sec > 0) setTimeUpShow(false);
  };
  const clockPause = () => {
    if (clockPausedLeft != null || clockEnd == null) return;
    setClockPausedLeft(Math.max(0, clockEnd - Date.now()));
  };
  const clockResume = () => {
    if (clockPausedLeft == null) return;
    const now = Date.now();
    setClockEnd(now + clockPausedLeft);
    setClockPausedLeft(null);
    setClockNow(now);
  };
  // Volver a dar el tiempo completo de la pregunta actual.
  const clockReset = () => {
    if (!q) return;
    const now = Date.now();
    setClockPausedLeft(null); setClockEnd(now + qSeconds * 1000); setClockNow(now);
    setTimeUpFor(null); setTimeUpShow(false);
  };

  // ---- MANDO DEL CELULAR (19-mando.js) ----
  // Reto físico y Esmigol en grande, lanzados desde el celular del docente.
  const [tvChallenge, setTvChallenge] = useStateLec(null); // { id, text }
  const [tvEsmigol, setTvEsmigol] = useStateLec(null);     // { text, expression, at }
  const [showRemote, setShowRemote] = useStateLec(false);
  const onRemoteCommand = (cmd) => {
    if (!metaDone) setMetaDone(true); // cualquier orden salta la cuenta regresiva
    const p = cmd.payload;
    switch (cmd.type) {
      case "next": goNext(); break;
      case "prev": goPrev(); break;
      case "goto":
        if (typeof p === "number" && p >= 0 && p < slides.length) { setIdx(p); setRevealed(false); setFinished(false); }
        break;
      case "reveal": setRevealed(typeof p === "boolean" ? p : (v => !v)); break;
      case "restart": setIdx(0); setRevealed(false); setFinished(false); clockReset(); break;
      // p = segundos (negativo para restar). Restar solo si ya hay reloj.
      case "clockAdd": if (typeof p === "number" && p !== 0 && (p > 0 || clockOn)) clockAdd(p); break;
      case "clockPause": clockPause(); break;
      case "clockResume": clockResume(); break;
      case "clockReset": clockReset(); break;
      case "challenge": if (p && p.text) setTvChallenge({ id: cmd.id, text: p.text }); break;
      case "challengeEnd": setTvChallenge(null); break;
      case "esmigol": if (p && p.text) setTvEsmigol({ text: p.text, expression: p.expression, at: cmd.at || Date.now() }); break;
      default: break;
    }
  };
  const remote = window.useLectioRemote
    ? window.useLectioRemote({ quiz, onCommand: onRemoteCommand })
    : { remoteId: null, open: async () => null, publish: () => {}, connected: false };
  // El celular ve en qué pregunta va la presentación (y cuál es la correcta).
  useEffectLec(() => {
    if (!remote.remoteId) return;
    const plain = window.mandoPlain || (s => String(s || ""));
    remote.publish({
      idx: safeIdx, total: slides.length, revealed, finished,
      challenge: tvChallenge ? tvChallenge.text : null,
      // El celular sigue contando por su cuenta desde que recibe este dato
      // (no depende de que los relojes de ambos equipos coincidan).
      clock: clockOn ? { leftMs: clockLeft, paused: clockPausedLeft != null, stamp: (clockEnd || 0) + "-" + (clockPausedLeft ?? "") } : null,
      question: q ? {
        text: plain(q.text),
        options: (q.options || []).map((o, i) => ({ letter: String.fromCharCode(65 + i), text: plain(o.text), correct: !!o.correct })),
      } : null,
    });
  }, [remote.remoteId, safeIdx, revealed, finished, tvChallenge, slides.length, clockEnd, clockPausedLeft, clockOn]);
  const openRemote = async () => { setShowRemote(true); await remote.open(); };
  // Capas del mando: van en TODAS las pantallas del presentador.
  const remoteLayers = (
    <>
      {tvChallenge && window.PhysicalChallengeTV && <window.PhysicalChallengeTV key={tvChallenge.id} challenge={tvChallenge} />}
      {tvEsmigol && window.LectioEsmigolTV && <window.LectioEsmigolTV msg={tvEsmigol} onDone={() => setTvEsmigol(null)} />}
      {showRemote && window.LectioRemotePanel && (
        <window.LectioRemotePanel remoteId={remote.remoteId} connected={remote.connected} onClose={() => setShowRemote(false)} />
      )}
    </>
  );

  // Reloj de la pregunta en la esquina inferior derecha, con el color del
  // tema; ámbar en los últimos 10 s y rojo al llegar a 0. Los botones "+30s" / pausa
  // aparecen al pasar el mouse (el docente junto al computador); desde el
  // mando del celular están siempre.
  const fmtClock = (ms) => {
    const s = Math.ceil(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  };
  const clockOut = clockOn && clockLeft <= 0;
  const clockWarn = clockOn && !clockOut && clockLeft <= 10000; // últimos 10 s
  const clockBtn = {
    background: "transparent", color: "inherit", border: "1px solid currentColor",
    borderRadius: 6, padding: "1px 6px", fontSize: 11, fontWeight: 800, cursor: "pointer", opacity: .8,
  };
  // "Fin del tiempo…" en grande, al centro: entra con rebote, late y los
  // puntos suspensivos aparecen uno a uno. Se va solo a los 4,5 s (o al
  // revelar / sumar tiempo / cambiar de pregunta); el reloj queda en rojo.
  const timeUpNode = timeUpShow ? (
    <div onClick={() => setTimeUpShow(false)} style={{
      position: "fixed", inset: 0, zIndex: 880, display: "grid", placeItems: "center", cursor: "pointer",
      background: "radial-gradient(circle at 50% 50%, rgba(220,38,38,.35), rgba(0,0,0,.55) 70%)",
      animation: "qs-lec-tu-bg .35s ease both",
    }}>
      <style>{`
        @keyframes qs-lec-tu-bg  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes qs-lec-tu-in  { 0% { transform: scale(.2) rotate(-12deg); opacity: 0; } 60% { transform: scale(1.12) rotate(3deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
        @keyframes qs-lec-tu-beat{ 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes qs-lec-tu-dot { 0%,30% { opacity: 0; } 40%,100% { opacity: 1; } }
        @keyframes qs-lec-tu-ring{ 0%,100% { transform: rotate(-14deg); } 50% { transform: rotate(14deg); } }
      `}</style>
      <div style={{ textAlign: "center", animation: "qs-lec-tu-in .6s cubic-bezier(.2,.9,.3,1.3) both" }}>
        <div style={{ fontSize: "clamp(70px, 12vw, 150px)", lineHeight: 1, animation: "qs-lec-tu-ring .25s ease-in-out 8" }}>⏰</div>
        <div style={{
          fontSize: "clamp(56px, 10vw, 140px)", fontWeight: 900, lineHeight: 1.05, color: "#fff",
          fontFamily: "'Poppins', 'Segoe UI', system-ui, sans-serif",
          textShadow: "0 0 30px rgba(220,38,38,.9), 0 6px 0 #7f1d1d",
          animation: "qs-lec-tu-beat 1s ease-in-out .6s infinite",
        }}>
          Fin del tiempo
          <span style={{ animation: "qs-lec-tu-dot 1.2s ease-in-out .6s infinite" }}>.</span>
          <span style={{ animation: "qs-lec-tu-dot 1.2s ease-in-out .9s infinite" }}>.</span>
          <span style={{ animation: "qs-lec-tu-dot 1.2s ease-in-out 1.2s infinite" }}>.</span>
        </div>
      </div>
    </div>
  ) : null;

  const clockNode = clockOn ? (
    <div className="qs-lec-clock" title={clockPausedLeft != null ? "Reloj en pausa" : "Tiempo restante"} style={{
      position: "fixed", right: 18, bottom: 16, zIndex: 520,
      display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 999,
      fontFamily: "ui-monospace, 'Poppins', monospace", fontWeight: 900, fontSize: 24, lineHeight: 1,
      // Color: el acento del tema (degradado) en marcha; ámbar el último
      // minuto; rojo al acabarse.
      background: clockOut ? "#dc2626" : clockWarn ? "#f59e0b"
        : (theme.id === "bw" || theme.id === "contrast") ? theme.accent
        : `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
      color: clockOut || clockWarn ? "#fff"
        : theme.id === "contrast" ? "#000" : theme.id === "bw" ? "#fff" : "#04201b",
      border: "none",
      boxShadow: clockOut ? "0 0 0 4px rgba(220,38,38,.3)" : clockWarn ? "0 0 0 4px rgba(245,158,11,.3)"
        : (theme.id === "dark" ? `0 4px 16px ${hexToRgba(theme.accent, 0.35)}` : "0 2px 8px rgba(0,0,0,.15)"),
      opacity: clockPausedLeft != null ? 0.6 : 1,
      animation: clockOut ? "qs-lec-clock 1s ease-in-out infinite" : "none",
      transition: "opacity .2s, background .3s",
    }}>
      <style>{`
        @keyframes qs-lec-clock { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        .qs-lec-clock .qs-lec-clock-btns { display: none; }
        .qs-lec-clock:hover { opacity: 1 !important; }
        .qs-lec-clock:hover .qs-lec-clock-btns { display: inline-flex; }
      `}</style>
      <span>{clockOut ? "⏰ ¡Tiempo!" : (clockPausedLeft != null ? "⏸ " : "⏱ ") + fmtClock(clockLeft)}</span>
      <span className="qs-lec-clock-btns" style={{ gap: 4 }}>
        <button onClick={() => clockAdd(30)} title="Sumar 30 segundos" style={clockBtn}>+30s</button>
        <button onClick={clockPausedLeft != null ? clockResume : clockPause} title="Pausar / reanudar el reloj" style={clockBtn}>
          {clockPausedLeft != null ? "▶" : "⏸"}
        </button>
      </span>
    </div>
  ) : null;

  const toggleFullscreen = () => {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    } catch (e) { /* Fullscreen no disponible: no es crítico, se ignora */ }
  };

  const shellStyle = {
    position: "fixed", inset: 0, zIndex: 500, background: theme.bg,
    color: theme.text, fontFamily: "'Poppins', 'Segoe UI', system-ui, sans-serif",
    display: "flex", flexDirection: "column", padding: 24, overflowY: "auto",
  };

  const topBar = (extra) => (
    // Tres columnas: las laterales miden lo mismo (1fr), así el número de la
    // pregunta queda en el centro EXACTO de la pantalla aunque los botones
    // de la derecha sean más anchos que "Salir".
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 10, gap: 10 }}>
      <button onClick={onExit} style={{
        justifySelf: "start",
        background: theme.chipBg, color: theme.text, border: "1px solid " + theme.border,
        borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
      }}>✕ Salir</button>
      <div style={{ textAlign: "center", fontSize: 16, color: theme.text, fontWeight: 800, letterSpacing: ".02em", whiteSpace: "nowrap" }}>
        {extra}
      </div>
      <div style={{ display: "flex", gap: 8, justifySelf: "end", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button onClick={openRemote} title="Controlar la presentación desde tu celular" style={{
          background: remote.connected ? "rgba(16,185,129,.18)" : theme.chipBg, color: remote.connected ? "#10b981" : theme.text,
          border: "1px solid " + (remote.connected ? "#10b981" : theme.border),
          borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>📱 {remote.connected ? "Mando conectado" : "Mando del celular"}</button>
        <button onClick={toggleFullscreen} title="Pantalla completa" style={{
          background: theme.chipBg, color: theme.text, border: "1px solid " + theme.border,
          borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
        }}>⛶ Pantalla completa</button>
      </div>
    </div>
  );

  // ---- Sin preguntas de opción múltiple todavía ----
  if (!slides.length) {
    return (
      <div style={shellStyle}>
        {topBar("")}
        <LectioThemeSwitcher theme={theme} onChange={setThemeId} />
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <LectioCard theme={theme} style={{ padding: 36, maxWidth: 460, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>📝</div>
            <h2 style={{ fontSize: 20, marginBottom: 8, fontWeight: 700 }}>Aún no hay preguntas para proyectar</h2>
            <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6 }}>
              Agrega al menos una pregunta de opción múltiple desde el editor y vuelve a presionar "Presentar".
            </p>
            <button onClick={onExit} className="qs-btn qs-btn--lg" style={{
              marginTop: 18, background: theme.accent, color: theme.id === "contrast" ? "#000" : (theme.id === "bw" ? "#fff" : "#04201b"), fontWeight: 800,
            }}>Volver al editor</button>
          </LectioCard>
        </div>
      </div>
    );
  }

  // ---- Fin de la presentación ----
  if (finished) {
    return (
      <div style={shellStyle}>
        {topBar("")}
        <LectioThemeSwitcher theme={theme} onChange={setThemeId} />
        <div style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <LectioCard theme={theme} style={{ padding: 36, maxWidth: 460, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 14 }}>🎉</div>
            <h2 style={{ fontSize: 22, marginBottom: 8, fontWeight: 700 }}>Fin de la presentación</h2>
            <p style={{ color: theme.textMuted, fontSize: 14, marginBottom: 22 }}>
              Presentaste {slides.length} {slides.length === 1 ? "pregunta" : "preguntas"}.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => { setIdx(0); setRevealed(false); setFinished(false); }} className="qs-btn qs-btn--lg" style={{
                background: theme.chipBg, color: theme.text, border: "1px solid " + theme.border, fontWeight: 700,
              }}>↺ Reiniciar</button>
              <button onClick={onExit} className="qs-btn qs-btn--lg" style={{
                background: theme.accent, color: theme.id === "contrast" ? "#000" : (theme.id === "bw" ? "#fff" : "#04201b"), fontWeight: 800,
              }}>Volver al editor</button>
            </div>
          </LectioCard>
        </div>
        {clockNode}
        {remoteLayers}
      </div>
    );
  }

  // ---- Diapositiva actual ----
  const progress = ((safeIdx + 1) / slides.length) * 100;
  const vid = q.video ? youtubeId(q.video) : null;
  return (
    <div style={shellStyle}>
      {!metaDone && (
        <window.MetaCountdown mode="lectio" allowSkip onDone={() => setMetaDone(true)} />
      )}
      {topBar(`Pregunta ${safeIdx + 1} de ${slides.length}`)}
      <LectioThemeSwitcher theme={theme} onChange={setThemeId} />
      <div style={{ height: 6, background: theme.chipBg, borderRadius: 3, marginBottom: 14, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ height: "100%", width: progress + "%", background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})`, transition: "width 0.3s ease" }} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 1040, margin: "0 auto", width: "100%" }}>
        <LectioCard theme={theme} key={q.id} style={{ padding: "34px 38px", marginBottom: 24 }}>
          <h1 style={{ fontSize: "clamp(24px, 3.4vw, 38px)", fontWeight: 700, lineHeight: 1.3, textAlign: "center", marginBottom: (q.image || vid) ? 20 : 0 }}>
            {q.text ? <window.RichText text={q.text} /> : <span style={{ opacity: 0.5, fontStyle: "italic" }}>(Pregunta sin texto)</span>}
          </h1>
          {q.image && (
            <div style={{ textAlign: "center", marginTop: 6, background: theme.surface2, borderRadius: 12, padding: 10 }}>
              <img src={q.image} alt="" style={{ maxWidth: "100%", maxHeight: 320, width: "auto", borderRadius: 8, objectFit: "contain" }} />
            </div>
          )}
          {vid && (
            <div style={{ marginTop: 6, position: "relative", paddingBottom: "42%", height: 0, borderRadius: 12, overflow: "hidden" }}>
              <iframe src={`https://www.youtube.com/embed/${vid}`} title="Video"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
            </div>
          )}
        </LectioCard>

        <div style={{
          display: "grid", gap: 18,
          gridTemplateColumns: (q.options || []).length > 2 ? "1fr 1fr" : "1fr",
        }}>
          {(q.options || []).map((o, i) => {
            const isCorrect = !!o.correct;
            const tstyle = lectioOptionStyle(theme, i, revealed, isCorrect);
            const badge = lectioBadgeStyle(theme);
            const letter = lectioLetterStyle(theme);
            return (
              <button key={o.id} onClick={() => setRevealed(true)} style={{
                textAlign: "left", padding: "28px 30px", borderRadius: 18, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 18,
                transition: "opacity .2s ease, border-color .2s ease, background .2s ease",
                background: tstyle.background, border: tstyle.border, color: tstyle.color,
                opacity: tstyle.opacity, boxShadow: tstyle.boxShadow,
              }}>
                {/* Letra A/B/C/D — coincide con las columnas de la hoja OMR impresa */}
                <span style={{
                  flexShrink: 0, width: 42, height: 42, borderRadius: 12,
                  display: "grid", placeItems: "center", fontSize: 22, fontWeight: 900,
                  background: letter.background, color: letter.color,
                }}>{String.fromCharCode(65 + i)}</span>
                <span style={{ flex: 1, fontSize: 23, fontWeight: 700, lineHeight: 1.35 }}>
                  {o.text ? <window.RichText text={o.text} /> : <span style={{ opacity: 0.6, fontStyle: "italic" }}>Opción {String.fromCharCode(65 + i)}</span>}
                </span>
                {revealed && isCorrect && (
                  <span style={{
                    flexShrink: 0, width: 38, height: 38, borderRadius: "50%", background: badge.background,
                    color: badge.color, display: "grid", placeItems: "center", fontWeight: 900,
                  }}><I.check size={20} sw={3} /></span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
        <button onClick={goPrev} disabled={safeIdx === 0} className="qs-btn qs-btn--lg" style={{
          background: theme.chipBg, color: theme.text, border: "1px solid " + theme.border,
          fontWeight: 700, opacity: safeIdx === 0 ? 0.4 : 1,
        }}>◀ Anterior</button>
        <button onClick={() => setRevealed(v => !v)} className="qs-btn qs-btn--lg" style={{
          background: revealed ? theme.chipBg : theme.accent,
          color: revealed ? theme.text : (theme.id === "contrast" ? "#000" : (theme.id === "bw" ? "#fff" : "#04201b")),
          border: revealed ? "1px solid " + theme.border : "none",
          fontWeight: 800,
        }}>{revealed ? "🙈 Ocultar respuesta" : "✅ Revelar respuesta correcta"}</button>
        <button onClick={goNext} className="qs-btn qs-btn--lg" style={{
          background: theme.accent2, color: theme.id === "contrast" ? "#000" : (theme.id === "bw" ? "#fff" : "#04141f"), fontWeight: 800,
        }}>{isLast ? "🏁 Finalizar" : "Siguiente ▶"}</button>
      </div>
      {esmigol.node}
      {clockNode}
      {timeUpNode}
      {remoteLayers}
    </div>
  );
}

Object.assign(window, { LectioPresenter });
