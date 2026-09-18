/* global React */
// ============================================================
// QuizSpark — COMPETENCIA EXTREMA (sala en vivo)
// ------------------------------------------------------------
// Se activa por quiz desde el editor (quiz.extremeMode) y solo aplica
// en la sala en vivo. Agrega:
//   · Ranking animado cada 3 preguntas (status "ranking" de la sesión).
//   · Rachas: 3 aciertos seguidos = el estudiante elige un PRIVILEGIO
//     entre 4 al azar; el docente lo aprueba o rechaza desde su pantalla.
//
// TODO el estado vive en el documento de la sesión (liveSessions/{id}),
// que celulares y docente ya escuchan: no se agregan listeners nuevos.
//   participants.{pid}.streak   racha actual (la calcula el docente al revelar)
//   participants.{pid}.shield   escudo activo
//   privilegeOffer              { pid, options:[ids], qIdx, status, choice }
//   privilegeQueue              [pid, ...] en espera de su turno
//   extremeEffects.{key}        efectos programados para la siguiente pregunta
// ============================================================

const { useState: useStateX, useEffect: useEffectX, useMemo: useMemoX } = React;

// ---------- Emoji de "guerrero" por estudiante (estable por id) ----------
const EXTREME_EMOJIS = ["🦁", "🐯", "🦅", "🐺", "🦈", "🐉", "🔥", "⚡", "🦂", "🐍", "🦖", "🦍",
  "🐆", "🦊", "🐗", "🦬", "🐲", "🦏", "🐊", "🦇", "🦉", "🐝", "🦎", "🐙"];
function extremeEmoji(p) {
  const s = String((p && (p.id || p.name)) || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return EXTREME_EMOJIS[h % EXTREME_EMOJIS.length];
}

// ---------- Catálogo de privilegios ----------
// kind "instant": el docente lo aplica al aprobar.
// kind "next":    queda programado para la siguiente pregunta (no diapositiva).
const EXTREME_PRIVILEGES = [
  { id: "drain",     emoji: "💀", name: "Drenaje",         kind: "instant", desc: "Todos los demás pierden 1 punto." },
  { id: "steal",     emoji: "🦹", name: "Asalto al líder", kind: "instant", desc: "Le robas 3 puntos al primero del ranking." },
  { id: "timecut",   emoji: "✂️", name: "Tijera",          kind: "next",    desc: "Los demás tienen 10 s menos en la siguiente pregunta." },
  { id: "freeze",    emoji: "❄️", name: "Congelar",        kind: "next",    desc: "Los demás no pueden responder los primeros 5 s de la siguiente." },
  { id: "sabotage",  emoji: "🕳️", name: "Sabotaje",        kind: "next",    desc: "En la siguiente, a los demás les desaparece la opción correcta." },
  { id: "repeat",    emoji: "🔁", name: "Otra vez",        kind: "instant", desc: "Los demás repiten esta pregunta. Tú ya la tienes ganada." },
  { id: "freepass",  emoji: "🎫", name: "Pase libre",      kind: "next",    desc: "La siguiente pregunta la ganas sin responder." },
  { id: "double",    emoji: "💎", name: "Doble o nada",    kind: "next",    desc: "La siguiente pregunta vale el doble para ti." },
  { id: "shield",    emoji: "🛡️", name: "Escudo",          kind: "instant", desc: "Te protege del próximo ataque que te lancen." },
  { id: "spotlight", emoji: "👑", name: "Corona",          kind: "next",    desc: "Tu nombre brilla en el proyector durante la siguiente pregunta." },
];
const EXTREME_STREAK_STEP = 3;       // cada 3 aciertos seguidos
const EXTREME_RANKING_EVERY = 3;     // ranking cada 3 preguntas
const EXTREME_OFFER_SIZE = 4;

function extremePrivilege(id) { return EXTREME_PRIVILEGES.find(p => p.id === id) || null; }

function extremePickOptions(n = EXTREME_OFFER_SIZE) {
  const pool = [...EXTREME_PRIVILEGES];
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0].id);
  }
  return out;
}

// Índice de la siguiente pregunta "de verdad" (salta diapositivas). -1 si no hay.
function extremeNextQuestionIdx(quiz, fromIdx) {
  const qs = quiz.questions || [];
  for (let i = fromIdx + 1; i < qs.length; i++) if (qs[i].type !== "slide") return i;
  return -1;
}

