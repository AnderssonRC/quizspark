/* global React */
// ============================================================
// QuizSpark — RETO FÍSICO (sala en vivo: quiz y taller)
// ------------------------------------------------------------
// El docente pausa la sala y lanza un reto para hacer en el salón
// ("¡Todos de pie!", "Dibuja en una hoja…"). Los PRIMEROS 3 que lo
// cumplan ganan +10 puntos (solo ranking): el docente los marca desde
// su lista. Con los 3 premiados aparece "Volver al quiz" y todo sigue
// donde estaba (el cronómetro se reanuda sin descontar la pausa).
//
// Estado en el documento de la sesión (liveSessions/{id}), que docente y
// celulares ya escuchan — no se agregan listeners:
//   physicalChallenge = { id, text, startedAt, winners: [pid], pausedByChallenge }
// La lógica que escribe en Firestore vive en 09-live.js (LiveSessionHost);
// aquí solo están las pantallas.
// ============================================================

const { useState: useStateRF, useEffect: useEffectRF } = React;

const RF_POINTS = 10;
const RF_WINNERS = 3;
const RF_NEON = "#39ff14";
const RF_BG = "radial-gradient(ellipse at 50% 30%, #0f3d1f 0%, #06210f 45%, #020a05 100%)";
const RF_FONT = "var(--font-display, 'Poppins', 'Segoe UI', system-ui, sans-serif)";

const RF_PRESETS = [
  "El profe dice: ¡TODOS DE PIE!",
  "El profe dice: ¡Baila como gallina!",
  "El profe dice: ¡Haz diez flexiones de pecho!",
  "El profe dice: ¡Lee una frase de la última clase!",
  "Responde la pregunta del docente en una hoja.",
  "Dibuja en una hoja… ¡ESCUCHA al docente!",
];

// Retos escritos por el docente en este navegador (conveniencia local;
// si el almacenamiento no está disponible, simplemente no se recuerdan).
const RF_CUSTOM_KEY = "qs_reto_fisico_custom";
function rfLoadCustom() {
  try { const v = JSON.parse(localStorage.getItem(RF_CUSTOM_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function rfSaveCustom(list) {
  try { localStorage.setItem(RF_CUSTOM_KEY, JSON.stringify(list.slice(0, 20))); } catch (e) { /* no-op */ }
}

function RFStyles() {
  return (
    <style>{`
      @keyframes qs-rf-left  { 0% { transform: translateX(-130vw); } 28%,58% { transform: translateX(0); } 86% { transform: translateX(-38vw); opacity: 1; } 100% { transform: translateX(-130vw); opacity: 0; } }
      @keyframes qs-rf-right { 0% { transform: translateX(130vw); }  28%,58% { transform: translateX(0); } 86% { transform: translateX(38vw); opacity: 1; }  100% { transform: translateX(130vw); opacity: 0; } }
      @keyframes qs-rf-join  { 0%,24% { text-shadow: 0 0 6px ${RF_NEON}; } 34%,56% { text-shadow: 0 0 18px ${RF_NEON}, 0 0 46px ${RF_NEON}, 0 0 80px #b2ff59; } 100% { text-shadow: 0 0 6px ${RF_NEON}; } }
      @keyframes qs-rf-flash { 0%,30% { opacity: 0; } 36% { opacity: .55; } 52%,100% { opacity: 0; } }
      @keyframes qs-rf-card  { from { transform: scale(.55) rotate(-4deg); opacity: 0; } 70% { transform: scale(1.05) rotate(1deg); opacity: 1; } to { transform: scale(1) rotate(0); opacity: 1; } }
      @keyframes qs-rf-frame { 0%,100% { box-shadow: inset 0 0 0 6px ${RF_NEON}, inset 0 0 40px rgba(57,255,20,.45), 0 0 0 transparent; } 50% { box-shadow: inset 0 0 0 8px #b2ff59, inset 0 0 80px rgba(57,255,20,.7), 0 0 0 transparent; } }
      @keyframes qs-rf-pop   { 0% { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(1); } }
      @keyframes qs-rf-bob   { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      @keyframes qs-rf-spin  { to { transform: translate(-50%, -50%) rotate(360deg); } }
      @keyframes qs-rf-glow  { 0%,100% { box-shadow: 0 0 24px rgba(57,255,20,.45), 0 0 60px rgba(57,255,20,.2); } 50% { box-shadow: 0 0 44px rgba(57,255,20,.85), 0 0 110px rgba(57,255,20,.4); } }
      @keyframes qs-rf-hero  { 0%,100% { transform: translateY(0) rotate(-6deg) scale(1); } 25% { transform: translateY(-14px) rotate(6deg) scale(1.08); } 50% { transform: translateY(0) rotate(-3deg) scale(1); } 75% { transform: translateY(-8px) rotate(4deg) scale(1.04); } }
      @keyframes qs-rf-halo  { 0%,100% { transform: scale(.85); opacity: .55; } 50% { transform: scale(1.15); opacity: .95; } }
    `}</style>
  );
}

// Pantalla completa verde: marco neón + intro "MODO RETO / EN FÍSICO"
// (cada palabra entra por un lado, se juntan, se separan y revelan el reto).
// `key` del padre = id del reto, para que la intro se repita en cada reto.
function RFShell({ children, introDone }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 950, overflowY: "auto", overflowX: "hidden",
      background: RF_BG, color: "#eaffe0", fontFamily: RF_FONT,
      animation: "qs-rf-frame 2.2s ease-in-out infinite",
    }}>
      <RFStyles />
      {!introDone && (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 2, display: "grid", placeItems: "center", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: RF_NEON, animation: "qs-rf-flash 2.6s ease forwards" }} />
          <div style={{ transform: "rotate(-32deg)", textAlign: "center", lineHeight: 1.05 }}>
            <div style={{
              fontSize: "clamp(40px, 11vw, 120px)", fontWeight: 900, letterSpacing: ".04em", color: RF_NEON,
              animation: "qs-rf-left 2.6s cubic-bezier(.6,.05,.3,1) forwards, qs-rf-join 2.6s ease forwards",
            }}>MODO RETO</div>
            <div style={{
              fontSize: "clamp(40px, 11vw, 120px)", fontWeight: 900, letterSpacing: ".04em", color: "#ffffff",
              animation: "qs-rf-right 2.6s cubic-bezier(.6,.05,.3,1) forwards, qs-rf-join 2.6s ease forwards",
            }}>EN FÍSICO</div>
          </div>
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, minHeight: "100%", padding: "28px 18px 40px" }}>
        {children}
      </div>
    </div>
  );
}

