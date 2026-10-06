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

// ---------- Cantidades (puntos y segundos) ----------
// Los puntos se escalan con lo que vale una pregunta del quiz ("unidad",
// el promedio de pointsCorrect; 10 por defecto): ganar 3 seguidas debe
// costarle algo de verdad a los demás. Con preguntas de 10 puntos:
//   Drenaje  −15 a cada uno · Asalto  15 a 30 (20 % del puntaje del líder)
// Los segundos son fijos pero nunca dejan sin pregunta: la Tijera deja al
// menos el 40 % del tiempo y Congelar dura como mucho la mitad.
const EXTREME_TIMECUT_S = 30;
const EXTREME_FREEZE_S = 20;
const EXTREME_ACCUSE_PTS = 32;
const EXTREME_CONCENTRATION_PTS = 17;
const EXTREME_BONUS_PTS = 10;
function extremeUnit(quiz) {
  const qs = ((quiz && quiz.questions) || []).filter(q => q.type !== "slide");
  if (!qs.length) return 10;
  const avg = qs.reduce((s, q) => s + (Number(q.pointsCorrect ?? 10) || 0), 0) / qs.length;
  return Math.max(1, Math.round(avg));
}
const extremeDrainPts = (quiz) => Math.round(extremeUnit(quiz) * 1.5);
function extremeStealPts(quiz, leaderScore) {
  const u = extremeUnit(quiz);
  const want = Math.min(u * 3, Math.max(Math.round(u * 1.5), Math.round((leaderScore || 0) * 0.2)));
  return Math.max(0, Math.min(want, leaderScore || 0));
}
// Segundos efectivos en el celular, según el tiempo total de la pregunta.
const extremeTimecutFor = (totalSec, cut) => Math.max(0, Math.min(cut || 0, Math.floor(totalSec * 0.6)));
const extremeFreezeFor = (totalSec, freeze) => Math.max(0, Math.min(freeze || 0, Math.floor(totalSec * 0.5)));

// ---------- Catálogo de privilegios ----------
// kind "instant": el docente lo aplica al aprobar.
// kind "next":    queda programado para la siguiente pregunta (no diapositiva).
// target: el estudiante elige además a un compañero ("top4" = de los 4
//         primeros del ranking, "any" = cualquiera).
// desc(quiz): texto con las cantidades reales de este quiz.
const EXTREME_PRIVILEGES = [
  { id: "drain",     emoji: "💀", name: "Drenaje",         kind: "instant", desc: (q) => `Todos los demás pierden ${extremeDrainPts(q)} puntos.` },
  { id: "steal",     emoji: "🦹", name: "Asalto al líder", kind: "instant", desc: (q) => `Le robas al primero del ranking entre ${Math.round(extremeUnit(q) * 1.5)} y ${extremeUnit(q) * 3} puntos (según cuánto lleve).` },
  { id: "timecut",   emoji: "✂️", name: "Tijera",          kind: "next",    desc: () => `Los demás tienen ${EXTREME_TIMECUT_S} s menos en la siguiente pregunta.` },
  { id: "freeze",    emoji: "❄️", name: "Congelar",        kind: "next",    desc: () => `Los demás no pueden responder los primeros ${EXTREME_FREEZE_S} s de la siguiente.` },
  { id: "sabotage",  emoji: "🕳️", name: "Sabotaje",        kind: "next",    desc: () => "En la siguiente, a los demás les desaparece la opción correcta." },
  { id: "repeat",    emoji: "🔁", name: "Otra vez",        kind: "instant", desc: () => "Los demás repiten esta pregunta. Tú ya la tienes ganada." },
  { id: "freepass",  emoji: "🎫", name: "Pase libre",      kind: "next",    desc: () => "La siguiente pregunta la ganas sin responder." },
  { id: "double",    emoji: "💎", name: "Doble o nada",    kind: "next",    desc: () => "La siguiente pregunta vale el doble para ti." },
  { id: "shield",    emoji: "🛡️", name: "Escudo",          kind: "instant", desc: () => "Te protege del próximo ataque que te lancen." },
  { id: "spotlight", emoji: "👑", name: "Corona",          kind: "next",    desc: () => "Tu nombre brilla en el proyector durante la siguiente pregunta." },
  { id: "gravity",   emoji: "🌀", name: "Gravedad",        kind: "next",    desc: () => "En la siguiente, las respuestas de los demás flotan, rebotan y giran por la pantalla." },
  { id: "blind",     emoji: "🕶️", name: "A ciegas",        kind: "next",    desc: () => "En la siguiente, la pantalla de los demás se apaga y se prende hasta que respondan." },
  { id: "confusion", emoji: "🔀", name: "Confusión",       kind: "next",    desc: () => "En la siguiente, las respuestas de los demás salen con letras y palabras revueltas." },
  { id: "accuse",    emoji: "🫵", name: "Acusar",          kind: "instant", target: "top4", desc: () => `Acusas de plagio (sin razón) a uno de los 4 primeros: pierde ${EXTREME_ACCUSE_PTS} puntos.` },
  { id: "concentration", emoji: "🧘", name: "Concentración", kind: "next",  desc: () => `En la siguiente, a los demás elegir la correcta les quita ${EXTREME_CONCENTRATION_PTS} puntos: deben elegir una incorrecta.` },
  { id: "bonus",     emoji: "🎁", name: "Bonificación",    kind: "instant", desc: () => `Te regalas ${EXTREME_BONUS_PTS} puntos.` },
  { id: "reveal",    emoji: "🔮", name: "Revelación",      kind: "next",    desc: () => "En la siguiente pregunta ves cuál es la respuesta correcta (solo tú)." },
  { id: "help",      emoji: "🙋", name: "Ayuda del docente", kind: "next",  desc: () => "En la siguiente pregunta el docente te da una ayuda." },
  { id: "expel",     emoji: "🚪", name: "Expulsión",       kind: "instant", target: "any", desc: () => "Pides en público expulsar a un compañero de la sala. El docente decide." },
];
const EXTREME_STREAK_STEP = 3;       // cada 3 aciertos seguidos
const EXTREME_RANKING_EVERY = 3;     // ranking cada 3 preguntas
const EXTREME_OFFER_SIZE = 4;