// ¿Toca ranking después de la pregunta idx? (cada 3 preguntas no-diapositiva,
// nunca después de la última: ahí va el ranking final de siempre)
function extremeRankingDue(quiz, idx) {
  const qs = quiz.questions || [];
  if (idx >= qs.length - 1) return false;
  let count = 0;
  for (let i = 0; i <= idx; i++) if (qs[i].type !== "slide") count++;
  return count > 0 && count % EXTREME_RANKING_EVERY === 0;
}

// ---------- Rachas (lo calcula el DOCENTE al revelar) ----------
// answersByPid: { pid: answerDoc } de la pregunta recién revelada.
// Devuelve las actualizaciones de racha y quiénes acaban de ganar privilegio.
function extremeStreakUpdates(session, answersByPid) {
  const updates = {};
  const triggered = [];
  Object.values(session.participants || {}).forEach(p => {
    const a = answersByPid[p.id];
    const correct = !!(a && a.correct === true);
    const next = correct ? (p.streak || 0) + 1 : 0;
    if (next !== (p.streak || 0)) updates[`participants.${p.id}.streak`] = next;
    if (correct && next > 0 && next % EXTREME_STREAK_STEP === 0) triggered.push(p.id);
  });
  return { updates, triggered };
}

function extremeBuildOffer(pid, qIdx) {
  return { pid, qIdx, options: extremePickOptions(), status: "choosing", choice: null, at: Date.now() };
}

// Actualizaciones para pasar a la siguiente oferta de la cola (o cerrar).
function extremeAdvanceQueue(session) {
  const queue = [...(session.privilegeQueue || [])];
  const next = queue.shift();
  return {
    privilegeOffer: next ? extremeBuildOffer(next, session.currentQuestionIdx) : null,
    privilegeQueue: queue,
  };
}

// Actualizaciones al APROBAR un privilegio. Devuelve { updates, repeat }:
// "repeat" pide al docente relanzar la pregunta actual eximiendo a pid.
function extremeApprovalUpdates({ session, quiz, pid, privId, firebase }) {
  const updates = {};
  const inc = (n) => firebase.firestore.FieldValue.increment(n);
  const others = Object.values(session.participants || {}).filter(p => p.id !== pid);
  const nextIdx = extremeNextQuestionIdx(quiz, session.currentQuestionIdx);
  const stamp = { by: pid, qIdx: nextIdx, at: Date.now() };
  let repeat = false;

  switch (privId) {
    case "drain":
      others.forEach(p => {
        if (p.shield) updates[`participants.${p.id}.shield`] = false;   // el escudo absorbe
        else updates[`participants.${p.id}.score`] = inc(-1);
      });
      break;
    case "steal": {
      const leader = [...others].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (leader) {
        if (leader.shield) updates[`participants.${leader.id}.shield`] = false;
        else {
          const amount = Math.min(3, Math.max(0, leader.score || 0));
          if (amount > 0) {
            updates[`participants.${leader.id}.score`] = inc(-amount);
            updates[`participants.${pid}.score`] = inc(amount);
          }
        }
      }
      break;
    }
    case "shield":
      updates[`participants.${pid}.shield`] = true;
      break;
    case "repeat":
      repeat = true;
      break;
    case "timecut":
      if (nextIdx >= 0) updates["extremeEffects.timecut"] = { ...stamp, seconds: 10 };
      break;
    case "freeze":
      if (nextIdx >= 0) updates["extremeEffects.freeze"] = { ...stamp, seconds: 5 };
      break;
    case "sabotage":
      if (nextIdx >= 0) updates["extremeEffects.sabotage"] = stamp;
      break;
    case "freepass":
      if (nextIdx >= 0) updates["extremeEffects.freepass"] = stamp;
      break;
    case "double":
      if (nextIdx >= 0) updates["extremeEffects.double"] = stamp;
      break;
    case "spotlight":
      if (nextIdx >= 0) updates["extremeEffects.spotlight"] = stamp;
      break;
    default: break;
  }
  return { updates, repeat };
}

// Efectos que aplican a la pregunta qIdx, vistos desde el estudiante `me`.
function extremeEffectsFor(session, qIdx, me) {
  const fx = session?.extremeEffects || {};
  const on = (k) => fx[k] && fx[k].qIdx === qIdx ? fx[k] : null;
  const notMe = (e) => e && e.by !== me ? e : null;
  const forMe = (e) => e && e.by === me ? e : null;
  return {
    timecut:   notMe(on("timecut")),
    freeze:    notMe(on("freeze")),
    sabotage:  notMe(on("sabotage")),
    freepass:  forMe(on("freepass")),
    double:    forMe(on("double")),
    spotlight: on("spotlight"),
    repeatExempt: forMe(on("repeatExempt")),
  };
}

