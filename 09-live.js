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
    const correct = q.pointsCorrect ?? 100;
    const bonus = q.pointsSpeedBonus ?? 0;
    return sum + correct + bonus;
  }, 0);
}

// Convertir puntos a nota usando la tabla del quiz
function convertToGrade(points, maxPoints, scale) {
  if (scale && Array.isArray(scale) && scale.length > 0) {
    for (const range of scale) {
      if (points >= range.from && points <= range.to) {
        return +(+range.grade).toFixed(2);
      }
    }
    const lastGrade = Math.max(...scale.map(r => r.grade));
    if (points > Math.max(...scale.map(r => r.to))) return +lastGrade.toFixed(2);
    const minGrade = Math.min(...scale.map(r => r.grade));
    return +minGrade.toFixed(2);
  }
  // Por defecto: escala colombiana 0-5 lineal
  if (maxPoints === 0) return 0;
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
  return false;
}

// ============================================================
// HOST LOBBY — el profe espera que entren los estudiantes
// ============================================================
function HostLobby({ session, quiz, onStart, onCancel }) {
  const participants = Object.values(session.participants || {})
    .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const baseUrl = window.location.origin + window.location.pathname;
  const joinUrl = `${baseUrl}?join=${session.code}`;
  const [copied, setCopied] = useStateL(false);

  const copyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
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

        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) 2fr", gap: 24, alignItems: "start" }}>
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
            <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 12, lineHeight: 1.5 }}>
              Los estudiantes deben ir a la app, hacer clic en <b>"Unirme a un quiz"</b> y escribir el código.
            </p>
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
                  : `🚀 Iniciar quiz con ${participants.length} ${participants.length === 1 ? "estudiante" : "estudiantes"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HOST QUESTION — el profe mira la pregunta en curso
// ============================================================
function HostQuestion({ session, quiz, currentQ, answersThisQ, totalParticipants, onSkip, onReveal, onAddTime, onFinish }) {
  const extraSeconds = session.extraSeconds || 0;
  const totalSeconds = (currentQ.timer || 20) + extraSeconds;
  const startedAt = session.questionStartedAt || Date.now();
  const [secondsLeft, setSecondsLeft] = useStateL(totalSeconds);

  useEffectL(() => {
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const left = Math.max(0, totalSeconds - elapsed);
      setSecondsLeft(left);
      if (left <= 0) {
        onReveal();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [startedAt, totalSeconds]);

  const answeredCount = Object.keys(answersThisQ || {}).length;
  const progress = totalParticipants > 0 ? (answeredCount / totalParticipants) * 100 : 0;
  const timeProgress = (secondsLeft / totalSeconds) * 100;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
      padding: 24, color: "white",
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
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
            transition: "width 0.2s linear",
          }} />
        </div>

        {/* Pregunta */}
        <div className="qs-card" style={{ padding: 32, marginBottom: 20, color: "var(--ink-900)" }}>
          <h1 style={{ fontSize: 32, textAlign: "center", marginBottom: 24, lineHeight: 1.3 }}>
            {currentQ.text}
          </h1>
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
        </div>

        {/* Estado */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
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
                ⏱️ +10s
              </button>
              <button onClick={onFinish} className="qs-btn" style={{
                background: "var(--red-500)", color: "white", fontWeight: 700,
                boxShadow: "0 4px 0 #991b1b",
              }}>
                🏁 Finalizar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HOST REVEAL — muestra la gráfica y la respuesta correcta
// ============================================================
function HostReveal({ session, quiz, currentQ, answersThisQ, onNext }) {
  const totalAnswers = Object.keys(answersThisQ || {}).length;
  // Conteo por opción
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
  const isLast = session.currentQuestionIdx >= quiz.questions.length - 1;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
      padding: 24, color: "white",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ opacity: 0.7, fontSize: 13 }}>Resultados — Pregunta {session.currentQuestionIdx + 1}</p>
          <h2 style={{ fontSize: 26, marginTop: 4 }}>{currentQ.text}</h2>
        </div>

        <div className="qs-card" style={{ padding: 28, marginBottom: 20, color: "var(--ink-900)" }}>
          <div style={{ display: "grid", gap: 12 }}>
            {(currentQ.options || []).map((opt, i) => {
              const colors = ["var(--tile-1)", "var(--tile-2)", "var(--tile-3)", "var(--tile-4)"];
              const count = optionCounts[opt.id] || 0;
              const widthPct = (count / maxCount) * 100;
              return (
                <div key={opt.id} className="qs-fade-in" style={{
                  position: "relative", display: "flex", alignItems: "center",
                  padding: 16, borderRadius: 12, background: opt.correct ? "var(--emerald-500)" : colors[i % 4],
                  color: "white", overflow: "hidden",
                  opacity: opt.correct || count > 0 ? 1 : 0.5,
                }}>
                  {/* Barra de fondo */}
                  <div style={{
                    position: "absolute", inset: 0, width: widthPct + "%",
                    background: "rgba(255,255,255,0.15)", transition: "width 0.6s ease",
                  }} />
                  <div style={{ position: "relative", display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 10 }}>
                      {opt.correct && <span style={{ fontSize: 22 }}>✓</span>}
                      {opt.text}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 20 }}>{count}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 16, padding: 12, background: "var(--ink-50)", borderRadius: 10, textAlign: "center", color: "var(--ink-700)", fontSize: 13 }}>
            <b>{totalAnswers}</b> respuestas totales
          </div>
        </div>

        <button onClick={onNext} className="qs-btn qs-btn--lg" style={{
          width: "100%", background: "white", color: "var(--violet-700)", fontWeight: 800, fontSize: 16,
        }}>
          {isLast ? "🏁 Ver ranking final" : "➡️ Siguiente pregunta"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// HOST FINAL — ranking final
// ============================================================
function HostFinal({ session, quiz, onFinish }) {
  const participants = Object.values(session.participants || {})
    .map(p => ({ ...p, score: p.score || 0 }))
    .sort((a, b) => b.score - a.score);
  const top3 = participants.slice(0, 3);
  const rest = participants.slice(3);

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
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
// LIVE SESSION HOST — orquestador del lado del profesor
// ============================================================
function LiveSessionHost({ quizId, onExit }) {
  const [loading, setLoading] = useStateL(true);
  const [session, setSession] = useStateL(null);
  const [quiz, setQuiz] = useStateL(null);
  const [answersByQuestion, setAnswersByQuestion] = useStateL({});
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
    if (!sessionIdRef.current) return;
    const unsub = window.QS.db.collection("liveSessions").doc(sessionIdRef.current)
      .onSnapshot(doc => {
        if (doc.exists) {
          setSession(s => ({ ...s, id: doc.id, ...doc.data() }));
        }
      }, err => console.error("Snapshot error:", err));
    return () => unsub();
  }, [sessionIdRef.current]);

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
  }, [session?.currentQuestionIdx]);

  // ---- Acciones ----
  const startQuiz = async () => {
    await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
      status: "playing",
      currentQuestionIdx: 0,
      questionStartedAt: Date.now(),
      startedAt: Date.now(),
      extraSeconds: 0,
    });
  };

  // Aumentar el tiempo de la pregunta actual (visible para host y estudiantes)
  const addTime = async (seconds = 10) => {
    await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
      extraSeconds: firebase.firestore.FieldValue.increment(seconds),
    });
  };

  // Finalizar el quiz inmediatamente desde cualquier pregunta
  const finishNow = async () => {
    if (!confirm("¿Finalizar el quiz ahora? Se guardarán los resultados con el puntaje actual.")) return;
    try {
      await saveLiveResults();
    } catch (err) {
      console.error("Error guardando resultados:", err);
    }
    await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
      status: "finished",
      finishedAt: Date.now(),
    });
  };

  const revealCurrent = async () => {
    await window.QS.db.collection("liveSessions").doc(sessionIdRef.current).update({
      status: "showResults",
      revealedAt: Date.now(),
    });
  };

  const goNext = async () => {
    const nextIdx = session.currentQuestionIdx + 1;
    if (nextIdx >= quiz.questions.length) {
      // Terminar: primero guardar resultados de cada participante
      try {
        await saveLiveResults();
      } catch (err) {
        console.error("Error guardando resultados:", err);
        // No bloqueamos la finalización aunque falle el guardado
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
      });
    }
  };

  // Guardar resultados de la sala en vivo en la colección 'results' (para panel y Excel)
  const saveLiveResults = async () => {
    const uid = window.QS.currentUser?.uid;
    if (!uid || !session || !quiz) return;
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
      const score = p.score || 0;
      const grade = convertToGrade(score, maxPoints, quiz.gradingScale);

      // Reconstruir gradeDetail compatible con el formato asincrónico
      const gradeDetail = quiz.questions.map((q, qIdx) => {
        const ans = myAnswers.find(a => a.questionIdx === qIdx);
        return {
          qid: q.id,
          type: q.type,
          userAnswer: ans?.answer ?? null,
          correct: ans?.correct ?? false,
          points: ans?.points ?? 0,
          pointsMax: (q.pointsCorrect ?? 100) + (q.pointsSpeedBonus ?? 0),
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
        total: quiz.questions.length,
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
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", color: "white" }}>
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
    return <HostLobby session={session} quiz={quiz} onStart={startQuiz} onCancel={cancelSession} />;
  }
  if (session.status === "playing") {
    return <HostQuestion
      session={session} quiz={quiz} currentQ={currentQ}
      answersThisQ={answersThisQ} totalParticipants={participants.length}
      onReveal={revealCurrent} onSkip={revealCurrent}
      onAddTime={() => addTime(10)} onFinish={finishNow}
    />;
  }
  if (session.status === "showResults") {
    return <HostReveal session={session} quiz={quiz} currentQ={currentQ}
      answersThisQ={answersThisQ} onNext={goNext} />;
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
    console.log("[QS reconectar] código:", roomCode, "guardado:", saved);
    if (!saved || !saved.sessionId || !saved.participantId) {
      console.log("[QS reconectar] no hay datos guardados para este código");
      return false;
    }
    try {
      const doc = await window.QS.db.collection("liveSessions").doc(saved.sessionId).get();
      if (!doc.exists) {
        console.log("[QS reconectar] la sesión guardada ya no existe en Firestore");
        clearLiveSession(roomCode); return false;
      }
      const sessionData = { id: doc.id, ...doc.data() };
      console.log("[QS reconectar] sesión encontrada, status:", sessionData.status);
      // La sala debe seguir viva y el participante debe seguir registrado
      if (sessionData.status === "cancelled" || sessionData.status === "finished") {
        console.log("[QS reconectar] la sala ya terminó/canceló");
        clearLiveSession(roomCode);
        return false;
      }
      if (!sessionData.participants || !sessionData.participants[saved.participantId]) {
        console.log("[QS reconectar] el participante ya no está en la sala:", saved.participantId);
        clearLiveSession(roomCode);
        return false;
      }
      // Cargar el quiz para entregárselo a StudentLive
      const quizDoc = await window.QS.db.collection("quizzes").doc(sessionData.quizId).get();
      if (!quizDoc.exists) {
        console.log("[QS reconectar] el quiz asociado ya no existe");
        clearLiveSession(roomCode); return false;
      }
      console.log("[QS reconectar] ✅ reconexión exitosa");
      setSession(sessionData);
      setParticipantId(saved.participantId);
      setName(saved.name || "");
      setCourse(saved.course || "");
      setQuiz({ id: quizDoc.id, ...quizDoc.data() });
      setStep("live");
      return true;
    } catch (e) {
      console.error("[QS reconectar] error:", e);
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
      console.log("[QS guardar] guardando sesión para código:", session.code, "pid:", pid);
      saveLiveSession(session.code, {
        sessionId: session.id,
        participantId: pid,
        name: name.trim(),
        course: course.trim(),
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
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
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
  const [myAciertos, setMyAciertos] = useStateL(null);
  const myScore = (session?.participants?.[participantId]?.score) || 0;

  // Cuando la sala termina o se cancela, borrar la sesión guardada para que
  // una futura sala con el mismo código no intente reconectar a esta.
  useEffectL(() => {
    if (session?.status === "finished" || session?.status === "cancelled") {
      if (session.code) clearLiveSession(session.code);
    }
  }, [session?.status]);

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

  // Reset al cambiar de pregunta
  useEffectL(() => {
    if (!session) return;
    if (session.currentQuestionIdx !== answeredAtIdx) {
      setMyAnswer(null);
      setMyResultThisQ(null);
    }
  }, [session?.currentQuestionIdx]);

  // Cronómetro
  useEffectL(() => {
    if (!session || session.status !== "playing") return;
    const currentQ = quiz.questions[session.currentQuestionIdx];
    if (!currentQ) return;
    const totalSec = (currentQ.timer || 20) + (session.extraSeconds || 0);
    const startedAt = session.questionStartedAt || Date.now();
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSecondsLeft(Math.max(0, totalSec - elapsed));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [session?.questionStartedAt, session?.status, session?.extraSeconds]);

  // El resultado del reveal se calcula directamente en el render desde
  // myResultThisQ (guardado en memoria al responder). No usamos efecto ni
  // relectura de Firestore para evitar parpadeos y problemas de timing.

  const submitAnswer = async (answer) => {
    if (!session || session.status !== "playing") return;
    if (answeredAtIdx === session.currentQuestionIdx) return;
    const qIdx = session.currentQuestionIdx;
    const currentQ = quiz.questions[qIdx];
    const totalSec = currentQ.timer || 20;
    const startedAt = session.questionStartedAt || Date.now();
    const secondsTaken = (Date.now() - startedAt) / 1000;
    const isCorrect = checkAnswer(currentQ, answer);
    const points = calculatePoints(currentQ, isCorrect, secondsTaken, totalSec);

    setMyAnswer(answer);
    setAnsweredAtIdx(qIdx);
    setMyResultThisQ({ correct: isCorrect, points });

    try {
      // Si ya había respondido esta pregunta (p. ej. respondió, recargó y
      // volvió a responder), no sumamos el puntaje otra vez.
      const docId = `${participantId}-${qIdx}`;
      const answerRef = window.QS.db.collection("liveSessions").doc(sessionId)
        .collection("answers").doc(docId);
      const existing = await answerRef.get();
      const alreadyScored = existing.exists;

      // Guardar (o sobrescribir) la respuesta
      await answerRef.set({
        participantId, questionIdx: qIdx, answer,
        correct: isCorrect, points,
        secondsTaken, answeredAt: Date.now(),
      });

      // Actualizar puntaje solo la primera vez que responde esta pregunta
      // (permite valores negativos para penalizar)
      if (!alreadyScored && points !== 0) {
        const scoreKey = `participants.${participantId}.score`;
        await window.QS.db.collection("liveSessions").doc(sessionId).update({
          [scoreKey]: firebase.firestore.FieldValue.increment(points),
        });
      }
    } catch (err) {
      console.error("Error enviando respuesta:", err);
    }
  };

  // ----- Render -----
  if (!session) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", color: "white" }}>
        <p>Conectando...</p>
      </div>
    );
  }

  if (session.status === "cancelled") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", color: "white", padding: 20 }}>
        <div className="qs-card" style={{ padding: 24, textAlign: "center", color: "var(--ink-900)" }}>
          <p style={{ fontSize: 32 }}>🚫</p>
          <p>El profesor canceló la sala.</p>
          <button onClick={onExit} className="qs-btn qs-btn--primary" style={{ marginTop: 12 }}>Salir</button>
        </div>
      </div>
    );
  }

  if (session.status === "lobby") {
    const me = session.participants?.[participantId];
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", color: "white", padding: 20,
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
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", padding: 20,
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
    // Resultado tomado directamente de memoria: respondió esta pregunta o no.
    const answeredThis = answeredAtIdx === session.currentQuestionIdx && myResultThisQ;
    const reveal = answeredThis ? myResultThisQ : { noAnswer: true };
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", padding: 20,
      }}>
        <div className="qs-card" style={{ padding: 28, textAlign: "center", maxWidth: 420, width: "100%" }}>
          {reveal.noAnswer ? (
            <>
              <div style={{ fontSize: 56, marginBottom: 8 }}>⏰</div>
              <h2 style={{ fontSize: 22, marginBottom: 8 }}>Se acabó el tiempo</h2>
              <p style={{ color: "var(--ink-500)", marginBottom: 16 }}>No alcanzaste a responder</p>
            </>
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
          <div style={{
            padding: 14, background: "var(--violet-50)", borderRadius: 10,
            marginTop: 16,
          }}>
            <p style={{ fontSize: 12, color: "var(--violet-700)", fontWeight: 600 }}>TU PUNTAJE</p>
            <p style={{ fontSize: 28, fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--violet-700)" }}>
              {myScore} pts
            </p>
          </div>
          <p style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 16 }}>
            {isLast ? "Esperando ranking final..." : "Esperando siguiente pregunta..."}
          </p>
        </div>
      </div>
    );
  }

  // === Pregunta en curso ===
  if (session.status === "playing") {
    const haveAnswered = answeredAtIdx === session.currentQuestionIdx;
    const colors = ["var(--tile-1)", "var(--tile-2)", "var(--tile-3)", "var(--tile-4)"];

    if (haveAnswered) {
      return (
        <div style={{
          minHeight: "100vh", display: "grid", placeItems: "center",
          background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", padding: 20,
        }}>
          <div className="qs-card" style={{ padding: 32, textAlign: "center", maxWidth: 380 }}>
            <div style={{ fontSize: 56, marginBottom: 12 }} className="qs-bob">⏳</div>
            <h2 style={{ fontSize: 22, marginBottom: 8 }}>¡Respuesta enviada!</h2>
            <p style={{ color: "var(--ink-500)" }}>Esperando que terminen los demás...</p>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <div style={{
                flex: 1, padding: 14, background: "var(--ink-50)", borderRadius: 10,
              }}>
                <p style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>TIEMPO</p>
                <p style={{ fontSize: 24, fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--ink-700)" }}>
                  {Math.ceil(secondsLeft)}s
                </p>
              </div>
              <div style={{
                flex: 1, padding: 14, background: "var(--violet-50)", borderRadius: 10,
              }}>
                <p style={{ fontSize: 12, color: "var(--violet-700)", fontWeight: 600 }}>TU PUNTAJE</p>
                <p style={{ fontSize: 24, fontFamily: "var(--font-display)", fontWeight: 800, color: "var(--violet-700)" }}>
                  {myScore} pts
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
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
        padding: 16, paddingBottom: 24,
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            color: "white", marginBottom: 12,
          }}>
            <span style={{ fontWeight: 600 }}>Pregunta {session.currentQuestionIdx + 1} / {quiz.questions.length}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                background: "rgba(255,255,255,0.18)", color: "white", padding: "6px 12px",
                borderRadius: 10, fontWeight: 700, fontSize: 14,
              }}>⭐ {myScore} pts</span>
              <span style={{
                background: "white",
                color: secondsLeft < 5 ? "var(--red-500)" : "var(--violet-700)",
                padding: "6px 14px",
                borderRadius: 10, fontWeight: 800, fontFamily: "var(--font-display)",
              }}>{Math.ceil(secondsLeft)}s</span>
            </div>
          </div>

          <div className="qs-card" style={{ padding: 20, marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, lineHeight: 1.4 }}>{currentQ.text}</h2>
          </div>

          {(currentQ.type === "multi" || currentQ.type === "truefalse") && (
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

function TextAnswer({ onSubmit }) {
  const [text, setText] = useStateL("");
  return (
    <>
      <input
        type="text" className="qs-input" autoFocus
        placeholder="Escribe tu respuesta..."
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

// Exponer globalmente
window.QS.LiveSessionHost = LiveSessionHost;
window.QS.StudentJoinLive = StudentJoinLive;