function extremePrivilege(id) { return EXTREME_PRIVILEGES.find(p => p.id === id) || null; }
function extremeDesc(p, quiz) { return p ? (typeof p.desc === "function" ? p.desc(quiz) : p.desc) : ""; }

// Compañeros que puede elegir como blanco quien tiene el privilegio.
function extremeTargets(session, pid, privId) {
  const pr = extremePrivilege(privId);
  if (!pr || !pr.target) return [];
  const others = Object.values((session && session.participants) || {})
    .filter(p => p.id !== pid)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  return pr.target === "top4" ? others.slice(0, 4) : others;
}

// Privilegios activos para ESTE quiz. quiz.extremePrivileges = { id: false }
// apaga uno; lo que no aparece ahí (quizzes viejos, privilegios nuevos)
// queda activo.
function extremeEnabledIds(quiz) {
  const cfg = (quiz && quiz.extremePrivileges) || {};
  return EXTREME_PRIVILEGES.filter(p => cfg[p.id] !== false).map(p => p.id);
}

// Sortea hasta n privilegios entre los ACTIVOS del quiz (si hay menos de
// n activos, se ofrecen todos los que haya).
function extremePickOptions(n = EXTREME_OFFER_SIZE, quiz) {
  const enabled = extremeEnabledIds(quiz);
  const pool = EXTREME_PRIVILEGES.filter(p => enabled.includes(p.id));
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
    // Respondió, pero la respuesta aún no tiene nota (abierta que el docente
    // califica después del reveal — en el Taller casi todas): no suma ni
    // corta la racha. Antes contaba como fallo y en un Taller que alterna
    // cerradas y abiertas nadie llegaba nunca a 3 seguidas.
    if (a && (a.correct === null || a.correct === undefined)) return;
    // extremeWin: en "Concentración" ganar es elegir una incorrecta.
    const correct = !!(a && (a.extremeWin !== undefined ? a.extremeWin : a.correct === true));
    const next = correct ? (p.streak || 0) + 1 : 0;
    if (next !== (p.streak || 0)) updates[`participants.${p.id}.streak`] = next;
    if (correct && next > 0 && next % EXTREME_STREAK_STEP === 0) triggered.push(p.id);
  });
  return { updates, triggered };
}

// Oferta de privilegio, o null si el docente apagó todos los privilegios
// de este quiz (la racha se sigue contando, pero no hay nada que elegir).
function extremeBuildOffer(pid, qIdx, quiz) {
  const options = extremePickOptions(EXTREME_OFFER_SIZE, quiz);
  if (!options.length) return null;
  return { pid, qIdx, options, status: "choosing", choice: null, at: Date.now() };
}