// ---------- Estilos base "arena" ----------
const EXTREME_FONT = "var(--font-display, 'Poppins', 'Segoe UI', system-ui, sans-serif)";
const EXTREME_BG = "radial-gradient(ellipse at 50% 0%, #4a0d0d 0%, #1a0505 45%, #07070c 100%)";

function ExtremeStyles() {
  return (
    <style>{`
      @keyframes qs-x-stripes { from { background-position: 0 0; } to { background-position: 120px 0; } }
      @keyframes qs-x-glow { 0%,100% { text-shadow: 0 0 12px #ff5722, 0 0 28px #ff9800; } 50% { text-shadow: 0 0 24px #ffeb3b, 0 0 48px #ff5722; } }
      @keyframes qs-x-slide { from { transform: translateX(-60px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes qs-x-rise { from { transform: translateY(80px) scale(.8); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
      @keyframes qs-x-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
      @keyframes qs-x-shake { 0%,100% { transform: rotate(0); } 20% { transform: rotate(-4deg); } 40% { transform: rotate(4deg); } 60% { transform: rotate(-3deg); } 80% { transform: rotate(3deg); } }
      @keyframes qs-x-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      @keyframes qs-x-flip { from { transform: rotateY(90deg); opacity: 0; } to { transform: rotateY(0); opacity: 1; } }
      @keyframes qs-x-bar { from { width: 0; } }
      @keyframes qs-x-spin { to { transform: rotate(360deg); } }
      @keyframes qs-x-fire { 0%,100% { transform: scaleY(1) translateY(0); opacity: .8; } 50% { transform: scaleY(1.25) translateY(-6px); opacity: 1; } }
      .qs-x-stripes { background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 20px, transparent 20px 40px); background-size: 120px 120px; animation: qs-x-stripes 3s linear infinite; }
      .qs-x-card:hover { transform: translateY(-6px) scale(1.03); box-shadow: 0 18px 40px rgba(255,87,34,.45) !important; }
    `}</style>
  );
}

function extremeShell(children, extra) {
  return (
    <div className="qs-x-stripes" style={{
      position: "fixed", inset: 0, zIndex: 800, overflowY: "auto",
      background: EXTREME_BG, color: "#fff", fontFamily: EXTREME_FONT,
      padding: "24px 16px", ...extra,
    }}>
      <ExtremeStyles />
      {children}
    </div>
  );
}