function useRFIntro(id) {
  const [done, setDone] = useStateRF(false);
  useEffectRF(() => {
    setDone(false);
    const t = setTimeout(() => setDone(true), 2500);
    return () => clearTimeout(t);
  }, [id]);
  return done;
}

function RFChallengeCard({ text, delay }) {
  return (
    <div style={{
      maxWidth: 760, margin: "0 auto 22px", padding: "26px 22px", borderRadius: 24, textAlign: "center",
      background: "linear-gradient(160deg, rgba(57,255,20,.18), rgba(0,0,0,.35))",
      border: `3px solid ${RF_NEON}`, boxShadow: `0 0 30px rgba(57,255,20,.45)`,
      animation: `qs-rf-card .7s cubic-bezier(.2,.9,.3,1.3) ${delay}s both`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".18em", color: RF_NEON, marginBottom: 8 }}>💪 RETO EN FÍSICO</div>
      <div style={{ fontSize: "clamp(24px, 4.6vw, 46px)", fontWeight: 900, lineHeight: 1.2, color: "#fff" }}>{text}</div>
      <div style={{ marginTop: 14, fontSize: 15, fontWeight: 700, opacity: .9 }}>
        🏃 Solo los <b style={{ color: RF_NEON }}>primeros {RF_WINNERS}</b> que lo completen ganan <b style={{ color: RF_NEON }}>+{RF_POINTS} puntos</b>
      </div>
    </div>
  );
}