// Actualizaciones para pasar a la siguiente oferta de la cola (o cerrar).
function extremeAdvanceQueue(session, quiz) {
  const queue = [...(session.privilegeQueue || [])];
  const next = queue.shift();
  return {
    privilegeOffer: next ? extremeBuildOffer(next, session.currentQuestionIdx, quiz) : null,
    privilegeQueue: next && extremeEnabledIds(quiz).length ? queue : [],
  };
}

// Actualizaciones al APROBAR un privilegio. Devuelve { updates, repeat, expel }:
// "repeat" pide al docente relanzar la pregunta actual eximiendo a pid;
// "expel" es el id del compañero que el docente aceptó expulsar.
function extremeApprovalUpdates({ session, quiz, pid, privId, target, firebase }) {
  const updates = {};
  const inc = (n) => firebase.firestore.FieldValue.increment(n);
  const others = Object.values(session.participants || {}).filter(p => p.id !== pid);
  const nextIdx = extremeNextQuestionIdx(quiz, session.currentQuestionIdx);
  const stamp = { by: pid, qIdx: nextIdx, at: Date.now() };
  let repeat = false;
  let expel = null;
  // Restar sin dejar a nadie en negativo.
  const takeFrom = (p, n) => {
    const amount = Math.min(n, Math.max(0, p.score || 0));
    if (amount > 0) updates[`participants.${p.id}.score`] = inc(-amount);
    return amount;
  };

  switch (privId) {
    case "drain": {
      const n = extremeDrainPts(quiz);
      others.forEach(p => {
        if (p.shield) updates[`participants.${p.id}.shield`] = false;   // el escudo absorbe
        else takeFrom(p, n);
      });
      break;
    }
    case "steal": {
      const leader = [...others].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      if (leader) {
        if (leader.shield) updates[`participants.${leader.id}.shield`] = false;
        else {
          const amount = extremeStealPts(quiz, leader.score || 0);
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
      if (nextIdx >= 0) updates["extremeEffects.timecut"] = { ...stamp, seconds: EXTREME_TIMECUT_S };
      break;
    case "freeze":
      if (nextIdx >= 0) updates["extremeEffects.freeze"] = { ...stamp, seconds: EXTREME_FREEZE_S };
      break;
    case "accuse": {
      const t = session.participants?.[target];
      if (t) {
        if (t.shield) updates[`participants.${t.id}.shield`] = false;
        else takeFrom(t, EXTREME_ACCUSE_PTS);
      }
      break;
    }
    case "bonus":
      updates[`participants.${pid}.score`] = inc(EXTREME_BONUS_PTS);
      break;
    case "expel":
      if (target && session.participants?.[target]) expel = target;
      break;
    case "gravity": case "blind": case "confusion": case "reveal": case "help":
      if (nextIdx >= 0) updates["extremeEffects." + privId] = stamp;
      break;
    case "concentration":
      if (nextIdx >= 0) updates["extremeEffects.concentration"] = { ...stamp, penalty: EXTREME_CONCENTRATION_PTS };
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
  return { updates, repeat, expel };
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
    gravity:   notMe(on("gravity")),
    blind:     notMe(on("blind")),
    confusion: notMe(on("confusion")),
    concentration: notMe(on("concentration")),
    reveal:    forMe(on("reveal")),
    help:      forMe(on("help")),
  };
}

// ---------- Confusión: revolver letras y palabras ----------
// Determinista por semilla (id de opción + pregunta), para que el texto
// no cambie en cada render del cronómetro.
function extremeScramble(text, seed) {
  let h = 2166136261;
  const s0 = String(seed);
  for (let i = 0; i < s0.length; i++) { h ^= s0.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h / 4294967296; };
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const plain = window.richToPlain ? window.richToPlain(text) : String(text || "");
  const words = plain.split(/\s+/).filter(Boolean).map(w => shuffle(Array.from(w.toLowerCase())).join(""));
  return shuffle(words).join(" ");
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
      /* Gravedad: cuatro trayectorias distintas (rebotan, giran, suben y bajan) */
      @keyframes qs-x-grav-0 { 0%,100% { transform: translate(0,0) rotate(0); } 25% { transform: translate(28vw,-14vh) rotate(160deg); } 50% { transform: translate(-6vw,22vh) rotate(-90deg); } 75% { transform: translate(-26vw,-6vh) rotate(220deg); } }
      @keyframes qs-x-grav-1 { 0%,100% { transform: translate(0,0) rotate(0); } 20% { transform: translate(-30vw,18vh) rotate(-200deg); } 55% { transform: translate(22vw,-20vh) rotate(120deg); } 80% { transform: translate(6vw,12vh) rotate(-40deg); } }
      @keyframes qs-x-grav-2 { 0%,100% { transform: translate(0,0) rotate(0); } 30% { transform: translate(18vw,-26vh) rotate(90deg); } 60% { transform: translate(-24vw,-8vh) rotate(-180deg); } 85% { transform: translate(10vw,16vh) rotate(300deg); } }
      @keyframes qs-x-grav-3 { 0%,100% { transform: translate(0,0) rotate(0); } 25% { transform: translate(-20vw,-24vh) rotate(-120deg); } 50% { transform: translate(26vw,8vh) rotate(200deg); } 75% { transform: translate(-8vw,20vh) rotate(-260deg); } }
      /* A ciegas: la pantalla se apaga y se prende */
      @keyframes qs-x-blind { 0%,38% { opacity: 0; } 42%,78% { opacity: 1; } 82%,100% { opacity: 0; } }
      @keyframes qs-x-reveal { 0%,100% { box-shadow: 0 0 0 4px #ffd54f, 0 0 18px #ffd54f; } 50% { box-shadow: 0 0 0 7px #fff59d, 0 0 34px #ffeb3b; } }
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
function ExtremePrivilegePicker({ offer, participant, onChoose, session, quiz }) {
  const chosen = offer.choice ? extremePrivilege(offer.choice) : null;
  const [picking, setPicking] = useStateX(null);
  // Privilegio con blanco (Acusar / Expulsión) elegido, falta el compañero.
  const [needTarget, setNeedTarget] = useStateX(null);

  if (needTarget && !chosen) {
    const pr = extremePrivilege(needTarget);
    const targets = extremeTargets(session, participant && participant.id, needTarget);
    return extremeShell(
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ textAlign: "center", fontSize: 72, lineHeight: 1, animation: "qs-x-shake 1.2s ease-in-out infinite" }}>{pr.emoji}</div>
        <ExtremeTitle sub={pr.target === "top4" ? "Elige a quién acusar (de los 4 primeros)" : "Elige a quién pedir expulsar"}>{pr.name}</ExtremeTitle>
        <div style={{ display: "grid", gap: 10 }}>
          {targets.map((t, i) => (
            <button key={t.id} className="qs-x-card" onClick={() => { setPicking(needTarget); onChoose(needTarget, t.id); }} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 16, cursor: "pointer",
              border: "2px solid rgba(255,213,79,.5)", color: "#fff", fontFamily: EXTREME_FONT, textAlign: "left",
              background: "linear-gradient(160deg, rgba(255,87,34,.35), rgba(0,0,0,.35))", transition: "transform .18s, box-shadow .18s",
              animation: `qs-x-slide .4s ease ${i * .08}s both`,
            }}>
              <span style={{ fontSize: 32 }}>{extremeEmoji(t)}</span>
              <span style={{ flex: 1, fontWeight: 800, fontSize: 16, overflowWrap: "anywhere" }}>{t.name}</span>
              <span style={{ fontWeight: 900, color: "#ffd54f" }}>{window.fmtPts ? window.fmtPts(t.score) : (t.score || 0)} pts</span>
            </button>
          ))}
          {targets.length === 0 && <p style={{ textAlign: "center", opacity: .8 }}>No hay compañeros para elegir.</p>}
        </div>
        <button onClick={() => setNeedTarget(null)} className="qs-btn qs-btn--sm" style={{ marginTop: 14, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}>
          ← Elegir otro privilegio
        </button>
      </div>
    );
  }

  if (chosen || picking) {
    const pr = chosen || extremePrivilege(picking);
    const tName = offer.target && session ? session.participants?.[offer.target]?.name : null;
    return extremeShell(
      <div style={{ maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
        <div style={{ fontSize: 96, lineHeight: 1, animation: "qs-x-bounce 1.2s ease-in-out infinite" }}>{pr.emoji}</div>
        <ExtremeTitle sub={tName ? `${extremeDesc(pr, quiz)} → ${tName}` : extremeDesc(pr, quiz)}>{pr.name}</ExtremeTitle>
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
            <button key={id} className="qs-x-card" onClick={() => {
              if (pr.target) { setNeedTarget(id); return; }
              setPicking(id); onChoose(id);
            }} style={{
              padding: "20px 12px", borderRadius: 18, border: "2px solid rgba(255,213,79,.5)", cursor: "pointer",
              background: "linear-gradient(160deg, rgba(255,87,34,.35), rgba(0,0,0,.35))", color: "#fff",
              textAlign: "center", boxShadow: "0 10px 26px rgba(0,0,0,.4)", transition: "transform .18s, box-shadow .18s",
              animation: `qs-x-flip .55s ease ${i * .12}s both`, minHeight: 170, fontFamily: EXTREME_FONT,
            }}>
              <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 8 }}>{pr.emoji}</div>
              <div style={{ fontWeight: 900, fontSize: 17, marginBottom: 6, color: "#ffd54f" }}>{pr.name}</div>
              <div style={{ fontSize: 13, lineHeight: 1.4, opacity: .92 }}>{extremeDesc(pr, quiz)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- ESPERA (los demás celulares) ----------
function ExtremeWaiting({ offer, session, quiz, myId }) {
  const p = session.participants?.[offer.pid];
  const pr = offer.choice ? extremePrivilege(offer.choice) : null;
  // Acusar / Expulsión: se anuncia EN PÚBLICO contra quién va.
  const t = offer.target ? session.participants?.[offer.target] : null;
  const isMe = t && t.id === myId;
  return extremeShell(
    <div style={{ maxWidth: 440, margin: "40px auto", textAlign: "center" }}>
      <div style={{ fontSize: 88, lineHeight: 1, animation: "qs-x-shake 1.2s ease-in-out infinite" }}>{extremeEmoji(p)}</div>
      <ExtremeTitle sub={pr ? `Eligió: ${pr.emoji} ${pr.name}` : "¡3 aciertos seguidos!"}>{p?.name || "Alguien"}</ExtremeTitle>
      {t && (
        <div style={{
          marginBottom: 12, padding: "12px 16px", borderRadius: 14, fontWeight: 900, fontSize: 17,
          background: isMe ? "linear-gradient(135deg, #b71c1c, #ff5722)" : "rgba(255,87,34,.25)",
          border: "2px solid #ffd54f", animation: "qs-x-pulse 1.1s ease-in-out infinite",
        }}>
          {pr.id === "expel"
            ? (isMe ? "🚪 ¡Pide que TE expulsen a ti!" : `🚪 Pide expulsar a ${t.name}`)
            : (isMe ? "🫵 ¡Te acusa de plagio a ti!" : `🫵 Acusa de plagio a ${t.name}`)}
        </div>
      )}
      <div style={{ padding: "16px 18px", borderRadius: 16, background: "rgba(255,255,255,.08)", fontWeight: 700, fontSize: 16, lineHeight: 1.5 }}>
        {pr ? <>{extremeDesc(pr, quiz)}<br /><span style={{ opacity: .8, fontSize: 14 }}>El docente decide si lo aprueba…</span></>
            : <>Está eligiendo su privilegio… <span style={{ display: "inline-block", animation: "qs-x-pulse 1s ease-in-out infinite" }}>😰</span></>}
      </div>
    </div>
  );
}

// ---------- PANEL DEL DOCENTE (aprobar / rechazar) ----------
function ExtremeHostPanel({ session, quiz, onApprove, onReject, onSkip }) {
  const offer = session.privilegeOffer;
  if (!offer) return null;
  const p = session.participants?.[offer.pid];
  const pr = offer.choice ? extremePrivilege(offer.choice) : null;
  const t = offer.target ? session.participants?.[offer.target] : null;
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
            <div style={{ fontWeight: 900, fontSize: 17 }}>{pr.emoji} {pr.name}{t ? ` → ${t.name}` : ""}</div>
            <div style={{ fontSize: 13, opacity: .9, lineHeight: 1.4 }}>{extremeDesc(pr, quiz)}</div>
            {pr.id === "expel" && (
              <div style={{ fontSize: 12, marginTop: 6, color: "#ffab91", fontWeight: 700 }}>
                ⚠ Si apruebas, {t ? t.name : "el estudiante"} sale de la sala y su resultado no se guarda.
              </div>
            )}
            {pr.id === "help" && (
              <div style={{ fontSize: 12, marginTop: 6, color: "#ffd54f", fontWeight: 700 }}>
                En la siguiente pregunta verás el aviso para darle una pista.
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onApprove} className="qs-btn" style={{ flex: 1, background: "linear-gradient(135deg, #43a047, #a5d6a7)", color: "#062e0a", fontWeight: 900 }}>
              {pr.id === "expel" ? "🚪 Expulsar" : "✅ Aprobar"}
            </button>
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
  const gr = on("gravity"), bl = on("blind"), cf = on("confusion"), cc = on("concentration"), rv = on("reveal"), hp = on("help");
  if (gr && (me == null || gr.by !== me)) chips.push({ e: "🌀", txt: me == null ? `Gravedad de ${name(gr.by)}: las respuestas flotan` : `Gravedad de ${name(gr.by)}: ¡atrapa tu respuesta!` });
  if (bl && (me == null || bl.by !== me)) chips.push({ e: "🕶️", txt: me == null ? `A ciegas de ${name(bl.by)}: pantallas parpadeando` : `A ciegas por ${name(bl.by)}` });
  if (cf && (me == null || cf.by !== me)) chips.push({ e: "🔀", txt: me == null ? `Confusión de ${name(cf.by)}: respuestas revueltas` : `Confusión de ${name(cf.by)}: ¡nada se entiende!` });
  if (cc && (me == null || cc.by !== me)) chips.push({ e: "🧘", txt: me == null ? `Concentración de ${name(cc.by)}: la correcta resta ${cc.penalty || EXTREME_CONCENTRATION_PTS}` : `Concentración: la correcta te quita ${cc.penalty || EXTREME_CONCENTRATION_PTS} pts. ¡Elige una INCORRECTA!` });
  if (rv && (me == null || rv.by === me)) chips.push({ e: "🔮", txt: me == null ? `${name(rv.by)} ve la respuesta correcta` : "Revelación: la correcta brilla en tu pantalla" });
  if (hp && (me == null || hp.by === me)) chips.push({ e: "🙋", txt: me == null ? `${name(hp.by)} pidió tu ayuda: dale una pista` : "El docente te va a ayudar en esta pregunta" });
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

// ---------- EDITOR: qué privilegios se pueden ganar en ESTE quiz ----------
// Ventana emergente desde "Configuración del quiz". Escribe
// quiz.extremePrivileges = { id: false } para los apagados; se guarda con
// el botón "Guardar" del editor, igual que el resto de la configuración.
// En el Taller las abiertas no tienen respuesta "correcta" que sabotear
// ni ocultar: se avisa cuáles solo tienen efecto en preguntas cerradas.
const EXTREME_CLOSED_ONLY = ["sabotage", "gravity", "confusion", "concentration", "reveal"];

function ExtremePrivilegesModal({ quiz, setQuiz, onClose }) {
  const enabled = extremeEnabledIds(quiz);
  const isWorkshop = quiz.mode === "workshop";
  const setOne = (id, on) => setQuiz(q => ({
    ...q, extremePrivileges: { ...(q.extremePrivileges || {}), [id]: on },
  }));
  const setAll = (on) => setQuiz(q => ({
    ...q, extremePrivileges: EXTREME_PRIVILEGES.reduce((o, p) => { o[p.id] = on; return o; }, {}),
  }));
  const kindLabel = { instant: "⚡ Al aprobarlo", next: "⏭️ En la siguiente pregunta" };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(10,4,4,.65)", zIndex: 120,
      display: "grid", placeItems: "center", padding: 16, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 620, maxHeight: "92vh", display: "flex", flexDirection: "column",
        background: EXTREME_BG, color: "#fff", borderRadius: 20, border: "2px solid #ffd54f",
        boxShadow: "0 24px 60px rgba(0,0,0,.6)", fontFamily: EXTREME_FONT, overflow: "hidden",
      }}>
        <ExtremeStyles />
        <div style={{ padding: "20px 22px 12px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#ffd54f" }}>⚔️ Privilegios de la arena</div>
              <div style={{ fontSize: 13, opacity: .85, lineHeight: 1.5, marginTop: 4 }}>
                Con {EXTREME_STREAK_STEP} aciertos seguidos el estudiante elige entre {EXTREME_OFFER_SIZE} privilegios
                al azar <b>de los que dejes activos</b>. Solo aplica a este {isWorkshop ? "taller" : "quiz"}.
              </div>
            </div>
            <button onClick={onClose} title="Cerrar" style={{ background: "transparent", border: 0, color: "#fff", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <span style={{ flex: 1, fontWeight: 800, fontSize: 14 }}>
              {enabled.length} de {EXTREME_PRIVILEGES.length} activos
            </span>
            <button onClick={() => setAll(true)} className="qs-btn qs-btn--sm" style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}>Activar todos</button>
            <button onClick={() => setAll(false)} className="qs-btn qs-btn--sm" style={{ background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}>Desactivar todos</button>
          </div>
          {enabled.length === 0 && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "rgba(255,193,7,.15)", border: "1px solid rgba(255,193,7,.5)", fontSize: 13, fontWeight: 700, color: "#ffd54f" }}>
              ⚠ Sin privilegios activos: habrá ranking y rachas, pero nadie podrá elegir privilegio.
            </div>
          )}
          {enabled.length > 0 && enabled.length < EXTREME_OFFER_SIZE && (
            <div style={{ marginTop: 10, fontSize: 12, opacity: .8 }}>
              Con menos de {EXTREME_OFFER_SIZE} activos, el estudiante verá solo esos {enabled.length}.
            </div>
          )}
        </div>

        <div style={{ padding: "4px 22px 18px", overflowY: "auto", display: "grid", gap: 8 }}>
          {EXTREME_PRIVILEGES.map(p => {
            const on = enabled.includes(p.id);
            return (
              <button key={p.id} onClick={() => setOne(p.id, !on)} style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 14,
                cursor: "pointer", textAlign: "left", color: "#fff", fontFamily: EXTREME_FONT,
                background: on ? "linear-gradient(135deg, rgba(255,87,34,.32), rgba(0,0,0,.25))" : "rgba(255,255,255,.04)",
                border: "1px solid " + (on ? "rgba(255,213,79,.7)" : "rgba(255,255,255,.12)"),
                opacity: on ? 1 : .6, transition: "opacity .15s, background .15s",
              }}>
                <span style={{ fontSize: 30, lineHeight: 1, filter: on ? "none" : "grayscale(1)" }}>{p.emoji}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 900, fontSize: 15, color: on ? "#ffd54f" : "#fff" }}>{p.name}</span>
                  <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.4, opacity: .9 }}>{extremeDesc(p, quiz)}</span>
                  <span style={{ display: "block", fontSize: 11, opacity: .7, marginTop: 2 }}>
                    {kindLabel[p.kind]}
                    {isWorkshop && EXTREME_CLOSED_ONLY.includes(p.id) ? " · en el Taller solo afecta preguntas cerradas" : ""}
                  </span>
                </span>
                {/* Interruptor */}
                <span aria-hidden="true" style={{
                  width: 42, height: 24, borderRadius: 999, padding: 2, flexShrink: 0,
                  background: on ? "#43a047" : "rgba(255,255,255,.2)", transition: "background .15s",
                }}>
                  <span style={{
                    display: "block", width: 20, height: 20, borderRadius: "50%", background: "#fff",
                    transform: `translateX(${on ? 18 : 0}px)`, transition: "transform .15s",
                  }} />
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ padding: "12px 22px", borderTop: "1px solid rgba(255,255,255,.12)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ flex: 1, fontSize: 12, opacity: .75 }}>Se guarda con el botón 💾 Guardar del editor.</span>
          <button onClick={onClose} className="qs-btn" style={{ background: "linear-gradient(135deg, #ff5722, #ffc107)", color: "#1a0505", fontWeight: 900 }}>Listo</button>
        </div>
      </div>
    </div>
  );
}

window.EXTREME_PRIVILEGES = EXTREME_PRIVILEGES;
window.extremeEnabledIds = extremeEnabledIds;
window.extremeDesc = extremeDesc;
window.extremeTargets = extremeTargets;
window.extremeScramble = extremeScramble;
window.extremeTimecutFor = extremeTimecutFor;
window.extremeFreezeFor = extremeFreezeFor;
window.ExtremeStyles = ExtremeStyles;
window.ExtremePrivilegesModal = ExtremePrivilegesModal;
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