function ExtremeTitle({ children, sub }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 18 }}>
      <div style={{
        fontSize: "clamp(28px, 6vw, 54px)", fontWeight: 900, letterSpacing: ".06em", textTransform: "uppercase",
        color: "#ffd54f", animation: "qs-x-glow 1.6s ease-in-out infinite",
      }}>{children}</div>
      {sub && <div style={{ fontSize: 15, opacity: .85, marginTop: 4, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

// ---------- RANKING (docente y estudiante) ----------
function ExtremeRanking({ session, quiz, myId, onContinue, final = false }) {
  const list = useMemoX(() => Object.values(session.participants || {})
    .sort((a, b) => (b.score || 0) - (a.score || 0)), [session.participants]);
  const top = list.slice(0, 3);
  const rest = list.slice(3);
  const max = Math.max(1, ...list.map(p => p.score || 0));
  const medal = ["🥇", "🥈", "🥉"];
  const podiumH = [150, 110, 84];
  const order = [1, 0, 2]; // 2º, 1º, 3º (el primero al centro)

  return extremeShell(
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <ExtremeTitle sub={`Después de la pregunta ${session.currentQuestionIdx + 1} · ${list.length} en la arena`}>
        ⚔️ {final ? "Ranking final" : "Ranking"} ⚔️
      </ExtremeTitle>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 10, marginBottom: 26, minHeight: 250 }}>
        {order.map(pos => {
          const p = top[pos];
          if (!p) return <div key={pos} style={{ width: "30%" }} />;
          const first = pos === 0;
          return (
            <div key={p.id} style={{ width: "30%", textAlign: "center", animation: `qs-x-rise .7s cubic-bezier(.2,.9,.3,1.2) ${pos * .25 + .2}s both` }}>
              <div style={{ fontSize: first ? 64 : 48, lineHeight: 1, animation: first ? "qs-x-bounce 1.2s ease-in-out infinite" : "qs-x-shake 2.2s ease-in-out infinite" }}>
                {extremeEmoji(p)}
              </div>
              {first && <div style={{ fontSize: 30, marginTop: -8, animation: "qs-x-fire 1s ease-in-out infinite" }}>🔥👑🔥</div>}
              <div style={{ fontWeight: 800, fontSize: first ? 18 : 15, margin: "6px 0 2px", overflowWrap: "anywhere", color: p.id === myId ? "#ffd54f" : "#fff" }}>
                {p.name}{p.id === myId ? " (tú)" : ""}
              </div>
              <div style={{ fontSize: 13, opacity: .8, marginBottom: 6 }}>{window.fmtPts ? window.fmtPts(p.score) : (p.score || 0)} pts{p.streak >= 2 ? ` · 🔥${p.streak}` : ""}{p.shield ? " · 🛡️" : ""}</div>
              <div style={{
                height: podiumH[pos], borderRadius: "12px 12px 0 0",
                background: first ? "linear-gradient(180deg, #ffd54f, #b8860b)" : pos === 1 ? "linear-gradient(180deg, #e0e0e0, #8d8d8d)" : "linear-gradient(180deg, #ffab91, #8d4a2e)",
                display: "grid", placeItems: "center", fontSize: 32, boxShadow: "0 -6px 24px rgba(255,152,0,.35)",
              }}>{medal[pos]}</div>
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {rest.map((p, i) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12,
              background: p.id === myId ? "rgba(255,213,79,.18)" : "rgba(255,255,255,.07)",
              border: p.id === myId ? "1px solid #ffd54f" : "1px solid rgba(255,255,255,.1)",
              animation: `qs-x-slide .45s ease ${.9 + i * .08}s both`,
            }}>
              <div style={{ width: 28, fontWeight: 900, opacity: .8 }}>{i + 4}</div>
              <div style={{ fontSize: 26 }}>{extremeEmoji(p)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.name}{p.id === myId ? " (tú)" : ""}{p.streak >= 2 ? ` 🔥${p.streak}` : ""}{p.shield ? " 🛡️" : ""}
                </div>
                <div style={{ height: 8, background: "rgba(255,255,255,.12)", borderRadius: 4, marginTop: 5, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${((p.score || 0) / max) * 100}%`, background: "linear-gradient(90deg, #ff5722, #ffc107)", animation: `qs-x-bar 1s ease ${1 + i * .08}s both` }} />
                </div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 16 }}>{window.fmtPts ? window.fmtPts(p.score) : (p.score || 0)}</div>
            </div>
          ))}
        </div>
      )}

      {onContinue ? (
        <button onClick={onContinue} className="qs-btn qs-btn--lg" style={{
          width: "100%", marginTop: 24, background: "linear-gradient(135deg, #ff5722, #ffc107)", color: "#1a0505",
          fontWeight: 900, fontSize: 17, animation: "qs-x-pulse 1.4s ease-in-out infinite",
        }}>➡️ Continuar la batalla</button>
      ) : (
        <p style={{ textAlign: "center", marginTop: 22, opacity: .8, fontWeight: 600 }}>Esperando que el docente continúe…</p>
      )}
    </div>
  );
}

// ---------- ELECCIÓN DE PRIVILEGIO (celular del ganador) ----------
function ExtremePrivilegePicker({ offer, participant, onChoose }) {
  const chosen = offer.choice ? extremePrivilege(offer.choice) : null;
  const [picking, setPicking] = useStateX(null);

  if (chosen || picking) {
    const pr = chosen || extremePrivilege(picking);
    return extremeShell(
      <div style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
        <div style={{ fontSize: 96, lineHeight: 1, animation: "qs-x-bounce 1.2s ease-in-out infinite" }}>{pr.emoji}</div>
        <ExtremeTitle sub={pr.desc}>{pr.name}</ExtremeTitle>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 14, background: "rgba(255,255,255,.1)", fontWeight: 700 }}>
          <span style={{ width: 18, height: 18, border: "3px solid #ffd54f", borderTopColor: "transparent", borderRadius: "50%", animation: "qs-x-spin .9s linear infinite" }} />
          Esperando la aprobación del docente…
        </div>
      </div>
    );
  }

  return extremeShell(
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ textAlign: "center", fontSize: 64, lineHeight: 1, animation: "qs-x-shake 1.2s ease-in-out infinite" }}>{extremeEmoji(participant)}</div>
      <ExtremeTitle sub={`${participant?.name || "Campeón"}: ¡3 aciertos seguidos! Elige tu privilegio`}>🔥 ¡Racha! 🔥</ExtremeTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {(offer.options || []).map((id, i) => {
          const pr = extremePrivilege(id);
          if (!pr) return null;
          return (
            <button key={id} className="qs-x-card" onClick={() => { setPicking(id); onChoose(id); }} style={{
              padding: "20px 12px", borderRadius: 18, border: "2px solid rgba(255,213,79,.5)", cursor: "pointer",
              background: "linear-gradient(160deg, rgba(255,87,34,.35), rgba(0,0,0,.35))", color: "#fff",
              textAlign: "center", boxShadow: "0 10px 26px rgba(0,0,0,.4)", transition: "transform .18s, box-shadow .18s",
              animation: `qs-x-flip .55s ease ${i * .12}s both`, minHeight: 170, fontFamily: EXTREME_FONT,
            }}>
              <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 8 }}>{pr.emoji}</div>
              <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 6, color: "#ffd54f" }}>{pr.name}</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, opacity: .92 }}>{pr.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- ESPERA (los demás celulares) ----------
function ExtremeWaiting({ offer, session }) {
  const p = session.participants?.[offer.pid];
  const pr = offer.choice ? extremePrivilege(offer.choice) : null;
  return extremeShell(
    <div style={{ maxWidth: 440, margin: "40px auto", textAlign: "center" }}>
      <div style={{ fontSize: 88, lineHeight: 1, animation: "qs-x-shake 1.2s ease-in-out infinite" }}>{extremeEmoji(p)}</div>
      <ExtremeTitle sub={pr ? `Eligió: ${pr.emoji} ${pr.name}` : "¡3 aciertos seguidos!"}>{p?.name || "Alguien"}</ExtremeTitle>
      <div style={{ padding: "16px 18px", borderRadius: 16, background: "rgba(255,255,255,.08)", fontWeight: 700, fontSize: 16, lineHeight: 1.5 }}>
        {pr ? <>{pr.desc}<br /><span style={{ opacity: .8, fontSize: 14 }}>El docente decide si lo aprueba…</span></>
            : <>Está eligiendo su privilegio… <span style={{ display: "inline-block", animation: "qs-x-pulse 1s ease-in-out infinite" }}>😰</span></>}
      </div>
    </div>
  );
}

// ---------- PANEL DEL DOCENTE (aprobar / rechazar) ----------
function ExtremeHostPanel({ session, onApprove, onReject, onSkip }) {
  const offer = session.privilegeOffer;
  if (!offer) return null;
  const p = session.participants?.[offer.pid];
  const pr = offer.choice ? extremePrivilege(offer.choice) : null;
  const queued = (session.privilegeQueue || []).length;
  return (
    <div style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 850, width: "min(380px, calc(100vw - 32px))",
      background: EXTREME_BG, color: "#fff", borderRadius: 18, padding: 18, fontFamily: EXTREME_FONT,
      border: "2px solid #ffd54f", boxShadow: "0 18px 50px rgba(0,0,0,.6)", animation: "qs-x-rise .5s ease",
    }}>
      <ExtremeStyles />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 40, animation: "qs-x-shake 1.2s ease-in-out infinite" }}>{extremeEmoji(p)}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#ffd54f", fontWeight: 800, letterSpacing: ".08em" }}>🔥 RACHA · PRIVILEGIO</div>
          <div style={{ fontWeight: 800, fontSize: 16, overflowWrap: "anywhere" }}>{p?.name || "—"}</div>
        </div>
      </div>
      {pr ? (
        <>
          <div style={{ padding: 12, borderRadius: 12, background: "rgba(255,255,255,.1)", marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 17 }}>{pr.emoji} {pr.name}</div>
            <div style={{ fontSize: 13, opacity: .9, lineHeight: 1.4 }}>{pr.desc}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onApprove} className="qs-btn" style={{ flex: 1, background: "linear-gradient(135deg, #43a047, #a5d6a7)", color: "#062e0a", fontWeight: 900 }}>✅ Aprobar</button>
            <button onClick={onReject} className="qs-btn" style={{ flex: 1, background: "rgba(255,255,255,.12)", color: "#fff", fontWeight: 800, border: "1px solid rgba(255,255,255,.3)" }}>✋ Rechazar</button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, opacity: .9, marginBottom: 10 }}>Está eligiendo entre 4 privilegios en su celular…</div>
          <button onClick={onSkip} className="qs-btn qs-btn--sm" style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}>Saltar este turno</button>
        </>
      )}
      {queued > 0 && <div style={{ fontSize: 12, opacity: .7, marginTop: 8 }}>+{queued} en cola con racha</div>}
    </div>
  );
}

// ---------- Aviso de efectos activos en la pregunta actual ----------
// Para el ESTUDIANTE: qué me afecta a mí. Para el DOCENTE (me = null): todo.
function ExtremeEffectBanner({ session, quiz, me, style }) {
  const qIdx = session.currentQuestionIdx;
  const fx = session.extremeEffects || {};
  const name = (pid) => session.participants?.[pid]?.name || "alguien";
  const chips = [];
  const on = (k) => fx[k] && fx[k].qIdx === qIdx ? fx[k] : null;
  const t = on("timecut"), f = on("freeze"), s = on("sabotage"), fp = on("freepass"), d = on("double"), sp = on("spotlight");
  if (sp) chips.push({ e: "👑", txt: me == null || sp.by !== me ? `${name(sp.by)} lleva la corona` : "¡Llevas la corona!" });
  if (t && (me == null || t.by !== me)) chips.push({ e: "✂️", txt: me == null ? `Tijera de ${name(t.by)}: −${t.seconds} s a los demás` : `Tijera de ${name(t.by)}: tienes ${t.seconds} s menos` });
  if (f && (me == null || f.by !== me)) chips.push({ e: "❄️", txt: me == null ? `Congelar de ${name(f.by)}: los demás esperan ${f.seconds} s` : `Congelado ${f.seconds} s por ${name(f.by)}` });
  if (s && (me == null || s.by !== me)) chips.push({ e: "🕳️", txt: me == null ? `Sabotaje de ${name(s.by)}: la opción correcta no aparece a los demás` : `Sabotaje de ${name(s.by)}: ¡falta una opción!` });
  if (fp && (me == null || fp.by === me)) chips.push({ e: "🎫", txt: me == null ? `${name(fp.by)} tiene pase libre` : "Pase libre: esta la ganas sin responder" });
  if (d && (me == null || d.by === me)) chips.push({ e: "💎", txt: me == null ? `${name(d.by)} juega doble o nada` : "Doble o nada: ¡vale el doble!" });
  if (!chips.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", ...style }}>
      <ExtremeStyles />
      {chips.map((c, i) => (
        <span key={i} style={{
          background: "linear-gradient(135deg, #ff5722, #ffc107)", color: "#1a0505", fontWeight: 800, fontSize: 13,
          padding: "6px 12px", borderRadius: 999, boxShadow: "0 4px 14px rgba(255,87,34,.45)",
          animation: `qs-x-rise .5s ease ${i * .1}s both`,
        }}>{c.e} {c.txt}</span>
      ))}
    </div>
  );
}

// Pantalla del estudiante cuando NO debe responder (pase libre / ya la tiene ganada)
function ExtremeSkipScreen({ emoji, title, desc }) {
  return extremeShell(
    <div style={{ maxWidth: 420, margin: "50px auto", textAlign: "center" }}>
      <div style={{ fontSize: 96, lineHeight: 1, animation: "qs-x-bounce 1.2s ease-in-out infinite" }}>{emoji}</div>
      <ExtremeTitle sub={desc}>{title}</ExtremeTitle>
      <p style={{ opacity: .8, fontWeight: 600 }}>Relájate y mira sufrir a los demás 😎</p>
    </div>
  );
}

window.EXTREME_PRIVILEGES = EXTREME_PRIVILEGES;
window.extremeEmoji = extremeEmoji;
window.extremePrivilege = extremePrivilege;
window.extremeNextQuestionIdx = extremeNextQuestionIdx;
window.extremeRankingDue = extremeRankingDue;
window.extremeStreakUpdates = extremeStreakUpdates;
window.extremeBuildOffer = extremeBuildOffer;
window.extremeAdvanceQueue = extremeAdvanceQueue;
window.extremeApprovalUpdates = extremeApprovalUpdates;
window.extremeEffectsFor = extremeEffectsFor;
window.ExtremeRanking = ExtremeRanking;
window.ExtremePrivilegePicker = ExtremePrivilegePicker;
window.ExtremeWaiting = ExtremeWaiting;
window.ExtremeHostPanel = ExtremeHostPanel;
window.ExtremeEffectBanner = ExtremeEffectBanner;
window.ExtremeSkipScreen = ExtremeSkipScreen;