// ---------- DOCENTE: botón + selector de reto ----------
function PhysicalChallengeButton({ onLaunch, style }) {
  const [open, setOpen] = useStateRF(false);
  const [custom, setCustom] = useStateRF(rfLoadCustom);
  const [draft, setDraft] = useStateRF("");
  const [picked, setPicked] = useStateRF(RF_PRESETS[0]);
  const [busy, setBusy] = useStateRF(false);

  const addCustom = () => {
    const t = draft.trim();
    if (!t) return;
    const next = [t, ...custom.filter(c => c !== t)];
    setCustom(next); rfSaveCustom(next); setPicked(t); setDraft("");
  };
  const removeCustom = (t) => {
    const next = custom.filter(c => c !== t);
    setCustom(next); rfSaveCustom(next);
    if (picked === t) setPicked(RF_PRESETS[0]);
  };
  const launch = async () => {
    if (!picked || busy) return;
    setBusy(true);
    try { await onLaunch(picked); setOpen(false); }
    finally { setBusy(false); }
  };

  const option = (t, removable) => (
    <div key={t} style={{ display: "flex", gap: 6 }}>
      <button onClick={() => setPicked(t)} style={{
        flex: 1, textAlign: "left", padding: "10px 12px", borderRadius: 12, cursor: "pointer",
        fontWeight: 700, fontSize: 14, fontFamily: RF_FONT, color: "#eaffe0",
        background: picked === t ? "rgba(57,255,20,.22)" : "rgba(255,255,255,.05)",
        border: "2px solid " + (picked === t ? RF_NEON : "rgba(255,255,255,.12)"),
      }}>{picked === t ? "✅ " : ""}{t}</button>
      {removable && (
        <button onClick={() => removeCustom(t)} title="Quitar de mis retos" style={{
          background: "transparent", border: 0, color: "#ff8a80", cursor: "pointer", fontSize: 16,
        }}>🗑️</button>
      )}
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} title="Pausar la sala y lanzar un reto en el salón" style={{
        position: "fixed", bottom: 16, left: 220, zIndex: 860,
        padding: "10px 16px", borderRadius: 999, cursor: "pointer", fontWeight: 900, fontSize: 14,
        fontFamily: RF_FONT, color: "#03200b", background: RF_NEON, border: 0,
        boxShadow: "0 4px 0 #1b8a0a, 0 0 22px rgba(57,255,20,.6)", ...style,
      }}>💪 ¡Reto Físico!</button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: "fixed", inset: 0, zIndex: 940, background: "rgba(0,0,0,.6)",
          display: "grid", placeItems: "center", padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", borderRadius: 22, padding: 20,
            background: RF_BG, color: "#eaffe0", fontFamily: RF_FONT,
            border: `3px solid ${RF_NEON}`, boxShadow: "0 0 40px rgba(57,255,20,.35)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: RF_NEON }}>💪 ¡Reto Físico!</div>
                <div style={{ fontSize: 13, opacity: .85, lineHeight: 1.5 }}>
                  La sala se pausa y todos ven el reto. Los primeros {RF_WINNERS} que lo cumplan ganan +{RF_POINTS} puntos.
                </div>
              </div>
              <button onClick={() => setOpen(false)} style={{ background: "transparent", border: 0, color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
            </div>

            <div style={{ display: "grid", gap: 6, margin: "12px 0" }}>
              {RF_PRESETS.map(t => option(t, false))}
              {custom.length > 0 && <div style={{ fontSize: 12, fontWeight: 800, opacity: .7, marginTop: 6 }}>MIS RETOS</div>}
              {custom.map(t => option(t, true))}
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <input className="qs-input" value={draft} maxLength={140} placeholder="Escribe un reto nuevo…"
                onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addCustom()}
                style={{ flex: 1, minWidth: 0 }} />
              <button onClick={addCustom} disabled={!draft.trim()} className="qs-btn qs-btn--sm" style={{
                background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)",
              }}>+ Agregar</button>
            </div>

            <button onClick={launch} disabled={busy || !picked} className="qs-btn qs-btn--lg" style={{
              width: "100%", marginTop: 16, background: RF_NEON, color: "#03200b", fontWeight: 900, border: 0,
              boxShadow: "0 4px 0 #1b8a0a",
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
  const introDone = useRFIntro(ch.id);
  const winners = ch.winners || [];
  const participants = Object.values(session.participants || {})
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const goal = Math.min(RF_WINNERS, participants.length);
  const complete = winners.length >= goal && goal > 0;

  return (
    <RFShell introDone={introDone}>
      <RFChallengeCard text={ch.text} delay={2.2} />
      <div style={{ maxWidth: 760, margin: "0 auto", animation: "qs-rf-card .6s ease 2.5s both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, fontWeight: 900, fontSize: 18 }}>
            🏆 Premiados: <span style={{ color: RF_NEON }}>{winners.length} / {goal || RF_WINNERS}</span>
          </div>
          <div style={{ fontSize: 13, opacity: .8 }}>Toca +{RF_POINTS} a quien lo cumpla primero</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
          {participants.map(p => {
            const place = winners.indexOf(p.id);
            const won = place >= 0;
            const locked = !won && winners.length >= RF_WINNERS;
            return (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 14,
                background: won ? "rgba(57,255,20,.2)" : "rgba(255,255,255,.06)",
                border: "1px solid " + (won ? RF_NEON : "rgba(255,255,255,.12)"),
                opacity: locked ? .5 : 1,
              }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {won ? ["🥇", "🥈", "🥉"][place] + " " : ""}{p.name}
                </span>
                <button onClick={() => onAward(p.id)} disabled={won || locked} style={{
                  padding: "6px 12px", borderRadius: 10, fontWeight: 900, fontSize: 14, fontFamily: RF_FONT, border: 0,
                  cursor: won || locked ? "default" : "pointer",
                  background: won ? "transparent" : RF_NEON, color: won ? RF_NEON : "#03200b",
                }}>{won ? `✓ +${RF_POINTS}` : `+${RF_POINTS}`}</button>
              </div>
            );
          })}
          {participants.length === 0 && <p style={{ opacity: .8 }}>No hay estudiantes en la sala.</p>}
        </div>

        <div style={{ textAlign: "center", marginTop: 22 }}>
          {complete ? (
            <button onClick={onFinish} className="qs-btn qs-btn--lg" style={{
              background: RF_NEON, color: "#03200b", fontWeight: 900, border: 0, padding: "14px 28px",
              boxShadow: "0 4px 0 #1b8a0a, 0 0 26px rgba(57,255,20,.6)", animation: "qs-rf-pop .5s ease both",
            }}>↩️ Volver al quiz</button>
          ) : (
            <button onClick={() => { if (confirm("¿Terminar el reto sin premiar a los " + (goal || RF_WINNERS) + "?")) onFinish(); }} style={{
              background: "transparent", border: 0, color: "#eaffe0", opacity: .7, textDecoration: "underline", cursor: "pointer", fontSize: 13,
            }}>Terminar el reto sin completarlo</button>
          )}
        </div>
      </div>
    </RFShell>
  );
}

// Emoji protagonista según de qué trata el reto (el docente puede escribir
// cualquiera; si no coincide con nada, un rayo).
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

// ---------- ESTUDIANTE: reto en su celular ----------
// El reto va centrado en la pantalla, con una luz verde que recorre todo
// el contorno de la tarjeta y un emoji grande que baila.
function PhysicalChallengeStudent({ session, myId }) {
  const ch = session.physicalChallenge;
  const introDone = useRFIntro(ch.id);
  const winners = ch.winners || [];
  const place = winners.indexOf(myId);
  const left = Math.max(0, RF_WINNERS - winners.length);
  const emoji = rfEmojiFor(ch.text);

  return (
    <RFShell introDone={introDone}>
      <div style={{
        minHeight: "calc(100vh - 68px)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 18,
      }}>
        {/* Tarjeta con contorno de luz giratoria: un degradado cónico gira
            DETRÁS de la tarjeta y solo asoma por el borde de 4px. */}
        <div style={{
          position: "relative", width: "100%", maxWidth: 560, borderRadius: 30, padding: 4, overflow: "hidden",
          animation: "qs-rf-card .7s cubic-bezier(.2,.9,.3,1.3) 2.2s both, qs-rf-glow 1.8s ease-in-out 2.9s infinite",
        }}>
          <div aria-hidden="true" style={{
            position: "absolute", top: "50%", left: "50%", width: "160%", aspectRatio: "1 / 1",
            background: `conic-gradient(from 0deg, transparent 0deg, ${RF_NEON} 50deg, #ffffff 80deg, ${RF_NEON} 110deg, transparent 170deg, transparent 190deg, #b2ff59 240deg, ${RF_NEON} 270deg, transparent 330deg)`,
            animation: "qs-rf-spin 3s linear infinite",
          }} />
          <div style={{
            position: "relative", borderRadius: 26, padding: "26px 20px 24px", textAlign: "center",
            background: "radial-gradient(ellipse at 50% 0%, #16502a 0%, #072a13 60%, #031a0b 100%)",
          }}>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: ".2em", color: RF_NEON, marginBottom: 6 }}>💪 RETO EN FÍSICO</div>
            {/* Emoji protagonista con halo */}
            <div style={{ position: "relative", width: 150, height: 150, margin: "4px auto 8px", display: "grid", placeItems: "center" }}>
              <div aria-hidden="true" style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(57,255,20,.55) 0%, rgba(57,255,20,.12) 55%, transparent 70%)",
                animation: "qs-rf-halo 1.6s ease-in-out infinite",
              }} />
              <div style={{
                position: "relative", fontSize: 104, lineHeight: 1,
                filter: "drop-shadow(0 8px 18px rgba(0,0,0,.45)) drop-shadow(0 0 14px rgba(57,255,20,.6))",
                animation: "qs-rf-hero 1.4s ease-in-out infinite",
              }}>{emoji}</div>
            </div>
            <div style={{
              fontSize: "clamp(26px, 7vw, 44px)", fontWeight: 900, lineHeight: 1.15, color: "#fff",
              textShadow: "0 0 18px rgba(57,255,20,.55)",
            }}>{ch.text}</div>
            <div style={{
              display: "inline-block", marginTop: 16, padding: "8px 16px", borderRadius: 999,
              background: "rgba(57,255,20,.14)", border: `1px solid ${RF_NEON}`, fontSize: 14, fontWeight: 800,
            }}>
              🏆 Los <b style={{ color: RF_NEON }}>primeros {RF_WINNERS}</b> ganan <b style={{ color: RF_NEON }}>+{RF_POINTS} puntos</b>
            </div>
          </div>
        </div>

      <div style={{ width: "100%", maxWidth: 520, textAlign: "center", animation: "qs-rf-card .6s ease 2.5s both" }}>
        {place >= 0 ? (
          <div key="won" style={{ animation: "qs-rf-pop .6s cubic-bezier(.2,.9,.3,1.3) both" }}>
            <div style={{ fontSize: "clamp(72px, 22vw, 140px)", fontWeight: 900, color: RF_NEON, lineHeight: 1, textShadow: `0 0 30px ${RF_NEON}` }}>
              +{RF_POINTS}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, marginTop: 8 }}>Excelente… ¡pero vendrán más…! 😏</div>
            <div style={{ fontSize: 14, opacity: .85, marginTop: 6 }}>{["🥇 Fuiste el primero", "🥈 Segundo lugar", "🥉 Tercer lugar"][place]}</div>
          </div>
        ) : (
          <div style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.5 }}>
            {/* Las 3 copas: se apagan a medida que el docente premia */}
            <div style={{ display: "flex", justifyContent: "center", gap: 14, marginBottom: 8 }}>
              {Array.from({ length: RF_WINNERS }, (_, i) => {
                const taken = i < winners.length;
                return (
                  <span key={i} style={{
                    fontSize: 38, lineHeight: 1, transition: "filter .3s, opacity .3s",
                    filter: taken ? "grayscale(1)" : `drop-shadow(0 0 10px ${RF_NEON})`,
                    opacity: taken ? .35 : 1,
                    animation: taken ? "none" : `qs-rf-bob 1.2s ease-in-out ${i * .2}s infinite`,
                  }}>🏆</span>
                );
              })}
            </div>
            {left > 0 ? (
              <>
                ¡Rápido! Quedan <span style={{ color: RF_NEON }}>{left}</span> {left === 1 ? "premio" : "premios"}.<br />
                <span style={{ fontSize: 14, opacity: .8 }}>Cuando lo cumplas, el docente te da los puntos.</span>
              </>
            ) : (
              <>
                Ya ganaron los {RF_WINNERS} primeros.<br />
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

window.RF_POINTS = RF_POINTS;
window.RF_WINNERS = RF_WINNERS;
window.PhysicalChallengeButton = PhysicalChallengeButton;
window.PhysicalChallengeHost = PhysicalChallengeHost;
window.PhysicalChallengeStudent = PhysicalChallengeStudent;
