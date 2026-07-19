/* global React, firebase */
// ============================================================
// QuizSpark — SESIONES EN VIVO (modo sala tipo Kahoot)
// Componentes:
//   - HostLobby: pantalla del profesor antes de iniciar
//   - HostQuestion: pantalla del profesor durante una pregunta
//   - HostReveal: pantalla del profesor mostrando respuesta correcta + gráfica
//   - HostFinal: ranking final
//   - StudentJoinLive: estudiante entra a sala con código
//   - StudentLive: pantalla del estudiante durante la sesión en vivo
//   - LiveSessionHost: orquesta todo el flujo del profesor
//   - LiveSessionStudent: orquesta todo el flujo del estudiante
// ============================================================
const { useState: useStateL, useEffect: useEffectL, useRef: useRefL } = React;

// ---------- Helpers ----------

// ---- Tema de color por quiz (elegido en la carátula del editor) ----
// Convierte el color de la carátula en el gradiente de fondo que ven
// estudiantes y proyección durante el quiz. Si no hay color: violeta.
const QUIZ_BG_COLORS = {
  "var(--violet-500)":  ["#7c3aed", "#4c1d95"],
  "var(--emerald-500)": ["#059669", "#064e3b"],
  "var(--sky-500)":     ["#0284c7", "#0c4a6e"],
  "var(--amber-500)":   ["#d97706", "#78350f"],
  "var(--pink-500)":    ["#db2777", "#831843"],
  "var(--red-500)":     ["#dc2626", "#7f1d1d"],
};
function quizBg(color) {
  const pair = QUIZ_BG_COLORS[color] || QUIZ_BG_COLORS["var(--violet-500)"];
  return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`;
}

function generateRoomCode() {
  // 6 dígitos numéricos, fácil de dictar
  let code = "";
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  return code;
}

function shuffleArr(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Calcular puntos para una pregunta usando los valores configurados en el editor
// q: pregunta del quiz (con pointsCorrect, pointsWrong, pointsSpeedBonus)
// isCorrect: si la respuesta del estudiante es correcta
// secondsTaken: cuánto demoró en responder
// totalSeconds: tiempo total de la pregunta
function calculatePoints(q, isCorrect, secondsTaken, totalSeconds) {
  const pCorrect = q.pointsCorrect ?? 100;
  const pWrong = q.pointsWrong ?? 0;
  const pBonus = q.pointsSpeedBonus ?? 0;

  if (!isCorrect) return pWrong;

  // Si acertó: puntos base + bonus por velocidad proporcional
  const ratio = Math.max(0, 1 - (secondsTaken / Math.max(1, totalSeconds)));
  const bonus = Math.round(pBonus * ratio);
  return pCorrect + bonus;
}

// Calcular el máximo posible de un quiz (suma de pointsCorrect + pointsSpeedBonus)
function calculateMaxPoints(quiz) {
  return (quiz.questions || []).reduce((sum, q) => {
    // Las diapositivas no califican
    if (q.type === "slide") return sum;
    const correct = q.pointsCorrect ?? 100;
    const bonus = q.pointsSpeedBonus ?? 0;
    return sum + correct + bonus;
  }, 0);
}

// Convertir puntos a nota usando la tabla del quiz
function convertToGrade(points, maxPoints, scale) {
  // Validar que la escala sea utilizable: debe cubrir un rango real, no algo
  // como [{from:0,to:0}] que dejaría todo en la nota mínima.
  const scaleUsable = Array.isArray(scale) && scale.length > 0 &&
    Math.max(...scale.map(r => r.to ?? 0)) > 0;

  if (scaleUsable) {
    for (const range of scale) {
      if (points >= range.from && points <= range.to) {
        return +(+range.grade).toFixed(2);
      }
    }
    const maxTo = Math.max(...scale.map(r => r.to));
    if (points > maxTo) {
      const topGrade = scale.reduce((best, r) => r.to >= best.to ? r : best, scale[0]).grade;
      return +(+topGrade).toFixed(2);
    }
    const minGrade = Math.min(...scale.map(r => r.grade));
    return +minGrade.toFixed(2);
  }

  // Por defecto (o escala inválida): escala colombiana 0-5 lineal por porcentaje
  if (!maxPoints || maxPoints === 0) return 0;
  const ratio = Math.max(0, Math.min(1, points / maxPoints));
  return +(ratio * 5).toFixed(2);
}

// ---- Persistencia de sesión del estudiante (reconexión tras recarga) ----
// Guardamos por código de sala para que, si el estudiante recarga o cierra
// la pestaña, vuelva a su sitio sin re-registrarse ni duplicarse.
function liveStorageKey(code) {
  return "qs_live_" + code;
}
function saveLiveSession(code, data) {
  try { localStorage.setItem(liveStorageKey(code), JSON.stringify(data)); }
  catch (e) { /* localStorage no disponible: seguimos sin persistencia */ }
}
function loadLiveSession(code) {
  try {
    const raw = localStorage.getItem(liveStorageKey(code));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearLiveSession(code) {
  try { localStorage.removeItem(liveStorageKey(code)); }
  catch (e) { /* no-op */ }
}

function checkAnswer(question, answer) {
  if (question.type === "multi" || question.type === "truefalse") {
    const correctOpt = (question.options || []).find(o => o.correct);
    return correctOpt && answer === correctOpt.id;
  }
  if (question.type === "checks") {
    const correctIds = (question.options || []).filter(o => o.correct).map(o => o.id).sort();
    const userIds = Array.isArray(answer) ? [...answer].sort() : [];
    return JSON.stringify(correctIds) === JSON.stringify(userIds);
  }
  if (question.type === "text") {
    const accepted = (question.acceptedAnswers || []).map(a => a.toLowerCase().trim());
    return accepted.includes((answer || "").toLowerCase().trim());
  }
  if (question.type === "order") {
    // answer es array de ids en el orden que envió el estudiante.
    // El orden correcto es el de items tal cual están guardados.
    const correctIds = (question.items || []).map(it => it.id);
    const userIds = Array.isArray(answer) ? answer : [];
    return JSON.stringify(correctIds) === JSON.stringify(userIds);
  }
  return false;
}

// ============================================================
// HOST LOBBY — el profe espera que entren los estudiantes
// ============================================================
// Genera un código QR dentro de un contenedor usando la librería global QRCode
function QRBox({ text, size = 200 }) {
  const ref = useRefL(null);
  useEffectL(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    if (typeof window.QRCode === "undefined") {
      ref.current.innerHTML = '<div style="font-size:12px;color:#64748b">QR no disponible</div>';
      return;
    }
    try {
      new window.QRCode(ref.current, {
        text, width: size, height: size,
        colorDark: "#0f172a", colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    } catch (e) {
      ref.current.innerHTML = '<div style="font-size:12px;color:#64748b">QR no disponible</div>';
    }
  }, [text, size]);
  return <div ref={ref} style={{ display: "inline-block", lineHeight: 0 }} />;
}

// Vista de PROYECCIÓN para el videobeam: código gigante + QR para unirse
function ProjectionView({ session, quiz, joinUrl, participants, onClose }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: quizBg(quiz?.color),
      color: "white", padding: "32px 24px",
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <button onClick={onClose} style={{
        position: "fixed", top: 16, right: 16, background: "rgba(255,255,255,0.18)",
        color: "white", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10,
        padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 14,
      }}>✕ Salir de proyección</button>

      <h1 style={{ fontSize: "clamp(28px, 5vw, 48px)", marginTop: 16, marginBottom: 6, textAlign: "center" }}>
        {quiz.title}
      </h1>
      <p style={{ opacity: 0.85, fontSize: 18, marginBottom: 32 }}>
        Entra en <b>{(window.location.origin + window.location.pathname).replace("https://", "")}</b> → "Unirme a un quiz"
      </p>

      <div style={{
        display: "flex", gap: 48, flexWrap: "wrap", justifyContent: "center", alignItems: "center",
      }}>
        {/* Código gigante */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 20, opacity: 0.85, marginBottom: 12, letterSpacing: ".1em" }}>CÓDIGO</p>
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 800,
            fontSize: "clamp(64px, 12vw, 140px)", letterSpacing: "0.08em", lineHeight: 1,
          }}>
            {session.code}
          </div>
        </div>

        {/* QR */}
        <div style={{
          background: "white", padding: 20, borderRadius: 20, textAlign: "center",
        }}>
          <QRBox text={joinUrl} size={240} />
          <p style={{ color: "#334155", fontSize: 14, fontWeight: 600, marginTop: 10 }}>
            Escanea para entrar
          </p>
        </div>
      </div>

      {/* Participantes que van entrando */}
      <div style={{ marginTop: 40, textAlign: "center", width: "100%", maxWidth: 900 }}>
        <p style={{ fontSize: 20, marginBottom: 16 }}>
          👥 {participants.length} {participants.length === 1 ? "estudiante conectado" : "estudiantes conectados"}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {participants.map(p => (
            <span key={p.id} className="qs-pop-in" style={{
              padding: "8px 18px", borderRadius: 999, fontSize: 18, fontWeight: 700,
              background: "rgba(255,255,255,0.2)",
            }}>{p.name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HostLobby({ session, quiz, onStart, onCancel, onKick }) {
  const participants = Object.values(session.participants || {})
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const baseUrl = window.location.origin + window.location.pathname;
  const joinUrl = `${baseUrl}?join=${session.code}`;
  const [copied, setCopied] = useStateL(false);
  const [projection, setProjection] = useStateL(false);

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (projection) {
    return <ProjectionView
      session={session} quiz={quiz} joinUrl={joinUrl}
      participants={participants} onClose={() => setProjection(false)}
    />;
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: quizBg(quiz?.color),
      padding: 24,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ color: "white" }}>
            <h1 style={{ fontSize: 22, marginBottom: 4 }}>{quiz.title}</h1>
            <p style={{ opacity: 0.8, fontSize: 14 }}>
              {(quiz.questions || []).length} preguntas · Sala en vivo
            </p>
          </div>
          <button onClick={onCancel} className="qs-btn qs-btn--ghost"
            style={{ background: "rgba(255,255,255,0.15)", color: "white", border: "1px solid rgba(255,255,255,0.3)" }}>
            ✕ Cancelar sala
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, alignItems: "start" }}>
          {/* Izquierda: código + URL */}
          <div className="qs-card" style={{ padding: 28, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 8, fontWeight: 600 }}>
              CÓDIGO DE LA SALA
            </p>
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 56, fontWeight: 800,
              color: "var(--violet-700)", letterSpacing: "0.1em", marginBottom: 16,
              padding: "16px 8px", background: "var(--violet-50)", borderRadius: 16,
            }}>
              {session.code}
            </div>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 8, fontWeight: 600 }}>
              ENLACE DIRECTO
            </p>
            <div style={{
              fontSize: 11, padding: 8, background: "var(--ink-50)",
              borderRadius: 8, marginBottom: 10, wordBreak: "break-all", textAlign: "left",
            }}>{joinUrl}</div>
            <button onClick={copyLink} className="qs-btn qs-btn--primary" style={{ width: "100%" }}>
              {copied ? "✓ Copiado" : "🔗 Copiar enlace"}
            </button>
            <button onClick={() => setProjection(true)} className="qs-btn qs-btn--ghost" style={{ width: "100%", marginTop: 8 }}>
              📺 Modo proyección (QR)
            </button>
            <div style={{ marginTop: 16 }}>
              <QRBox text={joinUrl} size={140} />
              <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 6 }}>
                Escanea el QR o usa el modo proyección para el videobeam.
              </p>
            </div>
          </div>

          {/* Derecha: lista de participantes */}
          <div className="qs-card" style={{ padding: 24, minHeight: 360 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18 }}>👥 Estudiantes conectados</h3>
              <span className="qs-chip" style={{
                background: "var(--emerald-500)", color: "white", borderColor: "transparent",
                fontSize: 14, padding: "6px 14px",
              }}>
                {participants.length} {participants.length === 1 ? "estudiante" : "estudiantes"}
              </span>
            </div>

            {participants.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 40, color: "var(--ink-400)",
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }} className="qs-bob">📱</div>
                <p style={{ fontWeight: 600, marginBottom: 4 }}>Esperando a los estudiantes...</p>
                <p style={{ fontSize: 13 }}>Comparte el código de la sala con ellos.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                {participants.map((p, i) => (
                  <div key={p.id} className="qs-pop-in" style={{
                    padding: 12, background: "var(--violet-50)", borderRadius: 10,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: `linear-gradient(135deg, var(--violet-${500 + (i % 3) * 100}), var(--pink-500))`,
                      display: "grid", placeItems: "center", color: "white", fontWeight: 800, fontSize: 14,
                    }}>{(p.name || "?").charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{p.course}</div>
                    </div>
                    {onKick && (
                      <button
                        onClick={() => onKick(p.id)}
                        title="Sacar de la sala"
                        style={{
                          border: "none", background: "transparent", cursor: "pointer",
                          color: "var(--ink-400)", fontSize: 16, lineHeight: 1, padding: 2,
                        }}
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--ink-200)" }}>
              <button
                onClick={onStart}
                disabled={participants.length === 0}
                className="qs-btn qs-btn--success qs-btn--lg"
                style={{ width: "100%", fontSize: 16 }}
              >
                {participants.length === 0
                  ? "Esperando estudiantes..."
                  : `🚀 Iniciar ${quiz.mode === "survey" ? "encuesta" : "quiz"} con ${participants.length} ${participants.length === 1 ? "estudiante" : "estudiantes"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LIVE ANSWERS PANEL — distribución de respuestas en tiempo real.
// Las respuestas YA llegan en vivo por la suscripción existente;
// este componente solo las pinta (cero costo extra de Firestore).
// ============================================================
function LiveAnswersPanel({ currentQ, answersThisQ, session }) {
  const entries = Object.values(answersThisQ || {});
  const type = currentQ.type;
  const isBars  = type === "multi" || type === "truefalse" || type === "checks" || type === "poll";
  const isScale = type === "scale";
  const isText  = type === "text" || type === "wordcloud";
  if (!isBars && !isScale && !isText) return null;

  // ----- Barras verticales -----
  if (isBars || isScale) {
    let labels, colors, counts;
    if (isScale) {
      const lbls = currentQ.scaleLabels || SCALE_LABELS;
      colors = lbls.map((_, i, arr) => {
        const ratio = arr.length > 1 ? i / (arr.length - 1) : 0.5;
        return `hsl(${Math.round(ratio * 130)}, 65%, 48%)`;
      });
      counts = lbls.map(() => 0);
      entries.forEach(e => {
        const idx = Number(e.answer);
        if (!isNaN(idx) && idx >= 0 && idx < counts.length) counts[idx]++;
      });
      labels = lbls.map((_, i) => String(i + 1)); // solo el número; la leyenda completa está arriba
    } else {
      const opts = currentQ.options || [];
      labels = opts.map((o, i) => o.text || String.fromCharCode(65 + i));
      colors = opts.map((_, i) => tileColor(i));
      const byId = {};
      entries.forEach(e => {
        const a = e.answer;
        if (Array.isArray(a)) a.forEach(id => { byId[id] = (byId[id] || 0) + 1; });
        else if (typeof a === "string") byId[a] = (byId[a] || 0) + 1;
      });
      counts = opts.map(o => byId[o.id] || 0);
    }
    const max = Math.max(1, ...counts);
    return (
      <div style={{ marginTop: 14, padding: "14px 8px 10px", background: "var(--ink-50)", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-around", height: 140, gap: 8 }}>
          {counts.map((n, i) => (
            <div key={i} style={{
              flex: 1, height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "flex-end", minWidth: 0,
            }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "var(--ink-700)", marginBottom: 4 }}>{n}</div>
              <div style={{
                width: "68%", maxWidth: 54,
                height: Math.max(3, (n / max) * 100) + "%",
                background: colors[i], borderRadius: "8px 8px 0 0",
                transition: "height .45s ease",
              }}/>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", gap: 8, marginTop: 6 }}>
          {labels.map((lbl, i) => (
            <div key={i} style={{
              flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--ink-500)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
            }}>
              {isScale ? lbl : `${tileShape(i)} ${lbl}`}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ----- Respuestas abiertas: aparecen a medida que llegan -----
  const feed = entries
    .slice()
    .sort((a, b) => (b.answeredAt || 0) - (a.answeredAt || 0))
    .map(e => ({
      pid: e.participantId,
      name: (session.participants && session.participants[e.participantId] && session.participants[e.participantId].name) || "Anónimo",
      text: String(e.answer || ""),
    }));
  return (
    <div style={{ marginTop: 14 }}>
      {feed.length === 0 ? (
        <div style={{ padding: 14, textAlign: "center", color: "var(--ink-400)", fontSize: 13, background: "var(--ink-50)", borderRadius: 12 }}>
          ✍️ Aún no llegan respuestas...
        </div>
      ) : (
        <div style={{ maxHeight: 190, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {feed.map(a => (
            <div key={a.pid} className="qs-fade-in" style={{
              padding: "8px 12px", background: "var(--violet-50)", borderRadius: 10,
              fontSize: 13, color: "var(--ink-900)", border: "1px solid var(--violet-100)",
            }}>
              <span style={{ fontWeight: 800, color: "var(--violet-700)" }}>{a.name}: </span>{a.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// HOST QUESTION — el profe mira la pregunta en curso
// ============================================================
function HostQuestion({ session, quiz, currentQ, answersThisQ, totalParticipants, onSkip, onReveal, onAddTime, onFinish, onTogglePause, onRelaunch, onShowParticipants }) {
  const extraSeconds = session.extraSeconds || 0;
  const totalSeconds = (currentQ.timer || 20) + extraSeconds;
  const startedAt = session.questionStartedAt || Date.now();
  const isPaused = !!session.pausedAt;
  const [secondsLeft, setSecondsLeft] = useStateL(totalSeconds);
  const [showLive, setShowLive] = useStateL(false);

  // El gráfico en vivo se oculta al cambiar de pregunta, para que el
  // docente decida en cada una si lo proyecta (evita sesgar las votaciones
  // sin querer).
  useEffectL(() => { setShowLive(false); }, [session.currentQuestionIdx]);

  useEffectL(() => {
    const tick = () => {
      // Si está en pausa, el tiempo se congela en el instante de la pausa
      const now = isPaused ? session.pausedAt : Date.now();
      const elapsed = (now - startedAt) / 1000;
      const left = Math.max(0, totalSeconds - elapsed);
      // Solo actualizar estado cuando cambia el segundo visible: evita
      // re-renderizar toda la vista 5 veces por segundo.
      setSecondsLeft(prev => (Math.ceil(left) === Math.ceil(prev) ? prev : left));
      if (left <= 0 && !isPaused) {
        onReveal();
      }
    };
    tick();
    if (isPaused) return; // no hace falta intervalo mientras está pausado
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [startedAt, totalSeconds, isPaused, session.pausedAt]);

  const answeredCount = Object.keys(answersThisQ || {}).length;
  const progress = totalParticipants > 0 ? (answeredCount / totalParticipants) * 100 : 0;
  const timeProgress = (secondsLeft / totalSeconds) * 100;

  // Quién respondió (en orden de llegada) y quién falta
  const allParticipants = session.participants || {};
  const answeredList = Object.entries(answersThisQ || {})
    .map(([pid, a]) => ({
      pid,
      name: allParticipants[pid]?.name || "Estudiante",
      at: a.answeredAt || 0,
    }))
    .sort((a, b) => a.at - b.at);
  const answeredIds = new Set(answeredList.map(a => a.pid));
  const pendingList = Object.entries(allParticipants)
    .filter(([pid]) => !answeredIds.has(pid))
    .map(([pid, p]) => ({ pid, name: p?.name || "Estudiante" }));

  return (
    <div style={{
      minHeight: "100vh",
      background: quizBg(quiz?.color),
      padding: 24, color: "white",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ opacity: 0.7, fontSize: 13 }}>Pregunta {session.currentQuestionIdx + 1} de {quiz.questions.length}</p>
            <h2 style={{ fontSize: 24, marginTop: 4 }}>{quiz.title}</h2>
          </div>
          <div style={{
            background: "white", color: "var(--violet-700)", padding: "12px 20px",
            borderRadius: 16, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 32,
            minWidth: 80, textAlign: "center", boxShadow: "0 4px 0 var(--violet-900)",
          }}>
            {Math.ceil(secondsLeft)}<span style={{ fontSize: 14, opacity: 0.6 }}>s</span>
          </div>
        </div>

        {/* Barra de tiempo */}
        <div style={{
          height: 8, background: "rgba(255,255,255,0.2)", borderRadius: 4, overflow: "hidden", marginBottom: 28,
        }}>
          <div style={{
            height: "100%", width: timeProgress + "%",
            background: secondsLeft < 5 ? "var(--red-500)" : "linear-gradient(90deg, var(--emerald-400), var(--amber-400))",
            transition: "width 1s linear",
          }} />
        </div>

        {isPaused && (
          <div style={{
            background: "var(--amber-400)", color: "#7c2d12", fontWeight: 800,
            padding: "10px 16px", borderRadius: 12, marginBottom: 16, textAlign: "center",
            fontFamily: "var(--font-display)",
          }}>
            ⏸️ Pregunta en pausa — el tiempo está congelado para los estudiantes
          </div>
        )}

        {/* Pregunta */}
        <div className="qs-card" style={{ padding: 32, marginBottom: 20, color: "var(--ink-900)" }}>
          <h1 style={{ fontSize: 32, textAlign: "center", marginBottom: (currentQ.image || currentQ.video) ? 16 : 24, lineHeight: 1.3 }}>
            {currentQ.text}
          </h1>
          {currentQ.image && (
            <div style={{ textAlign: "center", marginBottom: currentQ.video ? 12 : 24 }}>
              <img src={currentQ.image} alt=""
                style={{ maxWidth: "100%", maxHeight: 340, borderRadius: 12, border: "1px solid var(--ink-200)" }}/>
            </div>
          )}
          {currentQ.video && youtubeId(currentQ.video) && (
            <div style={{ maxWidth: 640, margin: "0 auto 24px", position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden" }}>
              <iframe src={`https://www.youtube.com/embed/${youtubeId(currentQ.video)}`} title="Video"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                allowFullScreen/>
            </div>
          )}
          {currentQ.type === "wordcloud" ? (
            <div style={{ textAlign: "center", padding: 20, background: "var(--violet-50)", borderRadius: 14, color: "var(--violet-700)" }}>
              <div style={{ fontSize: 36, marginBottom: 6 }}>💭</div>
              <div style={{ fontWeight: 700 }}>Respuesta libre — los estudiantes escriben una palabra</div>
            </div>
          ) : currentQ.type === "scale" ? (
            <div style={{ display: "grid", gap: 8 }}>
              {(currentQ.scaleLabels || SCALE_LABELS).map((lbl, i, arr) => {
                const ratio = arr.length > 1 ? i / (arr.length - 1) : 0.5;
                const bg = `hsl(${Math.round(ratio * 130)}, 65%, 48%)`;
                return (
                  <div key={i} style={{
                    padding: "14px 18px", borderRadius: 12, background: bg, color: "white",
                    fontWeight: 700, display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                    {lbl}
                  </div>
                );
              })}
            </div>
          ) : currentQ.type === "order" ? (
            <div>
              <div style={{ textAlign: "center", padding: "8px 12px", marginBottom: 10, background: "var(--violet-50)", borderRadius: 10, color: "var(--violet-700)", fontWeight: 700, fontSize: 14 }}>
                🔢 Los estudiantes están ordenando estos elementos:
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {(currentQ.items || []).map((it, i) => (
                  <div key={it.id} style={{
                    padding: "12px 16px", borderRadius: 12, background: "var(--ink-50)",
                    color: "var(--ink-900)", fontWeight: 600, display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--violet-600)", color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                    {it.text}
                  </div>
                ))}
              </div>
            </div>
          ) : currentQ.type === "text" ? (
            <div style={{ textAlign: "center", padding: 20, background: "var(--ink-50)", borderRadius: 14, color: "var(--ink-500)" }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>✍️</div>
              <div style={{ fontWeight: 700 }}>Respuesta abierta — los estudiantes están escribiendo</div>
            </div>
          ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: (currentQ.options || []).length > 2 ? "1fr 1fr" : "1fr 1fr",
            gap: 12,
          }}>
            {(currentQ.options || []).map((opt, i) => {
              const colors = ["var(--tile-1)", "var(--tile-2)", "var(--tile-3)", "var(--tile-4)"];
              return (
                <div key={opt.id} style={{
                  padding: 20, borderRadius: 14, background: colors[i % 4],
                  color: "white", fontSize: 18, fontWeight: 700, textAlign: "center",
                  boxShadow: "var(--shadow-tile)",
                }}>{opt.text}</div>
              );
            })}
          </div>
          )}
        </div>

        {/* Estado */}
        <div className="qs-live-panel" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <div className="qs-card" style={{ padding: 20, color: "var(--ink-900)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 700 }}>Respuestas recibidas</span>
              <span style={{ color: "var(--violet-700)", fontWeight: 700 }}>
                {answeredCount} / {totalParticipants}
              </span>
            </div>
            <div style={{ height: 12, background: "var(--ink-100)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: progress + "%",
                background: "linear-gradient(90deg, var(--violet-500), var(--pink-500))",
                transition: "width 0.3s ease",
              }} />
            </div>

            {/* Distribución en tiempo real (opcional, lo activa el docente) */}
            {(currentQ.type !== "order" && currentQ.type !== "slide") && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => setShowLive(v => !v)}
                  className="qs-btn qs-btn--sm"
                  style={{
                    width: "100%", justifyContent: "space-between",
                    background: showLive ? "var(--violet-600)" : "var(--violet-50)",
                    color: showLive ? "#fff" : "var(--violet-700)",
                    border: "1px solid " + (showLive ? "var(--violet-600)" : "var(--violet-200)"),
                  }}>
                  <span>📊 Respuestas en vivo</span>
                  <span>{showLive ? "Ocultar ▲" : "Ver ▼"}</span>
                </button>
                {showLive && (
                  <>
                    <div style={{ fontSize: 11, color: "var(--amber-500)", fontWeight: 700, marginTop: 6, textAlign: "center" }}>
                      ⚠️ Visible en la proyección: los estudiantes verán la tendencia
                    </div>
                    <LiveAnswersPanel currentQ={currentQ} answersThisQ={answersThisQ} session={session} />
                  </>
                )}
              </div>
            )}

            {/* Quién respondió (en orden) y quién falta */}
            <div style={{ marginTop: 14, maxHeight: 180, overflowY: "auto" }}>
              {answeredList.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--emerald-600)", letterSpacing: ".04em", marginBottom: 6 }}>
                    ✓ YA RESPONDIERON ({answeredList.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {answeredList.map((p, i) => (
                      <span key={p.pid} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                        background: "rgba(0, 224, 140, 0.16)", color: "#3dffab",
                      }}>
                        <span style={{
                          width: 18, height: 18, borderRadius: "50%", background: "#00a869", color: "white",
                          display: "grid", placeItems: "center", fontSize: 10, fontWeight: 800,
                        }}>{i + 1}</span>
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {pendingList.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-400)", letterSpacing: ".04em", marginBottom: 6 }}>
                    ⏳ FALTAN ({pendingList.length})
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {pendingList.map(p => (
                      <span key={p.pid} style={{
                        padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                        background: "var(--ink-100)", color: "var(--ink-500)",
                      }}>{p.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <button onClick={onReveal} className="qs-btn qs-btn--lg" style={{
              background: "white", color: "var(--violet-700)", fontWeight: 800,
            }}>
              ⏭️ Mostrar respuesta
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={onAddTime} className="qs-btn" style={{
                background: "rgba(255,255,255,0.18)", color: "white", fontWeight: 700,
                boxShadow: "0 0 0 2px rgba(255,255,255,.4) inset",
              }}>
                ⏱️ +30s
              </button>
              <button onClick={onTogglePause} className="qs-btn" style={{
                background: isPaused ? "var(--emerald-500)" : "var(--amber-500)",
                color: "white", fontWeight: 700,
                boxShadow: isPaused ? "0 4px 0 var(--emerald-600)" : "0 4px 0 #b45309",
              }}>
                {isPaused ? "▶️ Reanudar" : "⏸️ Pausar"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button onClick={onRelaunch} className="qs-btn" style={{
                background: "rgba(255,255,255,0.18)", color: "white", fontWeight: 700,
                boxShadow: "0 0 0 2px rgba(255,255,255,.4) inset",
              }}>
                🔄 Re-lanzar
              </button>
              <button onClick={onFinish} className="qs-btn" style={{
                background: "var(--red-500)", color: "white", fontWeight: 700,
                boxShadow: "0 4px 0 #991b1b",
              }}>
                🏁 Finalizar
              </button>
            </div>
            <button onClick={onShowParticipants} className="qs-btn qs-btn--sm" style={{
              background: "transparent", color: "white", fontWeight: 600,
              border: "1px solid rgba(255,255,255,0.4)",
            }}>
              👥 Participantes ({totalParticipants})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HOST SLIDE — diapositiva del docente: explicar sin calificar
// ============================================================
function HostSlide({ session, quiz, currentQ, onNext, onFinish }) {
  const isLast = session.currentQuestionIdx >= quiz.questions.length - 1;
  return (
    <div style={{
      minHeight: "100vh",
      background: quizBg(quiz?.color),
      padding: 24, color: "white",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>
            Diapositiva · {session.currentQuestionIdx + 1} de {quiz.questions.length}
          </span>
          <button onClick={onFinish} style={{
            background: "rgba(255,0,0,0.4)", color: "white", border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 10, padding: "6px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>🏁 Finalizar</button>
        </div>

        <div className="qs-card" style={{ padding: 32, color: "var(--ink-900)", marginBottom: 20 }}>
          {currentQ.slideTitle && (
            <h1 style={{ fontSize: 30, marginBottom: 16, fontFamily: "var(--font-display)" }}>
              {currentQ.slideTitle}
            </h1>
          )}
          {currentQ.image && (
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <img src={currentQ.image} alt=""
                style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 12 }}/>
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
              {currentQ.slideBody}
            </div>
          )}
          {!currentQ.slideTitle && !currentQ.slideBody && !currentQ.image && !currentQ.video && (
            <p style={{ color: "var(--ink-400)", fontStyle: "italic", textAlign: "center" }}>
              Esta diapositiva está vacía.
            </p>
          )}
        </div>

        <button onClick={onNext} className="qs-btn qs-btn--lg" style={{
          width: "100%", background: "white", color: "var(--violet-700)", fontWeight: 800, fontSize: 16,
        }}>
          {isLast ? "🏁 Finalizar" : "➡️ Siguiente"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// HOST REVEAL — muestra la gráfica y la respuesta correcta
// ============================================================
function HostReveal({ session, quiz, currentQ, answersThisQ, onNext, onGradeLive }) {
  const totalAnswers = Object.keys(answersThisQ || {}).length;
  const isSurvey = quiz.mode === "survey";
  const isLast = session.currentQuestionIdx >= quiz.questions.length - 1;
  const colors = ["var(--tile-1)", "var(--tile-2)", "var(--tile-3)", "var(--tile-4)"];

  // ---- Nube de palabras ----
  const buildWordCloud = () => {
    const freq = {};
    Object.values(answersThisQ || {}).forEach(a => {
      const raw = (a.answer == null ? "" : String(a.answer)).trim().toLowerCase();
      if (!raw) return;
      freq[raw] = (freq[raw] || 0) + 1;
    });
    return Object.entries(freq)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40);
  };

  // ---- Conteo para escala ----
  const buildScale = () => {
    const labels = currentQ.scaleLabels || SCALE_LABELS;
    const counts = labels.map(() => 0);
    Object.values(answersThisQ || {}).forEach(a => {
      const idx = typeof a.answer === "number" ? a.answer : parseInt(a.answer, 10);
      if (!isNaN(idx) && idx >= 0 && idx < counts.length) counts[idx]++;
    });
    return { labels, counts };
  };

  // ---- Conteo por opción (poll / multi / truefalse / checks) ----
  const optionCounts = {};
  (currentQ.options || []).forEach(o => { optionCounts[o.id] = 0; });
  Object.values(answersThisQ || {}).forEach(a => {
    if (Array.isArray(a.answer)) {
      a.answer.forEach(id => { if (optionCounts.hasOwnProperty(id)) optionCounts[id]++; });
    } else if (optionCounts.hasOwnProperty(a.answer)) {
      optionCounts[a.answer]++;
    }
  });
  const maxCount = Math.max(1, ...Object.values(optionCounts));

  const nextButton = (
    <button onClick={onNext} className="qs-btn qs-btn--lg" style={{
      width: "100%", background: "white", color: "var(--violet-700)", fontWeight: 800, fontSize: 16,
    }}>
      {isLast ? (isSurvey ? "🏁 Finalizar encuesta" : "🏁 Ver ranking final") : "➡️ Siguiente pregunta"}
    </button>
  );

  const shell = (inner) => (
    <div style={{
      minHeight: "100vh",
      background: quizBg(quiz?.color),
      padding: 24, color: "white",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ opacity: 0.7, fontSize: 13 }}>
            {isSurvey ? "Encuesta" : "Resultados"} — Pregunta {session.currentQuestionIdx + 1}
          </p>
          <h2 style={{ fontSize: 26, marginTop: 4 }}>{currentQ.text}</h2>
          {currentQ.image && (
            <div style={{ marginTop: 12 }}>
              <img src={currentQ.image} alt=""
                style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 10 }}/>
            </div>
          )}
          {currentQ.video && youtubeId(currentQ.video) && (
            <div style={{ marginTop: 12, maxWidth: 480, position: "relative", paddingBottom: "27%", height: 0, borderRadius: 10, overflow: "hidden" }}>
              <iframe src={`https://www.youtube.com/embed/${youtubeId(currentQ.video)}`} title="Video"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                allowFullScreen/>
            </div>
          )}
        </div>
        {inner}
        {currentQ.feedback && currentQ.feedback.trim() && (
          <div style={{
            marginTop: 4, marginBottom: 16, padding: 14, borderRadius: 12,
            background: "rgba(255,255,255,0.92)", color: "var(--ink-900)",
            borderLeft: "4px solid var(--violet-500)", textAlign: "left",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--violet-700)", marginBottom: 4 }}>💬 Retroalimentación</div>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{currentQ.feedback}</div>
          </div>
        )}
        <div style={{ marginTop: 4, marginBottom: 20, padding: 12, background: "rgba(255,255,255,0.15)", borderRadius: 10, textAlign: "center", fontSize: 13 }}>
          <b>{totalAnswers}</b> respuestas totales
        </div>
        {nextButton}
      </div>
    </div>
  );

  // ===== Nube de palabras =====
  if (currentQ.type === "wordcloud") {
    const words = buildWordCloud();
    const maxFreq = Math.max(1, ...words.map(w => w.count));
    return shell(
      <div className="qs-card" style={{ padding: 28, marginBottom: 20, color: "var(--ink-900)", minHeight: 200 }}>
        {words.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--ink-500)" }}>Aún no hay respuestas.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", justifyContent: "center", alignItems: "center" }}>
            {words.map((w, i) => {
              const size = 14 + (w.count / maxFreq) * 38; // 14px..52px
              return (
                <span key={w.word} style={{
                  fontSize: size, fontWeight: 800, fontFamily: "var(--font-display)",
                  color: colors[i % 4], lineHeight: 1.1,
                }}>
                  {w.word}{w.count > 1 ? <span style={{ fontSize: 12, color: "var(--ink-400)", fontWeight: 600 }}> ×{w.count}</span> : null}
                </span>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ===== Escala de acuerdo =====
  if (currentQ.type === "scale") {
    const { labels, counts } = buildScale();
    const maxScale = Math.max(1, ...counts);
    return shell(
      <div className="qs-card" style={{ padding: 28, marginBottom: 20, color: "var(--ink-900)" }}>
        <div style={{ display: "grid", gap: 12 }}>
          {labels.map((lbl, i) => {
            const ratio = labels.length > 1 ? i / (labels.length - 1) : 0.5;
            const bg = `hsl(${Math.round(ratio * 130)}, 65%, 48%)`;
            const widthPct = (counts[i] / maxScale) * 100;
            return (
              <div key={i} className="qs-fade-in" style={{
                position: "relative", display: "flex", alignItems: "center",
                padding: 16, borderRadius: 12, background: bg, color: "white", overflow: "hidden",
                opacity: counts[i] > 0 ? 1 : 0.55,
              }}>
                <div style={{ position: "absolute", inset: 0, width: widthPct + "%", background: "rgba(255,255,255,0.18)", transition: "width 0.6s ease" }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,255,255,0.25)", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                    {lbl}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{counts[i]}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ===== Ordenar: mostrar el orden correcto y cuántos acertaron =====
  if (currentQ.type === "order") {
    const correctCount = Object.values(answersThisQ || {}).filter(a => a.correct).length;
    const total = Object.keys(answersThisQ || {}).length;
    return shell(
      <div className="qs-card" style={{ padding: 24, marginBottom: 20, color: "var(--ink-900)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--emerald-600)", marginBottom: 10, textAlign: "center" }}>
          ✓ Orden correcto
        </div>
        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          {(currentQ.items || []).map((it, i) => (
            <div key={it.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              borderRadius: 10, background: "var(--emerald-50, #d1fae5)",
              borderLeft: "4px solid var(--emerald-500)",
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: "50%", background: "var(--emerald-500)",
                color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
              }}>{i + 1}</span>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{it.text}</span>
            </div>
          ))}
        </div>
        {total > 0 && (
          <div style={{ padding: 10, background: "var(--violet-50)", borderRadius: 10, textAlign: "center", fontSize: 14, color: "var(--violet-700)", fontWeight: 700 }}>
            {correctCount} de {total} {correctCount === 1 ? "estudiante acertó" : "estudiantes acertaron"} el orden completo
          </div>
        )}
      </div>
    );
  }

  // ===== Respuesta abierta (text) =====
  if (currentQ.type === "text") {
    const liveGrading = !isSurvey && (currentQ.gradeMode || "live") === "live";
    // Lista de respuestas con datos del participante
    const entries = Object.entries(answersThisQ || {}).map(([pid, a]) => ({
      pid,
      text: (a.answer == null ? "" : String(a.answer)).trim(),
      graded: a.graded || false,
      gradeResult: a.gradeResult || null, // "correct" | "partial" | "wrong"
      name: session.participants?.[pid]?.name || "Estudiante",
    })).filter(e => e.text);

    if (liveGrading) {
      const pending = entries.filter(e => !e.graded).length;
      return shell(
        <div className="qs-card" style={{ padding: 24, marginBottom: 20, color: "var(--ink-900)", maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--violet-700)", marginBottom: 12 }}>
            ✍️ Califica cada respuesta — faltan {pending} por calificar
          </div>
          {entries.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--ink-500)" }}>Aún no hay respuestas.</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {entries.map(e => (
                <div key={e.pid} style={{
                  padding: 12, borderRadius: 10, background: "var(--ink-50)",
                  border: e.graded ? "1px solid var(--emerald-400)" : "1px solid var(--ink-200)",
                }}>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 2 }}>{e.name}</div>
                  <div style={{ fontSize: 15, marginBottom: 8 }}>{e.text}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {[
                      { id: "correct", label: "✓ Correcto", bg: "var(--emerald-500)" },
                      { id: "partial", label: "± Parcial", bg: "var(--amber-500)" },
                      { id: "wrong",   label: "✗ Incorrecto", bg: "var(--red-500)" },
                    ].map(btn => (
                      <button key={btn.id}
                        onClick={() => onGradeLive(e.pid, btn.id)}
                        style={{
                          padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                          fontWeight: 700, fontSize: 13, color: "white",
                          background: btn.bg,
                          opacity: e.graded && e.gradeResult !== btn.id ? 0.4 : 1,
                          outline: e.graded && e.gradeResult === btn.id ? "3px solid var(--ink-900)" : "none",
                        }}>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={onNext} disabled={pending > 0 && entries.length > 0}
            className="qs-btn qs-btn--lg" style={{
              width: "100%", marginTop: 16,
              background: (pending > 0 && entries.length > 0) ? "var(--ink-200)" : "white",
              color: (pending > 0 && entries.length > 0) ? "var(--ink-400)" : "var(--violet-700)",
              fontWeight: 800,
            }}>
            {pending > 0 && entries.length > 0
              ? `Califica a todos para continuar (${pending} restantes)`
              : (isLast ? "🏁 Ver ranking final" : "➡️ Siguiente pregunta")}
          </button>
        </div>
      );
    }

    // gradeMode "end": solo mostrar respuestas
    return shell(
      <div className="qs-card" style={{ padding: 28, marginBottom: 20, color: "var(--ink-900)", maxHeight: "55vh", overflowY: "auto" }}>
        {entries.length === 0 ? (
          <p style={{ textAlign: "center", color: "var(--ink-500)" }}>Aún no hay respuestas.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {entries.map((e, i) => (
              <div key={i} style={{
                padding: "10px 14px", borderRadius: 10, background: "var(--ink-50)",
                fontSize: 15,
              }}>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{e.name}</div>
                {e.text}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===== Opciones (poll / multi / truefalse / checks) =====
  return shell(
    <div className="qs-card" style={{ padding: 28, marginBottom: 20, color: "var(--ink-900)" }}>
      <div style={{ display: "grid", gap: 12 }}>
        {(currentQ.options || []).map((opt, i) => {
          const count = optionCounts[opt.id] || 0;
          const widthPct = (count / maxCount) * 100;
          // En encuesta no hay opción correcta
          const highlightCorrect = !isSurvey && opt.correct;
          return (
            <div key={opt.id} className="qs-fade-in" style={{
              position: "relative", display: "flex", alignItems: "center",
              padding: 16, borderRadius: 12, background: highlightCorrect ? "var(--emerald-500)" : colors[i % 4],
              color: "white", overflow: "hidden",
              opacity: highlightCorrect || count > 0 ? 1 : 0.5,
            }}>
              <div style={{ position: "absolute", inset: 0, width: widthPct + "%", background: "rgba(255,255,255,0.15)", transition: "width 0.6s ease" }} />
              <div style={{ position: "relative", display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 10 }}>
                  {highlightCorrect && <span style={{ fontSize: 22 }}>✓</span>}
                  {opt.text}
                </div>
                <div style={{ fontWeight: 800, fontSize: 20 }}>{count}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// HOST FINAL — ranking final
// ============================================================
function HostFinal({ session, quiz, onFinish }) {
  const isSurvey = quiz.mode === "survey";
  const participants = Object.values(session.participants || {})
    .map(p => ({ ...p, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score);
  const top3 = participants.slice(0, 3);
  const rest = participants.slice(3);

  // ===== Cierre de ENCUESTA (sin ranking ni puntajes) =====
  if (isSurvey) {
    return (
      <div style={{
        minHeight: "100vh",
        background: quizBg(quiz?.color),
        padding: 24, color: "white",
      }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 56, marginBottom: 8 }}>📊</div>
            <h1 style={{ fontSize: 32, marginBottom: 8 }}>¡Encuesta terminada!</h1>
            <p style={{ opacity: 0.85 }}>{quiz.title}</p>
          </div>
          <div className="qs-card" style={{ padding: 20, color: "var(--ink-900)", marginBottom: 24, textAlign: "center" }}>
            <p style={{ fontSize: 15 }}>
              Participaron <b>{participants.length}</b> {participants.length === 1 ? "persona" : "personas"}.
            </p>
            <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6 }}>
              Los resultados de cada pregunta se mostraron durante la sesión. Gracias por participar.
            </p>
          </div>
          {participants.length > 0 && (
            <div className="qs-card" style={{ padding: 16, color: "var(--ink-900)", marginBottom: 24 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {participants.map(p => (
                  <span key={p.id} className="qs-chip">{p.name}</span>
                ))}
              </div>
            </div>
          )}
          <button onClick={onFinish} className="qs-btn qs-btn--lg" style={{
            width: "100%", background: "white", color: "var(--violet-700)", fontWeight: 800,
          }}>
            ✓ Finalizar y volver al dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: quizBg(quiz?.color),
      padding: 24, color: "white",
    }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>🏆</div>
          <h1 style={{ fontSize: 32, marginBottom: 8 }}>¡Quiz terminado!</h1>
          <p style={{ opacity: 0.85 }}>{quiz.title}</p>
        </div>

        {/* Podio */}
        {top3.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12, marginBottom: 24, alignItems: "end",
          }}>
            {[1, 0, 2].map(idx => {
              const p = top3[idx];
              if (!p) return <div key={idx} />;
              const heights = { 0: 180, 1: 140, 2: 120 };
              const medals = { 0: "🥇", 1: "🥈", 2: "🥉" };
              const bg = { 0: "var(--amber-400)", 1: "var(--ink-300)", 2: "#cd7f32" };
              return (
                <div key={idx} style={{ textAlign: "center" }} className="qs-pop-in">
                  <div style={{ fontSize: 32, marginBottom: 4 }}>{medals[idx]}</div>
                  <div className="qs-card" style={{
                    padding: 16, color: "var(--ink-900)",
                    height: heights[idx], display: "flex", flexDirection: "column", justifyContent: "center",
                    background: bg[idx],
                  }}>
                    <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{p.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{p.course}</div>
                    <div style={{ fontSize: 24, fontFamily: "var(--font-display)", fontWeight: 800 }}>
                      {p.score} pts
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Resto */}
        {rest.length > 0 && (
          <div className="qs-card" style={{ padding: 16, color: "var(--ink-900)", marginBottom: 24 }}>
            {rest.map((p, i) => (
              <div key={p.id} style={{
                display: "flex", alignItems: "center", gap: 12, padding: 10,
                borderBottom: i < rest.length - 1 ? "1px solid var(--ink-100)" : "none",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", background: "var(--violet-100)",
                  color: "var(--violet-700)", display: "grid", placeItems: "center", fontWeight: 700,
                }}>{i + 4}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{p.course}</div>
                </div>
                <div style={{ fontWeight: 700, color: "var(--violet-700)" }}>{p.score} pts</div>
              </div>
            ))}
          </div>
        )}

        <button onClick={onFinish} className="qs-btn qs-btn--lg" style={{
          width: "100%", background: "white", color: "var(--violet-700)", fontWeight: 800,
        }}>
          ✓ Finalizar y volver al dashboard
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PARTICIPANTS MODAL — lista con opción de expulsar
// ============================================================
function ParticipantsModal({ participants, onKick, onClose }) {
  const list = Object.entries(participants)
    .map(([pid, p]) => ({ pid, ...p }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
      display: "grid", placeItems: "center", padding: 20, zIndex: 50,
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{
        padding: 24, maxWidth: 460, width: "100%", maxHeight: "80vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 20 }}>Participantes ({list.length})</h3>
          <button onClick={onClose} className="qs-btn qs-btn--ghost qs-btn--sm">Cerrar</button>
        </div>
        {list.length === 0 ? (
          <p style={{ color: "var(--ink-500)", textAlign: "center", padding: 20 }}>
            Aún no hay participantes.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {list.map(p => (
              <div key={p.pid} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 14px", background: "var(--ink-50)", borderRadius: 10,
              }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                    {p.course} · {p.score || 0} pts
                  </div>
                </div>
                <button onClick={() => onKick(p.pid)} className="qs-btn qs-btn--sm" style={{
                  background: "var(--red-500)", color: "white",
                }}>
                  Sacar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// LIVE SESSION HOST — orquestador del lado del profesor
// ============================================================
function LiveSessionHost({ quizId, onExit }) {
  const [loading, setLoading] = useStateL(true);
  const [session, setSession] = useStateL(null);
  const [quiz, setQuiz] = useStateL(null);
  const [answersByQuestion, setAnswersByQuestion] = useStateL({});
  const [showParticipants, setShowParticipants] = useStateL(false);
    // El id de sesión como ESTADO (no solo ref): garantiza que la suscripción
  // a Firestore se active apenas exista la sesión.
  const [sessionId, setSessionId] = useStateL(null);
  const sessionIdRef = useRefL(null);

  // Crear sesión al montar
  useEffectL(() => {
    let cancelled = false;
    const createSession = async () => {
      try {
        const uid = window.QS.currentUser?.uid;
        const quizDoc = await window.QS.db.collection("quizzes").doc(quizId).get();
        if (!quizDoc.exists) throw new Error("Quiz no encontrado");
        const quizData = { id: quizDoc.id, ...quizDoc.data() };
        if (cancelled) return;
        setQuiz(quizData);

        const code = generateRoomCode();
        const sessionData = {
          code,
          quizId: quizData.id,
          quizTitle: quizData.title || "Quiz",
          ownerId: uid,
          status: "lobby",
          currentQuestionIdx: -1,
          createdAt: Date.now(),
          participants: {},
        };
        const docRef = await window.QS.db.collection("liveSessions").add(sessionData);
        sessionIdRef.current = docRef.id;
        if (cancelled) return;
        setSessionId(docRef.id);
        setSession({ id: docRef.id, ...sessionData });
        setLoading(false);
      } catch (err) {
        console.error("Error creando sesión:", err);
        alert("Error creando sesión: " + err.message);
        onExit();
      }
    };
    createSession();
    return () => { cancelled = true; };
  }, [quizId]);

  // Suscripción a cambios en la sesión (participantes que entran, etc.)
  useEffectL(() => {
    if (!sessionId) return;
    const unsub = window.QS.db.collection("liveSessions").doc(sessionId)
      .onSnapshot(doc => {
        if (doc.exists) {
          setSession(s => ({ ...s, id: doc.id, ...doc.data() }));
        }
      }, err => console.error("Snapshot error:", err));
    return () => unsub();
  }, [sessionId]);

  // Suscripción a respuestas de la pregunta actual
  useEffectL(() => {
    if (!sessionIdRef.current || !session || session.currentQuestionIdx < 0) return;
    const qIdx = session.currentQuestionIdx;
    const unsub = window.QS.db.collection("liveSessions").doc(sessionIdRef.current)
      .collection("answers").where("questionIdx", "==", qIdx)
      .onSnapshot(snap => {
        const ans = {};
        snap.docs.forEach(d => { ans[d.data().participantId] = d.data(); });
        setAnswersByQuestion(prev => ({ ...prev, [qIdx]: ans }));
      });
    return () => unsub();
  }, [sessionId, session?.currentQuestionIdx]);

  // ---- Acciones ----
  const startQuiz = async () => {
    await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
      status: "playing",
      currentQuestionIdx: 0,
      questionStartedAt: Date.now(),
      startedAt: Date.now(),
      extraSeconds: 0,
      pausedAt: null,
    });
  };

  // Aumentar el tiempo de la pregunta actual (visible para host y estudiantes)
  const addTime = async (seconds = 10) => {
    await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
      extraSeconds: firebase.firestore.FieldValue.increment(seconds),
    });
  };

  // Pausar / reanudar la pregunta actual. Al reanudar, desplazamos
  // questionStartedAt hacia adelante por el tiempo que estuvo pausada,
  // para devolverle al estudiante exactamente los segundos que le quedaban.
  const togglePause = async () => {
    const ref = window.QS.db.collection("liveSessions").doc(sessionIdRef.current);
    if (session.pausedAt) {
      const pausedDuration = Date.now() - session.pausedAt;
      const newStart = (session.questionStartedAt || Date.now()) + pausedDuration;
      await ref.update({ pausedAt: null, questionStartedAt: newStart });
    } else {
      await ref.update({ pausedAt: Date.now() });
    }
  };

  // Re-lanzar la pregunta actual: revierte puntos de quienes ya respondieron,
  // borra sus respuestas y reinicia el cronómetro. Sube questionVersion para
  // que el estudiante resetee su estado de "ya respondí".
  const relaunchQuestion = async () => {
    if (!confirm("¿Re-lanzar esta pregunta? Se borrarán las respuestas actuales y se reiniciará el tiempo.")) return;
    const qIdx = session.currentQuestionIdx;
    const ref = window.QS.db.collection("liveSessions").doc(sessionIdRef.current);
    try {
      // Leer respuestas de esta pregunta
      const snap = await ref.collection("answers").where("questionIdx", "==", qIdx).get();
      // Revertir puntaje y borrar cada respuesta
      const batch = window.QS.db.batch();
      const scoreReverts = {};
      snap.docs.forEach(d => {
        const data = d.data();
        // Solo revertir lo que ya se sumó al marcador (applied). Los pendientes
        // nunca se sumaron, así que no hay nada que revertir de ellos.
        const pts = data.applied ? (data.points || 0) : 0;
        if (pts !== 0) {
          scoreReverts[data.participantId] = (scoreReverts[data.participantId] || 0) - pts;
        }
        batch.delete(d.ref);
      });
      await batch.commit();
      // Aplicar reversión de puntajes
      const updates = {
        questionStartedAt: Date.now(),
        extraSeconds: 0,
        pausedAt: null,
        questionVersion: (session.questionVersion || 0) + 1,
        status: "playing",
      };
      Object.entries(scoreReverts).forEach(([pid, delta]) => {
        updates[`participants.${pid}.score`] = firebase.firestore.FieldValue.increment(delta);
      });
      await ref.update(updates);
    } catch (err) {
      console.error("Error re-lanzando pregunta:", err);
      alert("No se pudo re-lanzar la pregunta: " + err.message);
    }
  };

  // Expulsar a un participante (conserva su registro en 'results' al final,
  // pero lo saca del juego activo).
  const kickParticipant = async (pid) => {
    const p = session.participants?.[pid];
    if (!confirm(`¿Sacar a ${p?.name || "este participante"} de la sala?`)) return;
    try {
      await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
        [`participants.${pid}`]: firebase.firestore.FieldValue.delete(),
      });
    } catch (err) {
      console.error("Error expulsando participante:", err);
    }
  };

  // Finalizar el quiz inmediatamente desde cualquier pregunta
  const finishNow = async () => {
    if (!confirm("¿Finalizar el quiz ahora? Se guardarán los resultados con el puntaje actual.")) return;
    const ref = window.QS.db.collection("liveSessions").doc(sessionIdRef.current);
    try {
      // Aplicar cualquier puntaje en espera que aún no se haya sumado
      const snap = await ref.collection("answers").get();
      const increments = {};
      const batch = window.QS.db.batch();
      let has = false;
      snap.docs.forEach(d => {
        const data = d.data();
        const pend = data.pendingPoints || 0;
        if (!data.applied && pend !== 0) {
          increments[`participants.${data.participantId}.score`] =
            firebase.firestore.FieldValue.increment(pend);
          batch.update(d.ref, { applied: true });
          has = true;
        }
      });
      if (has) { await batch.commit(); await ref.update(increments); }
    } catch (err) {
      console.error("Error aplicando pendientes al finalizar:", err);
    }
    try {
      await saveLiveResults();
    } catch (err) {
      console.error("Error guardando resultados:", err);
      alert("⚠️ Los resultados no se pudieron archivar automáticamente: " + err.message + "\\n\\nNo se perdieron: podrás reenviarlos desde Resultados → Sesiones en vivo.");
    }
    await ref.update({
      status: "finished",
      finishedAt: Date.now(),
    });
  };

  const revealCurrent = async () => {
    const qIdx = session.currentQuestionIdx;
    const ref = window.QS.db.collection("liveSessions").doc(sessionIdRef.current);
    try {
      // Aplicar los puntos en espera de esta pregunta al marcador de cada quien
      const snap = await ref.collection("answers").where("questionIdx", "==", qIdx).get();
      const increments = {};
      const batch = window.QS.db.batch();
      let hasIncrements = false;
      snap.docs.forEach(d => {
        const data = d.data();
        const pend = data.pendingPoints || 0;
        if (!data.applied && pend !== 0) {
          increments[`participants.${data.participantId}.score`] =
            firebase.firestore.FieldValue.increment(pend);
          batch.update(d.ref, { applied: true });
          hasIncrements = true;
        }
      });
      if (hasIncrements) {
        await batch.commit();
        await ref.update(increments);
      }
    } catch (err) {
      console.error("Error aplicando puntajes al revelar:", err);
    }
    await ref.update({
      status: "showResults",
      revealedAt: Date.now(),
      pausedAt: null,
    });
  };

  // Calificar en vivo una respuesta abierta de un estudiante.
  // result: "correct" | "partial" | "wrong". Asigna puntos y los suma al participante.
  const gradeLiveAnswer = async (pid, result) => {
    const qIdx = session.currentQuestionIdx;
    const q = quiz.questions[qIdx];
    const pCorrect = q.pointsCorrect ?? 100;
    const pWrong = q.pointsWrong ?? 0;
    const points = result === "correct" ? pCorrect
      : result === "partial" ? Math.round(pCorrect / 2)
      : pWrong;

    const docId = `${pid}-${qIdx}`;
    const answerRef = window.QS.db.collection("liveSessions").doc(sessionIdRef.current)
      .collection("answers").doc(docId);
    try {
      const snap = await answerRef.get();
      if (!snap.exists) return;
      const prev = snap.data();
      const prevPoints = prev.graded ? (prev.points || 0) : 0; // si re-califica, ajustar diferencia
      // Actualizar la respuesta
      await answerRef.update({
        graded: true,
        gradeResult: result,
        correct: result === "correct",
        points,
      });
      // Ajustar el puntaje del participante por la diferencia
      const delta = points - prevPoints;
      if (delta !== 0) {
        await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
          [`participants.${pid}.score`]: firebase.firestore.FieldValue.increment(delta),
        });
      }
    } catch (err) {
      console.error("Error calificando en vivo:", err);
    }
  };

  const goNext = async () => {
    const nextIdx = session.currentQuestionIdx + 1;
    if (nextIdx >= quiz.questions.length) {
      // Terminar: primero guardar resultados de cada participante
      try {
        await saveLiveResults();
      } catch (err) {
        console.error("Error guardando resultados:", err);
        alert("⚠️ Los resultados no se pudieron archivar automáticamente: " + err.message + "\\n\\nNo se perdieron: podrás reenviarlos desde Resultados → Sesiones en vivo.");
      }
      await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
        status: "finished",
        finishedAt: Date.now(),
      });
    } else {
      await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
        status: "playing",
        currentQuestionIdx: nextIdx,
        questionStartedAt: Date.now(),
        extraSeconds: 0,
        pausedAt: null,
      });
    }
  };

  // Guardar resultados de la sala en vivo en la colección 'results' (para panel y Excel)
  const saveLiveResults = async () => {
    const uid = window.QS.currentUser?.uid;
    if (!uid || !session || !quiz) return;
    // En modo encuesta no se guardan resultados calificados.
    if (quiz.mode === "survey") return;
    const participants = Object.values(session.participants || {});
    if (participants.length === 0) return;

    const maxPoints = calculateMaxPoints(quiz);
    const today = new Date().toISOString().slice(0, 10);

    // Cargar todas las respuestas de esta sesión de una vez
    const answersSnap = await window.QS.db.collection("liveSessions")
      .doc(sessionIdRef.current).collection("answers").get();
    const answersByParticipant = {};
    answersSnap.docs.forEach(d => {
      const data = d.data();
      if (!answersByParticipant[data.participantId]) answersByParticipant[data.participantId] = [];
      answersByParticipant[data.participantId].push(data);
    });

    // Por cada participante crear un documento en results
    const batch = window.QS.db.batch();
    for (const p of participants) {
      const myAnswers = answersByParticipant[p.id] || [];
      const correctCount = myAnswers.filter(a => a.correct).length;
      // Calcular el puntaje sumando los puntos de cada respuesta (fuente de verdad),
      // para no depender del p.score que puede venir desactualizado del estado.
      const score = myAnswers.reduce((s, a) => s + (a.points || 0), 0);
      const grade = convertToGrade(score, maxPoints, quiz.gradingScale);

      // Reconstruir gradeDetail compatible con el formato asincrónico (sin diapositivas)
      const gradeDetail = quiz.questions
        .filter(q => q.type !== "slide")
        .map((q) => {
          // El índice real en quiz.questions para localizar la respuesta
          const realIdx = quiz.questions.findIndex(qq => qq.id === q.id);
          const ans = myAnswers.find(a => a.questionIdx === realIdx);
          const accepted = (q.acceptedAnswers || []).map(a => String(a).toLowerCase().trim()).filter(Boolean);
          const needsReview = q.type === "text" && accepted.length === 0;
          return {
            qid: q.id,
            type: q.type,
            userAnswer: ans?.answer ?? null,
            correct: ans?.correct ?? false,
            points: ans?.points ?? 0,
            pointsMax: (q.pointsCorrect ?? 100) + (q.pointsSpeedBonus ?? 0),
            needsReview,
            reviewed: false,
          };
        });

      const resultData = {
        quizId: quiz.id,
        quizTitle: quiz.title || "Quiz",
        ownerId: uid,
        studentName: p.name || "Sin nombre",
        studentCourse: p.course || "Sin curso",
        examDate: today,
        mode: "live",  // distintivo
        sessionCode: session.code,
        answers: {},  // No tenemos formato exacto como asincrónico, dejamos vacío
        gradeDetail,
        correct: correctCount,
        total: quiz.questions.filter(q => q.type !== "slide").length,
        score: grade,
        percent: maxPoints > 0 ? Math.round((score / maxPoints) * 100) : 0,
        pointsEarned: score,
        pointsMax: maxPoints,
        submittedAt: Date.now(),
      };

      const docRef = window.QS.db.collection("results").doc();
      batch.set(docRef, resultData);
    }
    await batch.commit();
  };

  const cancelSession = async () => {
    if (!confirm("¿Cancelar la sala? Los estudiantes serán desconectados.")) return;
    if (sessionIdRef.current) {
      await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
        status: "cancelled",
      });
    }
    onExit();
  };

  const finishSession = async () => {
    onExit();
  };

  if (loading || !session || !quiz) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center",
        background: quizBg(quiz?.color), color: "white" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⚡</div>
          <p>Creando sala...</p>
        </div>
      </div>
    );
  }

  const participants = Object.values(session.participants || {});
  const currentIdx = session.currentQuestionIdx;
  const currentQ = currentIdx >= 0 ? quiz.questions[currentIdx] : null;
  const answersThisQ = answersByQuestion[currentIdx] || {};

  if (session.status === "lobby") {
    return <HostLobby session={session} quiz={quiz} onStart={startQuiz} onCancel={cancelSession} onKick={kickParticipant} />;
  }

  const participantsModal = showParticipants ? (
    <ParticipantsModal
      participants={session.participants || {}}
      onKick={kickParticipant}
      onClose={() => setShowParticipants(false)}
    />
  ) : null;

  if (session.status === "playing") {
    // Si el elemento actual es una diapositiva: pantalla especial sin cronómetro
    if (currentQ && currentQ.type === "slide") {
      return (
        <>
          <HostSlide session={session} quiz={quiz} currentQ={currentQ}
            onNext={goNext} onFinish={finishNow}/>
          {participantsModal}
        </>
      );
    }
    return (
      <>
        <HostQuestion
          session={session} quiz={quiz} currentQ={currentQ}
          answersThisQ={answersThisQ} totalParticipants={participants.length}
          onReveal={revealCurrent} onSkip={revealCurrent}
          onAddTime={() => addTime(30)} onFinish={finishNow}
          onTogglePause={togglePause} onRelaunch={relaunchQuestion}
          onShowParticipants={() => setShowParticipants(true)}
        />
        {participantsModal}
      </>
    );
  }
  if (session.status === "showResults") {
    return (
      <>
        <HostReveal session={session} quiz={quiz} currentQ={currentQ}
          answersThisQ={answersThisQ} onNext={goNext} onGradeLive={gradeLiveAnswer} />
        {participantsModal}
      </>
    );
  }
  if (session.status === "finished") {
    return <HostFinal session={session} quiz={quiz} onFinish={finishSession} />;
  }
  return null;
}

// ============================================================
// STUDENT JOIN LIVE — entrada del estudiante con código de sala
// ============================================================
function StudentJoinLive({ initialCode, onCancel }) {
  const [code, setCode] = useStateL(initialCode || "");
  const [name, setName] = useStateL("");
  const [course, setCourse] = useStateL("");
  const [step, setStep] = useStateL(initialCode ? "checking" : "code"); // code | checking | identify | joining | live
  const [error, setError] = useStateL("");
  const [session, setSession] = useStateL(null);
  const [participantId, setParticipantId] = useStateL(null);
  const [quiz, setQuiz] = useStateL(null);

  // Intentar reconectar a una sala guardada (tras recarga / reapertura).
  // Devuelve true si reconectó; false si no había nada válido que reconectar.
  const tryReconnect = async (roomCode) => {
    const saved = loadLiveSession(roomCode);
    if (!saved || !saved.sessionId || !saved.participantId) return false;
    // Sesiones guardadas de hace más de 3 horas: descartarlas (son de otra clase)
    if (saved.savedAt && Date.now() - saved.savedAt > 3 * 60 * 60 * 1000) {
      clearLiveSession(roomCode);
      return false;
    }
    // Reconexión "mejor esfuerzo": si Firestore no responde en 5 segundos,
    // seguimos con el flujo normal de unirse en vez de dejar al estudiante
    // pegado en "Verificando código de sala...".
    let gaveUp = false;
    const timeout = new Promise(res => setTimeout(() => { gaveUp = true; res(null); }, 5000));
    try {
      const doc = await Promise.race([
        window.QS.db.collection("liveSessions").doc(saved.sessionId).get(),
        timeout,
      ]);
      if (gaveUp || !doc) return false;
      if (!doc.exists) { clearLiveSession(roomCode); return false; }
      const sessionData = { id: doc.id, ...doc.data() };
      // La sala debe seguir viva y el participante debe seguir registrado
      if (sessionData.status === "cancelled" || sessionData.status === "finished") {
        clearLiveSession(roomCode);
        return false;
      }
      if (!sessionData.participants || !sessionData.participants[saved.participantId]) {
        clearLiveSession(roomCode);
        return false;
      }
      // Cargar el quiz para entregárselo a StudentLive (también con timeout)
      const quizDoc = await Promise.race([
        window.QS.db.collection("quizzes").doc(sessionData.quizId).get(),
        timeout,
      ]);
      if (gaveUp || !quizDoc) return false;
      if (!quizDoc.exists) { clearLiveSession(roomCode); return false; }
      setSession(sessionData);
      setParticipantId(saved.participantId);
      setName(saved.name || "");
      setCourse(saved.course || "");
      setQuiz({ id: quizDoc.id, ...quizDoc.data() });
      setStep("live");
      return true;
    } catch (e) {
      console.error("Error reconectando:", e);
      return false;
    }
  };

  // Si llega un código por URL: primero intentar reconectar; si no, flujo normal
  useEffectL(() => {
    if (!initialCode) return;
    let cancelled = false;
    const autoLoad = async () => {
      // 1) Intento de reconexión a sesión guardada
      const reconnected = await tryReconnect(initialCode);
      if (cancelled || reconnected) return;
      // 2) Flujo normal: buscar sala en lobby para unirse por primera vez
      try {
        const snap = await window.QS.db.collection("liveSessions")
          .where("code", "==", initialCode).where("status", "==", "lobby").limit(1).get();
        if (cancelled) return;
        if (snap.empty) {
          setError("Código no encontrado o la sala ya empezó.");
          setStep("code");
          return;
        }
        const doc = snap.docs[0];
        setSession({ id: doc.id, ...doc.data() });
        setStep("identify");
      } catch (err) {
        if (cancelled) return;
        setError("Error: " + err.message);
        setStep("code");
      }
    };
    autoLoad();
    return () => { cancelled = true; };
  }, [initialCode]);

  const handleCheckCode = async () => {
    setError("");
    if (code.length !== 6) {
      setError("El código debe tener 6 dígitos.");
      return;
    }
    try {
      // Si ya estuvo en esta sala, reconectar directo
      const reconnected = await tryReconnect(code);
      if (reconnected) return;
      const snap = await window.QS.db.collection("liveSessions")
        .where("code", "==", code).where("status", "==", "lobby").limit(1).get();
      if (snap.empty) {
        setError("Código no encontrado o la sala ya empezó.");
        return;
      }
      const doc = snap.docs[0];
      setSession({ id: doc.id, ...doc.data() });
      setStep("identify");
    } catch (err) {
      setError("Error: " + err.message);
    }
  };

  const handleJoin = async () => {
    setError("");
    if (!name.trim() || !course.trim()) {
      setError("Completa nombre y curso.");
      return;
    }
    if (!session || !session.id) {
      setError("La sala aún no se ha cargado. Intenta de nuevo.");
      return;
    }
    if (!session.quizId) {
      setError("La sala no tiene quiz asociado. Pídele al profesor que cree una nueva sala.");
      return;
    }
    setStep("joining");
    try {
      const pid = "p-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const participantData = {
        id: pid,
        name: name.trim(),
        course: course.trim(),
        joinedAt: Date.now(),
        score: 0,
      };
      const updateKey = `participants.${pid}`;
      await window.QS.db.collection("liveSessions").doc(session.id).update({
        [updateKey]: participantData,
      });
      setParticipantId(pid);

      // Guardar para reconexión tras recarga/cierre de pestaña
      saveLiveSession(session.code, {
        sessionId: session.id,
        participantId: pid,
        name: name.trim(),
        course: course.trim(),
        savedAt: Date.now(),
      });

      // Cargar quiz con manejo tolerante
      try {
        const quizDoc = await window.QS.db.collection("quizzes").doc(session.quizId).get();
        if (quizDoc.exists) {
          const quizData = { id: quizDoc.id, ...quizDoc.data() };
          setQuiz(quizData);
          setStep("live");
        } else {
          console.error("Quiz no existe en Firestore. quizId:", session.quizId);
          setError("El quiz asociado a esta sala no existe.");
          setStep("identify");
        }
      } catch (quizErr) {
        console.error("Error leyendo quiz:", quizErr);
        setError("Permiso denegado al leer el quiz. Detalle: " + quizErr.message);
        setStep("identify");
      }
    } catch (err) {
      console.error("Error al unirse:", err);
      setError("Error al unirse: " + err.message);
      setStep("identify");
    }
  };

  if (step === "live" && session && quiz && participantId) {
    return <StudentLive sessionId={session.id} participantId={participantId} quizInitial={quiz} onExit={onCancel}/>;
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: quizBg(quiz?.color),
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div className="qs-card" style={{ padding: 32, maxWidth: 440, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚡</div>
          <h2 style={{ fontSize: 22 }}>Unirse a un quiz en vivo</h2>
        </div>

        {step === "code" && (
          <>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              Código de la sala (6 dígitos)
            </label>
            <input
              type="text" className="qs-input"
              placeholder="123456"
              value={code}
              maxLength={6}
              onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              onKeyDown={e => e.key === "Enter" && handleCheckCode()}
              style={{
                fontSize: 28, textAlign: "center", letterSpacing: "0.3em",
                fontFamily: "var(--font-display)", fontWeight: 800, padding: "16px 12px",
              }}
              autoFocus
            />
            {error && <p style={{ color: "var(--red-500)", fontSize: 13, marginTop: 8 }}>{error}</p>}
            <button onClick={handleCheckCode} className="qs-btn qs-btn--primary qs-btn--lg" style={{ width: "100%", marginTop: 16 }}>
              Continuar
            </button>
            {onCancel && (
              <button onClick={onCancel} className="qs-btn qs-btn--ghost qs-btn--sm" style={{ width: "100%", marginTop: 8 }}>
                Cancelar
              </button>
            )}
          </>
        )}

        {step === "identify" && (
          <>
            <div style={{ marginBottom: 16, padding: 12, background: "var(--violet-50)", borderRadius: 10, textAlign: "center" }}>
              <p style={{ fontSize: 13, color: "var(--violet-700)", fontWeight: 600 }}>
                ✓ Sala encontrada
              </p>
              <p style={{ fontSize: 16, fontWeight: 700 }}>{session?.quizTitle}</p>
            </div>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              Tu nombre completo
            </label>
            <input
              type="text" className="qs-input" placeholder="Ana María Pérez"
              value={name} onChange={e => setName(e.target.value)}
              style={{ marginBottom: 14 }} autoFocus
            />
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              Curso
            </label>
            <input
              type="text" className="qs-input" placeholder="Ej: 10A"
              value={course} onChange={e => setCourse(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleJoin()}
            />
            {error && <p style={{ color: "var(--red-500)", fontSize: 13, marginTop: 8 }}>{error}</p>}
            <button onClick={handleJoin} className="qs-btn qs-btn--success qs-btn--lg" style={{ width: "100%", marginTop: 16 }}>
              🚀 Entrar al quiz
            </button>
          </>
        )}

        {step === "checking" && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 32 }}>🔍</div>
            <p>Verificando código de sala...</p>
          </div>
        )}

        {step === "joining" && (
          <div style={{ textAlign: "center", padding: 20 }}>
            <div style={{ fontSize: 32 }}>⏳</div>
            <p>Uniéndote a la sala...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// STUDENT LIVE — el estudiante durante la sesión
// ============================================================
function StudentLive({ sessionId, participantId, quizInitial, onExit }) {
  const [session, setSession] = useStateL(null);
  const [quiz] = useStateL(quizInitial);
  const [myAnswer, setMyAnswer] = useStateL(null);
  const [answeredAtIdx, setAnsweredAtIdx] = useStateL(-1);
  const [secondsLeft, setSecondsLeft] = useStateL(0);
  const [myResultThisQ, setMyResultThisQ] = useStateL(null); // resultado local de la pregunta actual
  const [liveGrade, setLiveGrade] = useStateL(null); // calificación en vivo recibida del docente
  const [myAciertos, setMyAciertos] = useStateL(null);
  const myScore = (session?.participants?.[participantId]?.score) || 0;

  // Cuando la sala termina/cancela, o si me expulsan, borrar la sesión
  // guardada para que no intente reconectar a esta sala.
  useEffectL(() => {
    if (!session) return;
    const kicked = session.participants && !session.participants[participantId]
      && session.status !== "finished";
    if (session.status === "finished" || session.status === "cancelled" || kicked) {
      if (session.code) clearLiveSession(session.code);
    }
  }, [session?.status, session?.participants]);

  // Al terminar la sala, contar mis aciertos para mostrarlos
  useEffectL(() => {
    if (session?.status !== "finished") return;
    window.QS.db.collection("liveSessions").doc(sessionId)
      .collection("answers").where("participantId", "==", participantId).get()
      .then(snap => {
        let count = 0;
        snap.docs.forEach(d => { if (d.data().correct) count++; });
        setMyAciertos(count);
      })
      .catch(err => console.error("Error contando aciertos:", err));
  }, [session?.status]);

  // Suscripción a la sesión
  useEffectL(() => {
    const unsub = window.QS.db.collection("liveSessions").doc(sessionId)
      .onSnapshot(doc => {
        if (doc.exists) {
          setSession({ id: doc.id, ...doc.data() });
        }
      });
    return () => unsub();
  }, [sessionId]);

  // Reset al cambiar de pregunta o al re-lanzar la actual (questionVersion)
  useEffectL(() => {
    if (!session) return;
    setMyAnswer(null);
    setMyResultThisQ(null);
    setLiveGrade(null);
    setAnsweredAtIdx(-1);
  }, [session?.currentQuestionIdx, session?.questionVersion]);

  // Si la pregunta es abierta con calificación en vivo, durante "showResults"
  // escuchar mi doc de respuesta para recibir la nota que ponga el docente.
  useEffectL(() => {
    if (!session || session.status !== "showResults") { setLiveGrade(null); return; }
    const currentQ = quiz.questions[session.currentQuestionIdx];
    if (!currentQ || currentQ.type !== "text" || (currentQ.gradeMode || "live") !== "live") return;
    const docId = `${participantId}-${session.currentQuestionIdx}`;
    const unsub = window.QS.db.collection("liveSessions").doc(sessionId)
      .collection("answers").doc(docId)
      .onSnapshot(doc => {
        if (doc.exists) {
          const d = doc.data();
          if (d.graded) setLiveGrade({ result: d.gradeResult, points: d.points || 0 });
          else setLiveGrade(null);
        }
      });
    return () => unsub();
  }, [session?.status, session?.currentQuestionIdx, sessionId, participantId]);

  // Cronómetro (respeta la pausa del docente)
  useEffectL(() => {
    if (!session || session.status !== "playing") return;
    const currentQ = quiz.questions[session.currentQuestionIdx];
    if (!currentQ) return;
    const totalSec = (currentQ.timer || 20) + (session.extraSeconds || 0);
    const startedAt = session.questionStartedAt || Date.now();
    const isPaused = !!session.pausedAt;
    const tick = () => {
      const now = isPaused ? session.pausedAt : Date.now();
      const left = Math.max(0, totalSec - (now - startedAt) / 1000);
      // Solo re-renderizar cuando cambia el segundo visible (ahorro de
      // batería y CPU en los celulares de los estudiantes).
      setSecondsLeft(prev => (Math.ceil(left) === Math.ceil(prev) ? prev : left));
    };
    tick();
    if (isPaused) return;
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [session?.questionStartedAt, session?.status, session?.extraSeconds, session?.pausedAt]);

  // El resultado del reveal se calcula directamente en el render desde
  // myResultThisQ (guardado en memoria al responder). No usamos efecto ni
  // relectura de Firestore para evitar parpadeos y problemas de timing.

  const submitAnswer = async (answer) => {
    if (!session || session.status !== "playing") return;
    if (session.pausedAt) return; // no se puede responder en pausa
    if (answeredAtIdx === session.currentQuestionIdx) return;
    const qIdx = session.currentQuestionIdx;
    const currentQ = quiz.questions[qIdx];
    const totalSec = currentQ.timer || 20;
    const startedAt = session.questionStartedAt || Date.now();
    const secondsTaken = (Date.now() - startedAt) / 1000;
    const isSurvey = quiz.mode === "survey";
    // Respuesta abierta con calificación en vivo: el docente pone la nota,
    // no se autocalifica ni se asignan puntos al responder.
    const isLiveGradedOpen = !isSurvey && currentQ.type === "text" && (currentQ.gradeMode || "live") === "live";
    // En encuesta o en abiertas-en-vivo no hay respuesta correcta automática ni puntaje
    const isCorrect = (isSurvey || isLiveGradedOpen) ? null : checkAnswer(currentQ, answer);
    const points = (isSurvey || isLiveGradedOpen) ? 0 : calculatePoints(currentQ, isCorrect, secondsTaken, totalSec);

    setMyAnswer(answer);
    setAnsweredAtIdx(qIdx);
    setMyResultThisQ({ correct: isCorrect, points, survey: isSurvey, pendingGrade: isLiveGradedOpen });

    try {
      const docId = `${participantId}-${qIdx}`;
      const answerRef = window.QS.db.collection("liveSessions").doc(sessionId)
        .collection("answers").doc(docId);

      // Guardar (o sobrescribir) la respuesta. El puntaje NO se suma aquí:
      // queda como pendingPoints y el docente lo aplica al revelar, para que
      // el marcador del estudiante no delate si acertó antes del reveal.
      await answerRef.set({
        participantId, questionIdx: qIdx, answer,
        correct: isCorrect, points,
        pendingPoints: (!isSurvey && !isLiveGradedOpen) ? points : 0,
        applied: false, // si ya se sumó al score
        graded: false,  // las abiertas-en-vivo las califica el docente
        secondsTaken, answeredAt: Date.now(),
      });
    } catch (err) {
      console.error("Error enviando respuesta:", err);
    }
  };

  // ----- Render -----
  if (!session) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center",
        background: quizBg(quiz?.color), color: "white" }}>
        <p>Conectando...</p>
      </div>
    );
  }

  if (session.status === "cancelled") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center",
        background: quizBg(quiz?.color), color: "white", padding: 20 }}>
        <div className="qs-card" style={{ padding: 24, textAlign: "center", color: "var(--ink-900)" }}>
          <p style={{ fontSize: 32 }}>🚫</p>
          <p>El profesor canceló la sala.</p>
          <button onClick={onExit} className="qs-btn qs-btn--primary" style={{ marginTop: 12 }}>Salir</button>
        </div>
      </div>
    );
  }

  // Expulsado: la sala sigue viva pero ya no estoy en la lista de participantes
  const wasKicked = session.participants && !session.participants[participantId]
    && session.status !== "finished";
  if (wasKicked) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center",
        background: quizBg(quiz?.color), color: "white", padding: 20 }}>
        <div className="qs-card" style={{ padding: 24, textAlign: "center", color: "var(--ink-900)", maxWidth: 380 }}>
          <p style={{ fontSize: 40 }}>👋</p>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Saliste de la sala</h2>
          <p style={{ color: "var(--ink-500)" }}>El profesor te sacó de esta sesión.</p>
          <button onClick={onExit} className="qs-btn qs-btn--primary" style={{ marginTop: 16 }}>Salir</button>
        </div>
      </div>
    );
  }

  if (session.status === "lobby") {
    const me = session.participants?.[participantId];
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: quizBg(quiz?.color), color: "white", padding: 20,
      }}>
        <div className="qs-card" style={{ padding: 32, textAlign: "center", maxWidth: 400, color: "var(--ink-900)" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }} className="qs-bob">🎉</div>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>¡Estás dentro!</h2>
          <p style={{ marginBottom: 16, color: "var(--ink-500)" }}>
            <b>{me?.name}</b> · {me?.course}
          </p>
          <div style={{ padding: 14, background: "var(--violet-50)", borderRadius: 10, marginBottom: 16 }}>
            <p style={{ fontSize: 14, color: "var(--violet-700)", fontWeight: 600 }}>
              Esperando que el profesor inicie el quiz...
            </p>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-500)" }}>
            👥 {Object.keys(session.participants || {}).length} estudiantes en la sala
          </p>
        </div>
      </div>
    );
  }

  if (session.status === "finished") {
    const participants = Object.values(session.participants || {})
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    const myRank = participants.findIndex(p => p.id === participantId) + 1;
    const totalPlayers = participants.length;

    // Calcular máximo posible y nota convertida
    const maxPoints = calculateMaxPoints(quiz);
    const myGrade = convertToGrade(myScore, maxPoints, quiz.gradingScale);
    const passing = myGrade >= 3.0;

    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: quizBg(quiz?.color), padding: 20,
      }}>
        <div className="qs-card" style={{ padding: 28, textAlign: "center", maxWidth: 440, width: "100%" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>
            {myRank === 1 ? "🥇" : myRank === 2 ? "🥈" : myRank === 3 ? "🥉" : "🏁"}
          </div>
          <h2 style={{ fontSize: 22, marginBottom: 4 }}>¡Quiz terminado!</h2>
          <p style={{ color: "var(--ink-500)", marginBottom: 16, fontSize: 14 }}>
            Quedaste en el puesto <b>{myRank}</b> de {totalPlayers}
          </p>

          {/* Aciertos */}
          {myAciertos != null && (
            <div style={{
              background: "var(--ink-50)", padding: 12, borderRadius: 10, marginBottom: 10,
            }}>
              <div style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>Aciertos</div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)" }}>
                {myAciertos} de {quiz.questions.length}
              </div>
            </div>
          )}

          {/* Puntaje */}
          <div style={{
            background: "var(--violet-50)", padding: 14, borderRadius: 12, marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, color: "var(--violet-700)", fontWeight: 600 }}>Puntaje obtenido</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--violet-700)" }}>
              {myScore}
              <span style={{ fontSize: 14, opacity: 0.7 }}> / {maxPoints}</span>
            </div>
          </div>

          {/* Nota convertida */}
          <div style={{
            background: passing ? "#d1fae5" : "#fef3c7",
            color: passing ? "#065f46" : "#92400e",
            padding: 20, borderRadius: 14, marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>TU NOTA</div>
            <div style={{ fontSize: 48, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1 }}>
              {myGrade.toFixed(1)}
            </div>
          </div>

          <button onClick={onExit} className="qs-btn qs-btn--primary qs-btn--lg" style={{ width: "100%" }}>Salir</button>
        </div>
      </div>
    );
  }

  const currentQ = quiz.questions[session.currentQuestionIdx];
  if (!currentQ) return null;

  // === Mostrando respuesta correcta (el docente reveló) ===
  if (session.status === "showResults") {
    const isLast = session.currentQuestionIdx >= quiz.questions.length - 1;
    const isSurvey = quiz.mode === "survey";
    // Resultado tomado directamente de memoria: respondió esta pregunta o no.
    const answeredThis = answeredAtIdx === session.currentQuestionIdx && myResultThisQ;
    const reveal = answeredThis ? myResultThisQ : { noAnswer: true };
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: quizBg(quiz?.color), padding: 20,
      }}>
        <div className="qs-card" style={{ padding: 28, textAlign: "center", maxWidth: 420, width: "100%" }}>
          {reveal.noAnswer ? (
            <>
              <div style={{ fontSize: 56, marginBottom: 8 }}>⏰</div>
              <h2 style={{ fontSize: 22, marginBottom: 8 }}>Se acabó el tiempo</h2>
              <p style={{ color: "var(--ink-500)", marginBottom: 16 }}>No alcanzaste a responder</p>
            </>
          ) : isSurvey ? (
            <>
              <div style={{ fontSize: 60, marginBottom: 8 }} className="qs-pop-in">🗳️</div>
              <h2 style={{ fontSize: 24, color: "var(--violet-700)", marginBottom: 8 }}>¡Gracias por tu respuesta!</h2>
              <p style={{ color: "var(--ink-500)", marginBottom: 4 }}>Mira la pantalla del profesor para ver los resultados de todo el grupo.</p>
            </>
          ) : reveal.pendingGrade ? (
            // Respuesta abierta calificada en vivo: esperar la nota del docente
            liveGrade ? (
              <>
                <div style={{ fontSize: 60, marginBottom: 8 }} className="qs-pop-in">
                  {liveGrade.result === "correct" ? "🎉" : liveGrade.result === "partial" ? "👍" : "📝"}
                </div>
                <h2 style={{
                  fontSize: 24, marginBottom: 8,
                  color: liveGrade.result === "correct" ? "var(--emerald-600)"
                    : liveGrade.result === "partial" ? "var(--amber-500)" : "var(--red-500)",
                }}>
                  {liveGrade.result === "correct" ? "¡Correcto!" : liveGrade.result === "partial" ? "Parcialmente correcto" : "Incorrecto"}
                </h2>
                <p style={{ color: "var(--ink-500)", marginBottom: 12 }}>+{liveGrade.points} puntos</p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 56, marginBottom: 8 }} className="qs-bob">⏳</div>
                <h2 style={{ fontSize: 22, color: "var(--violet-700)", marginBottom: 8 }}>El profesor está calificando...</h2>
                <p style={{ color: "var(--ink-500)", marginBottom: 4 }}>Espera un momento, tu nota aparecerá aquí.</p>
              </>
            )
          ) : reveal.correct ? (
            <>
              <div style={{ fontSize: 64, marginBottom: 8 }} className="qs-pop-in">🎉</div>
              <h2 style={{ fontSize: 26, color: "var(--emerald-600)", marginBottom: 8 }}>¡Correcto!</h2>
              <p style={{ color: "var(--ink-500)", marginBottom: 12 }}>+{reveal.points} puntos</p>
            </>
          ) : (
            <>
              <div style={{ fontSize: 56, marginBottom: 8 }}>❌</div>
              <h2 style={{ fontSize: 22, color: "var(--red-500)", marginBottom: 8 }}>Incorrecto</h2>
              <p style={{ color: "var(--ink-500)", marginBottom: 16 }}>¡Suerte en la siguiente!</p>
            </>
          )}
          {/* El puntaje solo se muestra en modo quiz */}
          {!isSurvey && (
            <div style={{
              padding: 14, background: "var(--violet-50)", borderRadius: 10,
              marginTop: 16,
            }}>
              <p style={{ fontSize: 12, color: "var(--violet-700)", fontWeight: 600 }}>TU PUNTAJE</p>
              <p style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--violet-700)" }}>
                {myScore} pts
              </p>
            </div>
          )}
          {currentQ.feedback && currentQ.feedback.trim() && (
            <div style={{
              marginTop: 16, padding: 14, background: "var(--ink-50)", borderRadius: 12,
              textAlign: "left", borderLeft: "4px solid var(--violet-500)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--violet-700)", marginBottom: 4 }}>💬 Retroalimentación</div>
              <div style={{ fontSize: 14, color: "var(--ink-700)", lineHeight: 1.5 }}>{currentQ.feedback}</div>
            </div>
          )}
          <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 16 }}>
            {isLast ? (isSurvey ? "Esperando el cierre..." : "Esperando ranking final...") : "Esperando siguiente pregunta..."}
          </p>
        </div>
      </div>
    );
  }

  // === Pregunta en curso ===
  if (session.status === "playing") {
    const haveAnswered = answeredAtIdx === session.currentQuestionIdx;
    const colors = ["var(--tile-1)", "var(--tile-2)", "var(--tile-3)", "var(--tile-4)"];

    // Si el elemento actual es una diapositiva, el estudiante la ve y espera al docente
    if (currentQ && currentQ.type === "slide") {
      return (
        <div style={{
          minHeight: "100vh",
          background: quizBg(quiz?.color),
          padding: 16, color: "white",
        }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <div style={{ opacity: 0.85, fontSize: 12, marginBottom: 12, textAlign: "center" }}>
              📋 Diapositiva · esperando al profesor
            </div>
            <div className="qs-card" style={{ padding: 20, color: "var(--ink-900)" }}>
              {currentQ.slideTitle && (
                <h2 style={{ fontSize: 22, marginBottom: 12, fontFamily: "var(--font-display)" }}>
                  {currentQ.slideTitle}
                </h2>
              )}
              {currentQ.image && (
                <div style={{ textAlign: "center", marginBottom: 12 }}>
                  <img src={currentQ.image} alt=""
                    style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 10 }}/>
                </div>
              )}
              {currentQ.video && youtubeId(currentQ.video) && (
                <div style={{ marginBottom: 12, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
                  <iframe src={`https://www.youtube.com/embed/${youtubeId(currentQ.video)}`} title="Video"
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    allowFullScreen/>
                </div>
              )}
              {currentQ.slideBody && (
                <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {currentQ.slideBody}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (haveAnswered) {
      return (
        <div style={{
          minHeight: "100vh", display: "grid", placeItems: "center",
          background: quizBg(quiz?.color), padding: 20,
        }}>
          <div className="qs-card" style={{ padding: 32, textAlign: "center", maxWidth: 380 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }} className="qs-bob">⏳</div>
            <h2 style={{ fontSize: 22, marginBottom: 8 }}>¡Respuesta enviada!</h2>
            <p style={{ color: "var(--ink-500)" }}>Esperando que terminen los demás...</p>
            <div style={{ marginTop: 20 }}>
              <div style={{
                padding: 14, background: "var(--ink-50)", borderRadius: 10,
              }}>
                <p style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>TIEMPO</p>
                <p style={{ fontSize: 24, fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--ink-700)" }}>
                  {Math.ceil(secondsLeft)}s
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{
        minHeight: "100vh",
        background: quizBg(quiz?.color),
        padding: 16, paddingBottom: 24,
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            color: "white", marginBottom: 12,
          }}>
            <span style={{ fontWeight: 600 }}>Pregunta {session.currentQuestionIdx + 1} / {quiz.questions.length}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {quiz.mode !== "survey" && (
                <span style={{
                  background: "rgba(255,255,255,0.18)", color: "white", padding: "6px 12px",
                  borderRadius: 10, fontWeight: 700, fontSize: 14,
                }}>⭐ {myScore} pts</span>
              )}
              <span style={{
                background: session.pausedAt ? "var(--amber-400)" : "white",
                color: session.pausedAt ? "#7c2d12" : (secondsLeft < 5 ? "var(--red-500)" : "var(--violet-700)"),
                padding: "6px 14px",
                borderRadius: 10, fontWeight: 800, fontFamily: "var(--font-display)",
              }}>{session.pausedAt ? "⏸ Pausa" : Math.ceil(secondsLeft) + "s"}</span>
            </div>
          </div>

          <div className="qs-card" style={{ padding: 20, marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, lineHeight: 1.4 }}>{currentQ.text}</h2>
            {currentQ.image && (
              <div style={{ textAlign: "center", marginTop: 12 }}>
                <img src={currentQ.image} alt=""
                  style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 10, border: "1px solid var(--ink-200)" }}/>
              </div>
            )}
            {currentQ.video && youtubeId(currentQ.video) && (
              <div style={{ marginTop: 12, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
                <iframe src={`https://www.youtube.com/embed/${youtubeId(currentQ.video)}`} title="Video"
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                  allowFullScreen/>
              </div>
            )}
          </div>

          {(currentQ.type === "multi" || currentQ.type === "truefalse" || currentQ.type === "poll") && (
            <div style={{ display: "grid", gap: 10 }}>
              {(currentQ.options || []).map((opt, i) => (
                <button key={opt.id}
                  onClick={() => submitAnswer(opt.id)}
                  style={{
                    padding: "18px 20px", borderRadius: 14, background: colors[i % 4],
                    color: "white", fontSize: 17, fontWeight: 700, textAlign: "left",
                    border: "none", cursor: "pointer", boxShadow: "var(--shadow-tile)",
                  }}
                >{opt.text}</button>
              ))}
            </div>
          )}

          {currentQ.type === "scale" && (
            <div style={{ display: "grid", gap: 8 }}>
              {(currentQ.scaleLabels || SCALE_LABELS).map((lbl, i, arr) => {
                // Degradado de rojo (desacuerdo) a verde (acuerdo)
                const ratio = arr.length > 1 ? i / (arr.length - 1) : 0.5;
                const bg = `hsl(${Math.round(ratio * 130)}, 65%, 48%)`;
                return (
                  <button key={i}
                    onClick={() => submitAnswer(i)}
                    style={{
                      padding: "16px 20px", borderRadius: 14, background: bg,
                      color: "white", fontSize: 16, fontWeight: 700, textAlign: "left",
                      border: "none", cursor: "pointer", boxShadow: "var(--shadow-tile)",
                      display: "flex", alignItems: "center", gap: 12,
                    }}
                  >
                    <span style={{
                      width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                      background: "rgba(255,255,255,0.25)", display: "grid", placeItems: "center",
                      fontWeight: 800,
                    }}>{i + 1}</span>
                    {lbl}
                  </button>
                );
              })}
            </div>
          )}

          {currentQ.type === "wordcloud" && (
            <TextAnswer onSubmit={(t) => submitAnswer(t)} placeholder="Escribe una palabra o frase corta..." />
          )}

          {currentQ.type === "checks" && (
            <div>
              <p style={{ color: "white", fontSize: 13, marginBottom: 8, textAlign: "center" }}>
                Selecciona todas las que apliquen y pulsa enviar
              </p>
              <CheckSelector
                options={currentQ.options || []}
                colors={colors}
                onSubmit={(ids) => submitAnswer(ids)}
              />
            </div>
          )}

          {currentQ.type === "text" && (
            <TextAnswer onSubmit={(t) => submitAnswer(t)} />
          )}

          {currentQ.type === "order" && (
            <OrderSelector items={currentQ.items || []} onSubmit={(ids) => submitAnswer(ids)} />
          )}
        </div>
      </div>
    );
  }

  return null;
}

function CheckSelector({ options, colors, onSubmit }) {
  const [picked, setPicked] = useStateL([]);
  return (
    <>
      <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
        {options.map((opt, i) => {
          const isOn = picked.includes(opt.id);
          return (
            <button key={opt.id}
              onClick={() => setPicked(isOn ? picked.filter(x => x !== opt.id) : [...picked, opt.id])}
              style={{
                padding: "16px 20px", borderRadius: 14, background: colors[i % 4],
                color: "white", fontSize: 16, fontWeight: 700, textAlign: "left",
                border: isOn ? "4px solid white" : "4px solid transparent",
                cursor: "pointer", opacity: isOn ? 1 : 0.7,
              }}
            >{isOn ? "✓ " : ""}{opt.text}</button>
          );
        })}
      </div>
      <button
        onClick={() => onSubmit(picked)}
        disabled={picked.length === 0}
        className="qs-btn qs-btn--success qs-btn--lg"
        style={{ width: "100%", opacity: picked.length === 0 ? 0.5 : 1 }}
      >Enviar respuesta</button>
    </>
  );
}

function TextAnswer({ onSubmit, placeholder = "Escribe tu respuesta..." }) {
  const [text, setText] = useStateL("");
  return (
    <>
      <input
        type="text" className="qs-input" autoFocus
        placeholder={placeholder}
        value={text} onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === "Enter" && text.trim() && onSubmit(text)}
        style={{ fontSize: 18, padding: 16, marginBottom: 12 }}
      />
      <button
        onClick={() => text.trim() && onSubmit(text)}
        disabled={!text.trim()}
        className="qs-btn qs-btn--success qs-btn--lg"
        style={{ width: "100%" }}
      >Enviar respuesta</button>
    </>
  );
}

// Selector para preguntas de ORDENAR: el estudiante reordena con ↑ ↓
function OrderSelector({ items, onSubmit }) {
  // Mezclar los items al inicio (orden aleatorio) y dejar que el estudiante reordene
  const [order, setOrder] = useStateL(() => {
    const ids = (items || []).map(it => it.id);
    // Fisher-Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  });
  const byId = {}; (items || []).forEach(it => byId[it.id] = it);
  const move = (idx, dir) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= order.length) return;
    const next = [...order];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    setOrder(next);
  };
  return (
    <>
      <p style={{ color: "white", fontSize: 13, marginBottom: 8, textAlign: "center" }}>
        Acomoda los elementos en el orden correcto y pulsa enviar
      </p>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {order.map((id, i) => {
          const it = byId[id];
          if (!it) return null;
          return (
            <div key={id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
              borderRadius: 12, background: "rgba(255,255,255,0.95)", color: "var(--ink-900)",
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                background: "var(--violet-100)", color: "var(--violet-700)",
                display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13,
              }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{it.text}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--ink-200)",
                  background: i === 0 ? "var(--ink-100)" : "white", cursor: i === 0 ? "default" : "pointer",
                  fontSize: 16, fontWeight: 800, color: i === 0 ? "var(--ink-300)" : "var(--violet-700)",
                }}>↑</button>
              <button onClick={() => move(i, 1)} disabled={i === order.length - 1}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--ink-200)",
                  background: i === order.length - 1 ? "var(--ink-100)" : "white", cursor: i === order.length - 1 ? "default" : "pointer",
                  fontSize: 16, fontWeight: 800, color: i === order.length - 1 ? "var(--ink-300)" : "var(--violet-700)",
                }}>↓</button>
            </div>
          );
        })}
      </div>
      <button onClick={() => onSubmit(order)}
        className="qs-btn qs-btn--success qs-btn--lg"
        style={{ width: "100%" }}>Enviar respuesta</button>
    </>
  );
}

// Exponer globalmente

// ============================================================
// LIVE HISTORY PANEL — historial de sesiones en vivo.
// Las respuestas y puntajes de cada sala quedan guardados en
// Firestore desde el momento en que los estudiantes responden;
// este panel permite verlos y (re)enviarlos al panel de
// Resultados aunque la sala no se haya finalizado bien.
// ============================================================
function LiveHistoryPanel({ onBack }) {
  const [sessions, setSessions] = useStateL([]);
  const [loadingH, setLoadingH] = useStateL(true);
  const [openId, setOpenId] = useStateL(null);
  const [busyId, setBusyId] = useStateL(null);
  // Detalle de respuestas por pregunta: { sessionId, quiz, answers }
  const [detail, setDetail] = useStateL(null);
  const [loadingDetail, setLoadingDetail] = useStateL(null);

  useEffectL(() => {
    const load = async () => {
      try {
        const uid = window.QS.currentUser?.uid;
        if (!uid) return;
        const snap = await window.QS.db.collection("liveSessions")
          .where("ownerId", "==", uid).get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setSessions(list);
      } catch (err) {
        console.error("Error cargando sesiones:", err);
        alert("Error cargando el historial: " + err.message);
      }
      setLoadingH(false);
    };
    load();
  }, []);

  const STATUS_LABEL = {
    finished:  { txt: "Finalizada",        bg: "var(--emerald-500)" },
    playing:   { txt: "Quedó abierta",     bg: "var(--amber-500)" },
    lobby:     { txt: "Solo lobby",        bg: "var(--ink-400)" },
    cancelled: { txt: "Cancelada",         bg: "var(--red-500)" },
  };

  // Texto legible de una respuesta según el tipo de pregunta
  const answerToText = (q, answer) => {
    if (answer === null || answer === undefined || answer === "") return "(sin respuesta)";
    if (Array.isArray(answer)) {
      return answer.map(id => {
        const o = (q.options || []).find(x => x.id === id);
        return o ? o.text : id;
      }).join(" | ");
    }
    if (q.type === "scale") {
      const labels = q.scaleLabels || SCALE_LABELS;
      const idx = Number(answer);
      return !isNaN(idx) && labels[idx] != null ? labels[idx] : String(answer);
    }
    if (q.options && q.options.length) {
      const o = q.options.find(x => x.id === answer);
      if (o) return o.text;
    }
    return String(answer);
  };

  // Cargar (o cerrar) el detalle de respuestas por pregunta de una sesión
  const toggleDetail = async (s) => {
    if (detail && detail.sessionId === s.id) { setDetail(null); return; }
    setLoadingDetail(s.id);
    try {
      const quizDoc = await window.QS.db.collection("quizzes").doc(s.quizId).get();
      if (!quizDoc.exists) throw new Error("El quiz de esta sesión ya no existe.");
      const quiz = { id: quizDoc.id, ...quizDoc.data() };
      const snap = await window.QS.db.collection("liveSessions")
        .doc(s.id).collection("answers").get();
      const answers = snap.docs.map(d => d.data());
      setDetail({ sessionId: s.id, quiz, answers });
      setOpenId(null);
    } catch (err) {
      alert("No se pudieron cargar las respuestas: " + err.message);
    }
    setLoadingDetail(null);
  };

  // Descargar CSV con una fila por estudiante y una columna por pregunta
  const downloadCsv = (s) => {
    if (!detail || detail.sessionId !== s.id) return;
    const { quiz, answers } = detail;
    const qs = quiz.questions.map((q, i) => ({ q, realIdx: i })).filter(x => x.q.type !== "slide");
    const header = ["Nombre", "Curso"];
    qs.forEach((x, i) => header.push(`P${i + 1}: ${String(x.q.text || "").substring(0, 60)}`));
    const escapeCsv = (val) => {
      const str = String(val == null ? "" : val);
      return (str.includes(",") || str.includes('"') || str.includes("\n"))
        ? '"' + str.replace(/"/g, '""') + '"' : str;
    };
    const rows = Object.values(s.participants || {}).map(p => {
      const row = [p.name || "Sin nombre", p.course || ""];
      qs.forEach(x => {
        const ans = answers.find(a => a.participantId === p.id && a.questionIdx === x.realIdx);
        row.push(answerToText(x.q, ans ? ans.answer : null));
      });
      return row;
    });
    const csv = [header, ...rows].map(r => r.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `respuestas-${(s.quizTitle || "quiz").replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, "")}-sala${s.code}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Reconstruye los resultados de una sesión y los envía al panel de
  // Resultados (misma lógica que al finalizar una sala, pero a demanda).
  const rebuildResults = async (s) => {
    const nParticipants = Object.keys(s.participants || {}).length;
    if (!confirm(`¿Enviar los resultados de "${s.quizTitle}" (sala ${s.code}, ${nParticipants} participantes) al panel de Resultados?\n\nSi ya existían resultados de esta misma sala, se reemplazan.`)) return;
    setBusyId(s.id);
    try {
      const uid = window.QS.currentUser?.uid;
      if (!uid) throw new Error("No hay sesión activa");
      const quizDoc = await window.QS.db.collection("quizzes").doc(s.quizId).get();
      if (!quizDoc.exists) throw new Error("El quiz de esta sesión ya no existe, no es posible calificar.");
      const quiz = { id: quizDoc.id, ...quizDoc.data() };
      if (quiz.mode === "survey") throw new Error("Las encuestas no generan calificaciones. Usa el botón \"📋 Respuestas\" para verlas y descargarlas en CSV.");
      const participants = Object.values(s.participants || {});
      if (participants.length === 0) throw new Error("Esta sesión no tuvo participantes.");

      // Respuestas crudas de la sala
      const answersSnap = await window.QS.db.collection("liveSessions")
        .doc(s.id).collection("answers").get();
      const answersByParticipant = {};
      answersSnap.docs.forEach(d => {
        const a = d.data();
        if (!answersByParticipant[a.participantId]) answersByParticipant[a.participantId] = [];
        answersByParticipant[a.participantId].push(a);
      });

      // Evitar duplicados: borrar resultados previos de esta misma sala
      const prev = await window.QS.db.collection("results")
        .where("ownerId", "==", uid)
        .where("quizId", "==", s.quizId)
        .where("sessionCode", "==", s.code).get();

      const maxPoints = calculateMaxPoints(quiz);
      const today = new Date(s.createdAt || Date.now()).toISOString().slice(0, 10);
      const batch = window.QS.db.batch();
      prev.docs.forEach(d => batch.delete(d.ref));

      for (const p of participants) {
        const myAnswers = answersByParticipant[p.id] || [];
        const correctCount = myAnswers.filter(a => a.correct).length;
        const score = myAnswers.reduce((sum, a) => sum + (a.points || 0), 0);
        const grade = convertToGrade(score, maxPoints, quiz.gradingScale);
        const gradeDetail = quiz.questions
          .filter(q => q.type !== "slide")
          .map((q) => {
            const realIdx = quiz.questions.findIndex(qq => qq.id === q.id);
            const ans = myAnswers.find(a => a.questionIdx === realIdx);
            const accepted = (q.acceptedAnswers || []).map(a => String(a).toLowerCase().trim()).filter(Boolean);
            const needsReview = q.type === "text" && accepted.length === 0;
            return {
              qid: q.id,
              type: q.type,
              userAnswer: ans?.answer ?? null,
              correct: ans?.correct ?? false,
              points: ans?.points ?? 0,
              pointsMax: (q.pointsCorrect ?? 100) + (q.pointsSpeedBonus ?? 0),
              needsReview,
              reviewed: false,
            };
          });

        const resultData = {
          quizId: quiz.id,
          quizTitle: quiz.title || "Quiz",
          ownerId: uid,
          studentName: p.name || "Sin nombre",
          studentCourse: p.course || "Sin curso",
          examDate: today,
          mode: "live",
          sessionCode: s.code,
          answers: {},
          gradeDetail,
          correct: correctCount,
          total: quiz.questions.filter(q => q.type !== "slide").length,
          score: grade,
          percent: maxPoints > 0 ? Math.round((score / maxPoints) * 100) : 0,
          pointsEarned: score,
          pointsMax: maxPoints,
          submittedAt: Date.now(),
        };
        batch.set(window.QS.db.collection("results").doc(), resultData);
      }
      await batch.commit();
      alert(`✅ Listo: ${participants.length} resultado(s) de "${s.quizTitle}" enviados al panel de Resultados.`);
    } catch (err) {
      console.error("Error reconstruyendo resultados:", err);
      alert("No se pudo: " + err.message);
    }
    setBusyId(null);
  };

  if (loadingH) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 32, textAlign: "center", color: "var(--ink-500)" }}>
        Cargando historial de sesiones...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>🔴 Sesiones en vivo</h1>
          <p style={{ color: "var(--ink-500)" }}>
            Historial de salas jugadas. Los puntajes quedan guardados aunque la sala no se haya finalizado.
          </p>
        </div>
        <button onClick={onBack} className="qs-btn qs-btn--ghost">← Volver a Resultados</button>
      </div>

      {sessions.length === 0 ? (
        <div className="qs-card" style={{ padding: 40, textAlign: "center", color: "var(--ink-500)", marginTop: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          <p style={{ fontWeight: 600 }}>Aún no has jugado sesiones en vivo</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {sessions.map(s => {
            const ps = Object.values(s.participants || {})
              .map(p => ({ ...p, score: p.score || 0 }))
              .sort((a, b) => b.score - a.score);
            const st = STATUS_LABEL[s.status] || { txt: s.status, bg: "var(--ink-400)" };
            const open = openId === s.id;
            return (
              <div key={s.id} className="qs-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontFamily: "var(--font-display)", fontSize: 16 }}>
                      {s.quizTitle || "Quiz"}
                      <span style={{
                        marginLeft: 10, fontSize: 11, fontWeight: 700, color: "#fff",
                        background: st.bg, borderRadius: 999, padding: "3px 10px",
                        verticalAlign: "middle",
                      }}>{st.txt}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 4 }}>
                      Sala {s.code} · {new Date(s.createdAt || 0).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })} · {ps.length} participante{ps.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => setOpenId(open ? null : s.id)} className="qs-btn qs-btn--ghost qs-btn--sm">
                      {open ? "Ocultar ▲" : "Ver puntajes ▼"}
                    </button>
                    <button onClick={() => toggleDetail(s)} disabled={loadingDetail === s.id}
                      className="qs-btn qs-btn--ghost qs-btn--sm">
                      {loadingDetail === s.id ? "Cargando..." : (detail && detail.sessionId === s.id ? "📋 Ocultar respuestas" : "📋 Respuestas")}
                    </button>
                    {ps.length > 0 && (
                      <button onClick={() => rebuildResults(s)} disabled={busyId === s.id}
                        className="qs-btn qs-btn--primary qs-btn--sm">
                        {busyId === s.id ? "Enviando..." : "💾 Enviar a Resultados"}
                      </button>
                    )}
                  </div>
                </div>

                {detail && detail.sessionId === s.id && (
                  <div className="qs-fade-in" style={{ marginTop: 14, borderTop: "1px solid var(--ink-200)", paddingTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                      <button onClick={() => downloadCsv(s)} className="qs-btn qs-btn--success qs-btn--sm">
                        ⬇️ Descargar CSV (Excel)
                      </button>
                    </div>
                    {detail.quiz.questions.filter(q => q.type !== "slide").map((q, qi) => {
                      const realIdx = detail.quiz.questions.findIndex(qq => qq.id === q.id);
                      const qAnswers = detail.answers.filter(a => a.questionIdx === realIdx);
                      const hasOptions = (q.options && q.options.length) || q.type === "scale";
                      let dist = null;
                      if (hasOptions) {
                        const labels = q.type === "scale" ? (q.scaleLabels || SCALE_LABELS) : q.options.map(o => o.text);
                        const counts = labels.map(() => 0);
                        qAnswers.forEach(a => {
                          if (Array.isArray(a.answer)) {
                            a.answer.forEach(id => {
                              const oi = q.options.findIndex(o => o.id === id);
                              if (oi >= 0) counts[oi]++;
                            });
                          } else if (q.type === "scale") {
                            const idx = Number(a.answer);
                            if (!isNaN(idx) && idx >= 0 && idx < counts.length) counts[idx]++;
                          } else {
                            const oi = q.options.findIndex(o => o.id === a.answer);
                            if (oi >= 0) counts[oi]++;
                          }
                        });
                        const maxC = Math.max(1, ...counts);
                        dist = labels.map((lbl, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <div style={{ flex: "0 0 45%", fontSize: 12, color: "var(--ink-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lbl}</div>
                            <div style={{ flex: 1, height: 14, background: "var(--ink-100)", borderRadius: 7, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: (counts[i] / maxC) * 100 + "%", background: tileColor(i), borderRadius: 7, transition: "width .3s" }}/>
                            </div>
                            <div style={{ flex: "0 0 28px", fontSize: 12, fontWeight: 800, textAlign: "right", color: "var(--ink-700)" }}>{counts[i]}</div>
                          </div>
                        ));
                      }
                      return (
                        <div key={q.id} style={{ marginBottom: 16 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: "var(--ink-900)" }}>
                            <span style={{ color: "var(--violet-700)" }}>P{qi + 1}.</span> {q.text}
                          </div>
                          {dist ? dist : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                              {qAnswers.length === 0 ? (
                                <div style={{ fontSize: 12, color: "var(--ink-400)" }}>(sin respuestas)</div>
                              ) : qAnswers.map((a, ai) => {
                                const p = (s.participants || {})[a.participantId] || {};
                                return (
                                  <div key={ai} style={{ fontSize: 13, padding: "6px 10px", background: "var(--violet-50)", borderRadius: 8 }}>
                                    <span style={{ fontWeight: 800, color: "var(--violet-700)" }}>{p.name || "Anónimo"}: </span>
                                    {answerToText(q, a.answer)}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {open && (
                  <div className="qs-fade-in" style={{ marginTop: 14, borderTop: "1px solid var(--ink-200)", paddingTop: 12 }}>
                    {ps.length === 0 ? (
                      <div style={{ color: "var(--ink-400)", fontSize: 13 }}>Nadie alcanzó a entrar a esta sala.</div>
                    ) : ps.map((p, i) => (
                      <div key={p.id || i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "7px 10px", borderRadius: 10,
                        background: i % 2 === 0 ? "var(--ink-50)" : "transparent",
                      }}>
                        <div style={{ fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <span style={{ fontWeight: 800, color: "var(--violet-700)", marginRight: 8 }}>{i + 1}.</span>
                          {p.avatar ? p.avatar + " " : ""}{p.name || "Sin nombre"}
                          {p.course ? <span style={{ color: "var(--ink-400)", fontSize: 12 }}> · {p.course}</span> : null}
                        </div>
                        <div style={{ fontWeight: 800, color: "var(--ink-700)", flexShrink: 0 }}>{p.score} pts</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

window.QS.LiveSessionHost = LiveSessionHost;
window.QS.StudentJoinLive = StudentJoinLive;
window.QS.LiveHistoryPanel = LiveHistoryPanel;
