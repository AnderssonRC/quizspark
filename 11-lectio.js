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
const { useState: useStateLec, useEffect: useEffectLec, useCallback: useCallbackLec } = React;

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

// Selector de tema: fila de píldoras, pensada para ajustar sobre la marcha
// según la luz del salón / calidad del proyector.
function LectioThemeSwitcher({ theme, onChange }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, alignSelf: "center", marginRight: 2 }}>
        Tema:
      </span>
      {LECTIO_THEME_ORDER.map(id => {
        const t = LECTIO_THEMES[id];
        const on = theme.id === id;
        return (
          <button key={id} onClick={() => onChange(id)} title={t.label} style={{
            padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
            background: on ? theme.accent : theme.chipBg,
            color: on ? (theme.id === "bw" ? "#ffffff" : (theme.id === "contrast" ? "#000000" : "#ffffff")) : theme.textMuted,
            border: "1px solid " + (on ? theme.accent : theme.border),
          }}>{t.label}</button>
        );
      })}
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
      <button onClick={onExit} style={{
        background: theme.chipBg, color: theme.text, border: "1px solid " + theme.border,
        borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
      }}>✕ Salir</button>
      <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 600 }}>
        📵 Modo Sin Celular {extra}
      </div>
      <button onClick={toggleFullscreen} title="Pantalla completa" style={{
        background: theme.chipBg, color: theme.text, border: "1px solid " + theme.border,
        borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
      }}>⛶ Pantalla completa</button>
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
      {topBar(`· Pregunta ${safeIdx + 1} de ${slides.length}`)}
      <LectioThemeSwitcher theme={theme} onChange={setThemeId} />
      <div style={{ height: 6, background: theme.chipBg, borderRadius: 3, marginBottom: 22, overflow: "hidden", flexShrink: 0 }}>
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
    </div>
  );
}

Object.assign(window, { LectioPresenter });
