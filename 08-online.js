/* global React, I */
// ============================================================
// QuizSpark — Evaluación Online (estudiantes sin login)
// Componentes:
//   - PublishModal: modal del profesor para publicar/cerrar quiz
//   - StudentExam: pantalla del estudiante (sin login)
//   - OnlineResultsPanel: panel del profesor para ver respuestas
// ============================================================
const { useState: useStateO, useEffect: useEffectO } = React;

// ---------- Helpers ----------
function generateShortCode() {
  // Código de 6 caracteres alfanuméricos en mayúsculas
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O, 0, I, 1 para evitar confusión
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Calcula la nota de una entrega
function gradeSubmission(quiz, answers) {
  let correct = 0;
  let total = 0;
  let pointsEarned = 0;
  let pointsMax = 0;
  const detail = [];

  for (const q of quiz.questions) {
    total++;
    const userAnswer = answers[q.id];
    let isCorrect = false;

    if (q.type === "multi" || q.type === "truefalse") {
      const correctOpt = (q.options || []).find(o => o.correct);
      isCorrect = correctOpt && userAnswer === correctOpt.id;
    } else if (q.type === "checks") {
      const correctIds = (q.options || []).filter(o => o.correct).map(o => o.id).sort();
      const userIds = Array.isArray(userAnswer) ? [...userAnswer].sort() : [];
      isCorrect = JSON.stringify(correctIds) === JSON.stringify(userIds);
    } else if (q.type === "text") {
      const accepted = (q.acceptedAnswers || []).map(a => a.toLowerCase().trim());
      const user = (userAnswer || "").toLowerCase().trim();
      isCorrect = accepted.includes(user);
    }

    // Puntos personalizados (con defaults para quizzes viejos)
    const pCorrect = q.pointsCorrect ?? 100;
    const pWrong = q.pointsWrong ?? 0;
    const pBonus = q.pointsSpeedBonus ?? 0;

    // En modo asincrónico no aplicamos bonus de velocidad
    const pointsForThisQuestion = isCorrect ? pCorrect : (userAnswer != null ? pWrong : 0);
    const maxForThisQuestion = pCorrect + pBonus; // máximo posible incluyendo bonus

    pointsEarned += pointsForThisQuestion;
    pointsMax += maxForThisQuestion;

    if (isCorrect) correct++;
    detail.push({
      qid: q.id, type: q.type, userAnswer, correct: isCorrect,
      points: pointsForThisQuestion, pointsMax: maxForThisQuestion,
    });
  }

  // Convertir a nota usando la tabla del quiz (o escala lineal por defecto)
  const grade = convertPointsToGrade(pointsEarned, pointsMax, quiz.gradingScale);
  const percent = pointsMax > 0 ? Math.round((pointsEarned / pointsMax) * 100) : 0;

  return {
    correct, total,
    score: grade,
    percent,
    pointsEarned, pointsMax,
    detail,
  };
}

// Convertir puntos obtenidos a nota según la tabla de conversión del quiz
function convertPointsToGrade(points, maxPoints, scale) {
  // Si hay tabla definida, usarla
  if (scale && Array.isArray(scale) && scale.length > 0) {
    // Buscar el rango donde caen los puntos
    for (const range of scale) {
      if (points >= range.from && points <= range.to) {
        return +(+range.grade).toFixed(2);
      }
    }
    // Si está por encima del último rango definido, dar la nota más alta
    const lastGrade = Math.max(...scale.map(r => r.grade));
    if (points > Math.max(...scale.map(r => r.to))) return +lastGrade.toFixed(2);
    // Si está por debajo, dar la nota más baja
    const minGrade = Math.min(...scale.map(r => r.grade));
    return +minGrade.toFixed(2);
  }
  // Por defecto: escala colombiana 0-5 lineal
  if (maxPoints === 0) return 0;
  const ratio = Math.max(0, Math.min(1, points / maxPoints));
  return +(ratio * 5).toFixed(2);
}

// =================== PUBLISH MODAL ===================
function PublishModal({ quiz, onClose, onPublished }) {
  const [loading, setLoading] = useStateO(false);
  const [publishedCode, setPublishedCode] = useStateO(quiz.publishCode || null);
  const [isOpen, setIsOpen] = useStateO(quiz.isPublished || false);
  const [shuffleQ, setShuffleQ] = useStateO(quiz.shuffleQuestions || false);
  const [shuffleO, setShuffleO] = useStateO(quiz.shuffleOptions || false);
  const [copied, setCopied] = useStateO(false);

  const baseUrl = window.location.origin + window.location.pathname;
  const studentUrl = publishedCode ? `${baseUrl}?exam=${publishedCode}` : "";

  const handlePublish = async () => {
    setLoading(true);
    try {
      const code = publishedCode || generateShortCode();
      const updates = {
        isPublished: true,
        publishCode: code,
        publishedAt: Date.now(),
        shuffleQuestions: shuffleQ,
        shuffleOptions: shuffleO,
      };
      await window.QS.db.collection("quizzes").doc(quiz.id).update(updates);
      setPublishedCode(code);
      setIsOpen(true);
      if (onPublished) onPublished({ ...quiz, ...updates });
    } catch (err) {
      alert("Error al publicar: " + err.message);
    }
    setLoading(false);
  };

  const handleClose = async () => {
    if (!confirm("¿Cerrar el quiz? Los estudiantes ya no podrán responder, pero las respuestas existentes se conservan.")) return;
    setLoading(true);
    try {
      await window.QS.db.collection("quizzes").doc(quiz.id).update({
        isPublished: false,
        closedAt: Date.now(),
      });
      setIsOpen(false);
      if (onPublished) onPublished({ ...quiz, isPublished: false });
    } catch (err) {
      alert("Error al cerrar: " + err.message);
    }
    setLoading(false);
  };

  const handleReopen = async () => {
    setLoading(true);
    try {
      await window.QS.db.collection("quizzes").doc(quiz.id).update({
        isPublished: true,
        reopenedAt: Date.now(),
        shuffleQuestions: shuffleQ,
        shuffleOptions: shuffleO,
      });
      setIsOpen(true);
      if (onPublished) onPublished({ ...quiz, isPublished: true });
    } catch (err) {
      alert("Error al reabrir: " + err.message);
    }
    setLoading(false);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(studentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "grid", placeItems: "center", zIndex: 100, padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--white)", borderRadius: 20, padding: 32,
        maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 22, marginBottom: 4 }}>🌐 Publicar evaluación online</h2>
            <p style={{ color: "var(--ink-500)", fontSize: 14 }}>
              Comparte un enlace para que los estudiantes respondan sin necesidad de cuenta.
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 24, color: "var(--ink-500)",
          }}>×</button>
        </div>

        {!publishedCode ? (
          // --- Vista: aún no publicado ---
          <>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10, color: "var(--ink-700)" }}>Opciones de la evaluación</h3>
              <label style={{
                display: "flex", alignItems: "center", gap: 10, padding: 12,
                background: "var(--ink-50)", borderRadius: 10, marginBottom: 8, cursor: "pointer",
              }}>
                <input type="checkbox" checked={shuffleQ} onChange={e => setShuffleQ(e.target.checked)} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Mezclar orden de preguntas</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Cada estudiante verá las preguntas en orden distinto</div>
                </div>
              </label>
              <label style={{
                display: "flex", alignItems: "center", gap: 10, padding: 12,
                background: "var(--ink-50)", borderRadius: 10, cursor: "pointer",
              }}>
                <input type="checkbox" checked={shuffleO} onChange={e => setShuffleO(e.target.checked)} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Mezclar orden de opciones</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Para preguntas de opción múltiple</div>
                </div>
              </label>
            </div>

            <div style={{
              background: "var(--violet-50)", border: "1px solid var(--violet-200)",
              borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 13, color: "var(--violet-700)",
            }}>
              ℹ️ Al publicar se generará un enlace único. Los estudiantes podrán responder
              hasta que tú cierres el quiz manualmente.
            </div>

            <button
              className="qs-btn qs-btn--primary qs-btn--lg"
              style={{ width: "100%" }}
              onClick={handlePublish}
              disabled={loading}
            >
              {loading ? "Publicando..." : "🌐 Publicar y generar enlace"}
            </button>
          </>
        ) : (
          // --- Vista: ya publicado ---
          <>
            <div style={{
              padding: 16, borderRadius: 12, marginBottom: 16,
              background: isOpen ? "#d1fae5" : "#fee2e2",
              color: isOpen ? "#065f46" : "#991b1b",
              fontWeight: 600, fontSize: 14, textAlign: "center",
            }}>
              {isOpen ? "✅ Quiz abierto: los estudiantes pueden responder" : "🚫 Quiz cerrado: nadie puede responder"}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--ink-700)" }}>
                Código de la evaluación
              </div>
              <div style={{
                background: "var(--violet-600)", color: "var(--white)", padding: "16px 20px",
                borderRadius: 12, fontFamily: "var(--font-display)", fontSize: 32,
                fontWeight: 800, textAlign: "center", letterSpacing: "0.15em", marginBottom: 12,
              }}>
                {publishedCode}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--ink-700)" }}>
                Enlace directo para estudiantes
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text" readOnly value={studentUrl}
                  className="qs-input"
                  style={{ flex: 1, fontSize: 12 }}
                  onClick={e => e.target.select()}
                />
                <button onClick={copyLink} className="qs-btn qs-btn--primary qs-btn--sm">
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 6 }}>
                Compártelo por WhatsApp, classroom, correo o el medio que prefieras.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              {isOpen ? (
                <button
                  onClick={handleClose} disabled={loading}
                  className="qs-btn qs-btn--lg"
                  style={{
                    flex: 1, background: "var(--red-500)", color: "white",
                    boxShadow: "0 4px 0 #991b1b",
                  }}
                >
                  🔒 Cerrar quiz
                </button>
              ) : (
                <button
                  onClick={handleReopen} disabled={loading}
                  className="qs-btn qs-btn--success qs-btn--lg"
                  style={{ flex: 1 }}
                >
                  🔓 Reabrir quiz
                </button>
              )}
              <button onClick={onClose} className="qs-btn qs-btn--ghost qs-btn--lg" style={{ flex: 1 }}>
                Listo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// =================== STUDENT EXAM (sin login) ===================
function StudentExam({ examCode }) {
  const [phase, setPhase] = useStateO("loading"); // loading | identify | exam | submitting | done | error
  const [errorMsg, setErrorMsg] = useStateO("");
  const [quiz, setQuiz] = useStateO(null);
  const [studentName, setStudentName] = useStateO("");
  const [studentCourse, setStudentCourse] = useStateO("");
  const [examDate, setExamDate] = useStateO(new Date().toISOString().slice(0, 10));
  const [questionsOrder, setQuestionsOrder] = useStateO([]); // preguntas (posiblemente mezcladas)
  const [currentIdx, setCurrentIdx] = useStateO(0);
  const [answers, setAnswers] = useStateO({});
  const [startedAt, setStartedAt] = useStateO(null);
  const [result, setResult] = useStateO(null);

  // Cargar quiz al montar
  useEffectO(() => {
    const load = async () => {
      try {
        const snap = await window.QS.db.collection("quizzes")
          .where("publishCode", "==", examCode).limit(1).get();
        if (snap.empty) {
          setErrorMsg("No se encontró ninguna evaluación con ese código.");
          setPhase("error");
          return;
        }
        const doc = snap.docs[0];
        const data = { id: doc.id, ...doc.data() };
        if (!data.isPublished) {
          setErrorMsg("Esta evaluación está cerrada. Contacta a tu profesor.");
          setPhase("error");
          return;
        }
        // Preparar preguntas (con posible mezclado)
        let qs = [...(data.questions || [])];
        if (data.shuffleQuestions) qs = shuffle(qs);
        if (data.shuffleOptions) {
          qs = qs.map(q => q.options ? { ...q, options: shuffle(q.options) } : q);
        }
        setQuiz(data);
        setQuestionsOrder(qs);
        setPhase("identify");
      } catch (err) {
        console.error(err);
        setErrorMsg("Error al cargar la evaluación: " + err.message);
        setPhase("error");
      }
    };
    load();
  }, [examCode]);

  const handleStart = () => {
    if (!studentName.trim() || !studentCourse.trim() || !examDate) {
      alert("Por favor completa todos los campos.");
      return;
    }
    setStartedAt(Date.now());
    setPhase("exam");
  };

  const setAnswer = (qid, value) => {
    setAnswers(a => ({ ...a, [qid]: value }));
  };

  const handleNext = () => {
    if (currentIdx < questionsOrder.length - 1) {
      setCurrentIdx(currentIdx + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const handleSubmit = async () => {
    setPhase("submitting");
    try {
      const finishedAt = Date.now();
      const totalSeconds = Math.round((finishedAt - startedAt) / 1000);
      const grade = gradeSubmission(quiz, answers);
      const submission = {
        quizId: quiz.id,
        ownerId: quiz.ownerId,
        studentName: studentName.trim(),
        studentCourse: studentCourse.trim(),
        examDate,
        answers,
        gradeDetail: grade.detail,
        correct: grade.correct,
        total: grade.total,
        score: grade.score,
        percent: grade.percent,
        pointsEarned: grade.pointsEarned || 0,
        pointsMax: grade.pointsMax || 0,
        startedAt,
        finishedAt,
        totalSeconds,
        submittedAt: Date.now(),
      };
      await window.QS.db.collection("results").add(submission);
      setResult(grade);
      setPhase("done");
    } catch (err) {
      console.error(err);
      alert("Error al enviar la evaluación: " + err.message);
      setPhase("exam");
    }
  };

  // ---------- Render por fase ----------
  if (phase === "loading") {
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", color: "white",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⚡</div>
          <p>Cargando evaluación...</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", padding: 20,
      }}>
        <div className="qs-card" style={{ padding: 32, maxWidth: 440, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>No se puede acceder</h2>
          <p style={{ color: "var(--ink-500)", marginBottom: 20 }}>{errorMsg}</p>
          <button className="qs-btn qs-btn--ghost" onClick={() => window.location.href = baseUrlNoQuery()}>
            Ir al inicio
          </button>
        </div>
      </div>
    );
  }

  if (phase === "identify") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
        display: "grid", placeItems: "center", padding: 20,
      }}>
        <div className="qs-card" style={{ padding: 32, maxWidth: 460, width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📝</div>
            <h2 style={{ fontSize: 24, marginBottom: 4 }}>{quiz.title}</h2>
            <p style={{ color: "var(--ink-500)", fontSize: 14 }}>
              {questionsOrder.length} {questionsOrder.length === 1 ? "pregunta" : "preguntas"}
            </p>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              Nombre completo
            </label>
            <input
              type="text" className="qs-input"
              placeholder="Ana María Pérez"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              Curso
            </label>
            <input
              type="text" className="qs-input"
              placeholder="Ej: 10A, 11B, Filosofía Once..."
              value={studentCourse}
              onChange={e => setStudentCourse(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              Fecha
            </label>
            <input
              type="date" className="qs-input"
              value={examDate}
              onChange={e => setExamDate(e.target.value)}
            />
          </div>

          <button
            className="qs-btn qs-btn--primary qs-btn--lg"
            style={{ width: "100%" }}
            onClick={handleStart}
          >
            Comenzar evaluación →
          </button>
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div style={{
        minHeight: "100vh", display: "grid", placeItems: "center",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))", color: "white",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>📤</div>
          <p>Enviando tus respuestas...</p>
        </div>
      </div>
    );
  }

  if (phase === "done") {
    const passing = result.score >= 3.0;
    return (
      <div style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
        display: "grid", placeItems: "center", padding: 20,
      }}>
        <div className="qs-card" style={{ padding: 32, maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>
            {passing ? "🎉" : "📋"}
          </div>
          <h2 style={{ fontSize: 24, marginBottom: 4 }}>¡Evaluación enviada!</h2>
          <p style={{ color: "var(--ink-500)", fontSize: 14, marginBottom: 20 }}>
            Gracias, {studentName}. Tus respuestas se guardaron correctamente.
          </p>

          {/* Aciertos */}
          <div style={{
            background: "var(--ink-50)", padding: 16, borderRadius: 12, marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, color: "var(--ink-500)", fontWeight: 600 }}>Aciertos</div>
            <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-display)" }}>
              {result.correct} de {result.total}
              <span style={{ fontSize: 14, color: "var(--ink-500)", fontWeight: 600 }}> ({result.percent}%)</span>
            </div>
          </div>

          {/* Puntaje */}
          <div style={{
            background: "var(--violet-50)", padding: 16, borderRadius: 12, marginBottom: 12,
          }}>
            <div style={{ fontSize: 13, color: "var(--violet-700)", fontWeight: 600 }}>Puntaje obtenido</div>
            <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--violet-700)" }}>
              {result.pointsEarned}
              <span style={{ fontSize: 16, opacity: 0.7 }}> / {result.pointsMax}</span>
            </div>
          </div>

          {/* Nota convertida */}
          <div style={{
            background: passing ? "#d1fae5" : "#fef3c7",
            color: passing ? "#065f46" : "#92400e",
            padding: 24, borderRadius: 16, marginBottom: 16,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>TU NOTA</div>
            <div style={{ fontSize: 56, fontWeight: 800, fontFamily: "var(--font-display)", lineHeight: 1 }}>
              {result.score.toFixed(1)}
            </div>
          </div>

          <p style={{ fontSize: 12, color: "var(--ink-500)" }}>
            Tu profesor podrá ver el detalle de tus respuestas.
          </p>
        </div>
      </div>
    );
  }

  // === phase === "exam" ===
  const q = questionsOrder[currentIdx];
  const totalQ = questionsOrder.length;
  const progress = ((currentIdx + 1) / totalQ) * 100;
  const userAnswer = answers[q.id];
  const isAnswered = q.type === "checks"
    ? Array.isArray(userAnswer) && userAnswer.length > 0
    : userAnswer !== undefined && userAnswer !== "";

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
      padding: "12px 10px 100px",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        {/* Header con progreso */}
        <div style={{
          background: "rgba(255,255,255,0.15)", padding: "12px 20px", borderRadius: 12,
          marginBottom: 16, color: "white", display: "flex", justifyContent: "space-between",
          alignItems: "center", flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ fontWeight: 600 }}>
            {studentName} · {studentCourse}
          </div>
          <div style={{ fontSize: 14 }}>
            Pregunta {currentIdx + 1} de {totalQ}
          </div>
        </div>

        {/* Barra de progreso */}
        <div style={{
          height: 6, background: "rgba(255,255,255,0.2)", borderRadius: 3, marginBottom: 24, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: progress + "%",
            background: "linear-gradient(90deg, var(--amber-400), var(--emerald-400))",
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Pregunta */}
        <div className="qs-card qs-fade-in" key={q.id} style={{ padding: 28, marginBottom: 16 }}>
          <h2 style={{ fontSize: 22, marginBottom: 20, lineHeight: 1.4 }}>
            {q.text}
          </h2>

          {/* Multi (una correcta) */}
          {q.type === "multi" && (
            <div style={{ display: "grid", gap: 10 }}>
              {(q.options || []).map(opt => {
                const selected = userAnswer === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setAnswer(q.id, opt.id)}
                    style={{
                      padding: 16, borderRadius: 12, textAlign: "left",
                      background: selected ? "var(--violet-100)" : "var(--white)",
                      border: "2px solid " + (selected ? "var(--violet-600)" : "var(--ink-200)"),
                      fontSize: 15, fontWeight: 600, cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >{opt.text}</button>
                );
              })}
            </div>
          )}

          {/* True/False */}
          {q.type === "truefalse" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(q.options || []).map(opt => {
                const selected = userAnswer === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setAnswer(q.id, opt.id)}
                    style={{
                      padding: "20px 16px", borderRadius: 12,
                      background: selected ? "var(--violet-100)" : "var(--white)",
                      border: "2px solid " + (selected ? "var(--violet-600)" : "var(--ink-200)"),
                      fontSize: 16, fontWeight: 700, cursor: "pointer",
                    }}
                  >{opt.text}</button>
                );
              })}
            </div>
          )}

          {/* Checks (varias correctas) */}
          {q.type === "checks" && (
            <div>
              <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 10 }}>
                Selecciona todas las que apliquen
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                {(q.options || []).map(opt => {
                  const arr = Array.isArray(userAnswer) ? userAnswer : [];
                  const selected = arr.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      onClick={() => {
                        const next = selected ? arr.filter(x => x !== opt.id) : [...arr, opt.id];
                        setAnswer(q.id, next);
                      }}
                      style={{
                        padding: 14, borderRadius: 12, textAlign: "left",
                        background: selected ? "var(--violet-100)" : "var(--white)",
                        border: "2px solid " + (selected ? "var(--violet-600)" : "var(--ink-200)"),
                        fontSize: 15, fontWeight: 600, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 10,
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: 6,
                        border: "2px solid " + (selected ? "var(--violet-600)" : "var(--ink-300)"),
                        background: selected ? "var(--violet-600)" : "transparent",
                        display: "grid", placeItems: "center", color: "white", fontSize: 14,
                      }}>{selected ? "✓" : ""}</span>
                      {opt.text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Texto */}
          {q.type === "text" && (
            <input
              type="text" className="qs-input"
              placeholder="Escribe tu respuesta..."
              value={userAnswer || ""}
              onChange={e => setAnswer(q.id, e.target.value)}
              style={{ fontSize: 16 }}
            />
          )}
        </div>

        {/* Navegación */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handlePrev}
            disabled={currentIdx === 0}
            className="qs-btn qs-btn--lg"
            style={{
              flex: 1, background: "rgba(255,255,255,0.2)", color: "white",
              opacity: currentIdx === 0 ? 0.5 : 1,
            }}
          >← Anterior</button>
          <button
            onClick={handleNext}
            disabled={!isAnswered}
            className="qs-btn qs-btn--lg"
            style={{
              flex: 2, background: "var(--white)", color: "var(--violet-700)",
              fontWeight: 700, opacity: !isAnswered ? 0.5 : 1,
            }}
          >
            {currentIdx < totalQ - 1 ? "Siguiente →" : "Enviar evaluación ✓"}
          </button>
        </div>
      </div>
    </div>
  );
}

function baseUrlNoQuery() {
  return window.location.origin + window.location.pathname;
}

// =================== ONLINE RESULTS PANEL ===================
function OnlineResultsPanel({ onBack }) {
  const [quizzes, setQuizzes] = useStateO([]);
  const [selectedQuizId, setSelectedQuizId] = useStateO(null);
  const [submissions, setSubmissions] = useStateO([]);
  const [loading, setLoading] = useStateO(true);
  const [filterCourse, setFilterCourse] = useStateO("");
  const [filterDate, setFilterDate] = useStateO("");
  const [viewMode, setViewMode] = useStateO("tabla"); // "tabla" | "respuestas"
  const [expandedRow, setExpandedRow] = useStateO(null);

  // Cargar quizzes propios al montar
  useEffectO(() => {
    const load = async () => {
      try {
        const uid = window.QS.currentUser?.uid;
        const snap = await window.QS.db.collection("quizzes")
          .where("ownerId", "==", uid).get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setQuizzes(list);
        if (list.length > 0) setSelectedQuizId(list[0].id);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Cargar submissions cuando cambia quiz seleccionado
  useEffectO(() => {
    if (!selectedQuizId) return;
    const load = async () => {
      try {
        const snap = await window.QS.db.collection("results")
          .where("quizId", "==", selectedQuizId).get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        setSubmissions(list);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, [selectedQuizId]);

  const selectedQuiz = quizzes.find(q => q.id === selectedQuizId);
  const [showDuplicates, setShowDuplicates] = useStateO(false);

  // Filtros
  const filtered = submissions.filter(s => {
    if (filterCourse && !s.studentCourse.toLowerCase().includes(filterCourse.toLowerCase())) return false;
    if (filterDate && s.examDate !== filterDate) return false;
    return true;
  });

  // Deduplicación: mismo nombre + mismo curso → quedarse con el más reciente
  const deduplicated = (() => {
    const seen = {};
    const dupes = [];
    const unique = [];
    // Ordenar por fecha más reciente primero
    const sorted = [...filtered].sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    for (const s of sorted) {
      const key = (s.studentName || "").trim().toLowerCase() + "||" + (s.studentCourse || "").trim().toLowerCase();
      if (seen[key]) {
        dupes.push(s); // duplicado, lo marcamos
      } else {
        seen[key] = true;
        unique.push(s);
      }
    }
    return { unique, dupes, hasDupes: dupes.length > 0 };
  })();

  const displayList = showDuplicates ? filtered : deduplicated.unique;

  const stats = {
    total: displayList.length,
    avgScore: displayList.length > 0
      ? (displayList.reduce((s, x) => s + (x.score || 0), 0) / displayList.length).toFixed(2)
      : "0.00",
    passing: displayList.filter(x => x.score >= 3.0).length,
  };

  const deleteSubmission = async (id) => {
    if (!confirm("¿Eliminar este registro? Esta acción no se puede deshacer.")) return;
    try {
      await window.QS.db.collection("results").doc(id).delete();
      setSubmissions(submissions.filter(s => s.id !== id));
    } catch (err) {
      alert("Error al eliminar: " + err.message);
    }
  };

  // Eliminar todos los duplicados de una vez
  const deleteAllDuplicates = async () => {
    if (deduplicated.dupes.length === 0) return;
    if (!confirm(`¿Eliminar ${deduplicated.dupes.length} registros duplicados? Se conservará el más reciente de cada estudiante.`)) return;
    try {
      for (const dupe of deduplicated.dupes) {
        await window.QS.db.collection("results").doc(dupe.id).delete();
      }
      setSubmissions(submissions.filter(s => !deduplicated.dupes.find(d => d.id === s.id)));
    } catch (err) {
      alert("Error al eliminar duplicados: " + err.message);
    }
  };

  // Helper: obtener el texto legible de una respuesta dada
  const getAnswerText = (q, userAns) => {
    if (userAns == null || userAns === "") return "(sin respuesta)";
    if (q.type === "multi" || q.type === "truefalse") {
      const opt = (q.options || []).find(o => o.id === userAns);
      return opt ? opt.text : "(sin respuesta)";
    }
    if (q.type === "checks") {
      const arr = Array.isArray(userAns) ? userAns : [];
      if (arr.length === 0) return "(sin respuesta)";
      return arr.map(id => {
        const o = (q.options || []).find(x => x.id === id);
        return o ? o.text : id;
      }).join(" | ");
    }
    if (q.type === "text") {
      return String(userAns);
    }
    return String(userAns);
  };

  // Helper: nombre del tipo de pregunta
  const getQuestionTypeName = (type) => {
    const types = {
      "multi": "Opción múltiple",
      "truefalse": "Verdadero/Falso",
      "checks": "Selección múltiple",
      "text": "Respuesta corta",
    };
    return types[type] || type;
  };

  const downloadExcel = () => {
    if (!selectedQuiz || displayList.length === 0) {
      alert("No hay registros para descargar.");
      return;
    }
    if (typeof XLSX === "undefined") {
      alert("La librería de Excel aún no se cargó. Recarga la página e intenta de nuevo.");
      return;
    }

    // ========== HOJA 1: RESUMEN ==========
    const resumenData = displayList.map(s => ({
      "Estudiante": s.studentName || "",
      "Curso": s.studentCourse || "",
      "Fecha": s.examDate || "",
      "Modo": s.mode === "live" ? "Sala en vivo" : "Asincrónico",
      "Nota": typeof s.score === "number" ? +s.score.toFixed(2) : 0,
      "Puntos obtenidos": s.pointsEarned != null ? s.pointsEarned : "",
      "Puntos máximos": s.pointsMax != null ? s.pointsMax : "",
      "Aciertos": s.correct || 0,
      "Total preguntas": s.total || 0,
      "% Correcto": (s.percent || 0) + "%",
      "Tiempo (segundos)": s.totalSeconds || 0,
      "Enviado el": s.submittedAt ? new Date(s.submittedAt).toLocaleString("es-CO") : "",
    }));

    // ========== HOJA 2: RESPUESTAS DETALLADAS ==========
    // Una fila por cada respuesta de cada estudiante
    const detalleData = [];
    displayList.forEach(s => {
      selectedQuiz.questions.forEach((q, qIdx) => {
        const det = (s.gradeDetail || []).find(d => d.qid === q.id);
        const userAns = det?.userAnswer;
        const answerText = getAnswerText(q, userAns);
        detalleData.push({
          "Estudiante": s.studentName || "",
          "Curso": s.studentCourse || "",
          "Fecha": s.examDate || "",
          "# Pregunta": qIdx + 1,
          "Pregunta": q.text || "",
          "Tipo": getQuestionTypeName(q.type),
          "Respuesta del estudiante": answerText,
          "¿Correcta?": det ? (det.correct ? "Sí" : "No") : "",
          "Puntos obtenidos": det?.points != null ? det.points : 0,
          "Puntos máximos": det?.pointsMax != null ? det.pointsMax : ((q.pointsCorrect ?? 100) + (q.pointsSpeedBonus ?? 0)),
        });
      });
    });

    // Crear libro de Excel
    const wb = XLSX.utils.book_new();

    // Hoja 1
    const ws1 = XLSX.utils.json_to_sheet(resumenData);
    // Anchos de columna sugeridos para resumen
    ws1["!cols"] = [
      { wch: 24 }, // Estudiante
      { wch: 10 }, // Curso
      { wch: 12 }, // Fecha
      { wch: 14 }, // Modo
      { wch: 8 },  // Nota
      { wch: 12 }, // Puntos obt
      { wch: 12 }, // Puntos max
      { wch: 10 }, // Aciertos
      { wch: 14 }, // Total preg
      { wch: 12 }, // % Correcto
      { wch: 14 }, // Tiempo
      { wch: 22 }, // Enviado
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "Resumen");

    // Hoja 2
    const ws2 = XLSX.utils.json_to_sheet(detalleData);
    // Anchos de columna sugeridos para detalle (respuesta ancha para texto largo)
    ws2["!cols"] = [
      { wch: 24 }, // Estudiante
      { wch: 10 }, // Curso
      { wch: 12 }, // Fecha
      { wch: 10 }, // # Pregunta
      { wch: 50 }, // Pregunta (ancha)
      { wch: 18 }, // Tipo
      { wch: 60 }, // Respuesta (muy ancha para texto)
      { wch: 12 }, // Correcta?
      { wch: 14 }, // Puntos obt
      { wch: 14 }, // Puntos max
    ];
    XLSX.utils.book_append_sheet(wb, ws2, "Respuestas detalladas");

    // Generar archivo
    const safeTitle = (selectedQuiz.title || "quiz").replace(/[^a-z0-9_-]/gi, "_").substring(0, 40);
    const fileName = `quizspark_${safeTitle}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
        Cargando...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>📊 Resultados online</h1>
          <p style={{ color: "var(--ink-500)" }}>Respuestas de estudiantes a tus evaluaciones publicadas</p>
        </div>
        <button onClick={onBack} className="qs-btn qs-btn--ghost">← Volver</button>
      </div>

      {quizzes.length === 0 ? (
        <div className="qs-card" style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
          <p style={{ marginBottom: 4, fontWeight: 600 }}>Aún no tienes quizzes</p>
          <p style={{ fontSize: 13 }}>Crea uno desde "Mis quizzes" y publícalo para empezar a recibir respuestas.</p>
        </div>
      ) : (
        <>
          {/* Selector de quiz */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
              Selecciona una evaluación
            </label>
            <select
              className="qs-input"
              value={selectedQuizId || ""}
              onChange={e => setSelectedQuizId(e.target.value)}
              style={{ maxWidth: 420 }}
            >
              {quizzes.map(q => (
                <option key={q.id} value={q.id}>
                  {q.title} {q.isPublished ? "🟢" : "⚪"}
                </option>
              ))}
            </select>
          </div>

          {selectedQuiz && (
            <>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div className="qs-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>Total respuestas</div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)" }}>{stats.total}</div>
                </div>
                <div className="qs-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>Promedio (0-5)</div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--violet-700)" }}>{stats.avgScore}</div>
                </div>
                <div className="qs-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>Aprobados (≥3.0)</div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--emerald-600)" }}>{stats.passing}</div>
                </div>
                <div className="qs-card" style={{ padding: 16 }}>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>Estado</div>
                  <div style={{ fontSize: 16, fontWeight: 700, paddingTop: 6, color: selectedQuiz.isPublished ? "var(--emerald-600)" : "var(--ink-500)" }}>
                    {selectedQuiz.isPublished ? "🟢 Abierto" : "⚪ Cerrado"}
                  </div>
                </div>
              </div>

              {/* Filtros y descarga */}
              <div className="qs-card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Filtrar por curso</label>
                  <input
                    type="text" className="qs-input"
                    placeholder="Ej: 10A"
                    value={filterCourse}
                    onChange={e => setFilterCourse(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Filtrar por fecha</label>
                  <input
                    type="date" className="qs-input"
                    value={filterDate}
                    onChange={e => setFilterDate(e.target.value)}
                  />
                </div>
                {(filterCourse || filterDate) && (
                  <button onClick={() => { setFilterCourse(""); setFilterDate(""); }} className="qs-btn qs-btn--ghost qs-btn--sm">
                    Limpiar
                  </button>
                )}
                <button onClick={downloadExcel} className="qs-btn qs-btn--success">
                  📥 Descargar Excel (.xlsx)
                </button>
              </div>

              {/* Banner de duplicados detectados */}
              {deduplicated.hasDupes && (
                <div style={{
                  padding: 12, borderRadius: 10, marginBottom: 12,
                  background: "#fef3c7", border: "1px solid #fbbf24",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, flexWrap: "wrap",
                }}>
                  <div style={{ fontSize: 13, color: "#92400e" }}>
                    ⚠️ <b>{deduplicated.dupes.length} respuesta{deduplicated.dupes.length > 1 ? "s" : ""} duplicada{deduplicated.dupes.length > 1 ? "s" : ""}</b> detectada{deduplicated.dupes.length > 1 ? "s" : ""}.
                    Mismo nombre y curso. Mostrando solo la más reciente.
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setShowDuplicates(!showDuplicates)}
                      className="qs-btn qs-btn--ghost qs-btn--sm"
                    >
                      {showDuplicates ? "Ocultar duplicados" : "Ver todos"}
                    </button>
                    <button
                      onClick={deleteAllDuplicates}
                      className="qs-btn qs-btn--sm"
                      style={{ background: "#ef4444", color: "white" }}
                    >
                      🗑️ Borrar duplicados
                    </button>
                  </div>
                </div>
              )}

              {/* Toggle de vista: Tabla / Respuestas */}
              {displayList.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <button
                    onClick={() => setViewMode("tabla")}
                    className={"qs-btn qs-btn--sm " + (viewMode === "tabla" ? "qs-btn--primary" : "qs-btn--ghost")}
                  >📋 Vista tabla</button>
                  <button
                    onClick={() => setViewMode("respuestas")}
                    className={"qs-btn qs-btn--sm " + (viewMode === "respuestas" ? "qs-btn--primary" : "qs-btn--ghost")}
                  >📝 Ver respuestas</button>
                </div>
              )}

              {displayList.length === 0 ? (
                <div className="qs-card" style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                  <p>No hay respuestas {(filterCourse || filterDate) ? "con esos filtros." : "todavía."}</p>
                </div>
              ) : viewMode === "tabla" ? (
                /* === VISTA TABLA === */
                <div className="qs-card" style={{ overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: "var(--ink-50)", textAlign: "left" }}>
                          <th style={{ padding: 12, fontSize: 12 }}>Estudiante</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Curso</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Modo</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Fecha</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Nota</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Aciertos</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Puntos</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Tiempo</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Enviado</th>
                          <th style={{ padding: 12, fontSize: 12, width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayList.map(s => (
                          <tr key={s.id} style={{ borderTop: "1px solid var(--ink-100)" }}>
                            <td style={{ padding: 12, fontWeight: 600 }}>{s.studentName}</td>
                            <td style={{ padding: 12 }}>{s.studentCourse}</td>
                            <td style={{ padding: 12, fontSize: 11 }}>
                              <span style={{
                                padding: "2px 8px", borderRadius: 6, fontWeight: 600,
                                background: s.mode === "live" ? "#fce7f3" : "#dbeafe",
                                color: s.mode === "live" ? "#9d174d" : "#1e40af",
                              }}>
                                {s.mode === "live" ? "🎮 En vivo" : "🌐 Online"}
                              </span>
                            </td>
                            <td style={{ padding: 12 }}>{s.examDate}</td>
                            <td style={{ padding: 12 }}>
                              <span style={{
                                fontWeight: 700, padding: "2px 10px", borderRadius: 8,
                                background: s.score >= 3 ? "#d1fae5" : "#fee2e2",
                                color: s.score >= 3 ? "#065f46" : "#991b1b",
                              }}>{(s.score || 0).toFixed(1)}</span>
                            </td>
                            <td style={{ padding: 12 }}>{s.correct}/{s.total}</td>
                            <td style={{ padding: 12, color: "var(--violet-700)", fontWeight: 600 }}>
                              {s.pointsEarned != null
                                ? `${s.pointsEarned}/${s.pointsMax}`
                                : "—"}
                            </td>
                            <td style={{ padding: 12, color: "var(--ink-500)" }}>
                              {Math.floor((s.totalSeconds || 0) / 60)}:{String((s.totalSeconds || 0) % 60).padStart(2, "0")}
                            </td>
                            <td style={{ padding: 12, fontSize: 12, color: "var(--ink-500)" }}>
                              {s.submittedAt ? new Date(s.submittedAt).toLocaleString("es-CO") : "—"}
                            </td>
                            <td style={{ padding: 12 }}>
                              <button onClick={() => deleteSubmission(s.id)} title="Eliminar registro"
                                style={{
                                  background: "transparent", border: "none", cursor: "pointer",
                                  color: "var(--red-500)", fontSize: 16,
                                }}>🗑️</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* === VISTA RESPUESTAS (ACORDEÓN) === */
                <div style={{ display: "grid", gap: 10 }}>
                  {displayList.map(s => {
                    const isOpen = expandedRow === s.id;
                    return (
                      <div key={s.id} className="qs-card" style={{ overflow: "hidden" }}>
                        {/* Cabecera clickeable */}
                        <button
                          onClick={() => setExpandedRow(isOpen ? null : s.id)}
                          style={{
                            width: "100%", padding: 16, background: "transparent",
                            border: "none", cursor: "pointer", textAlign: "left",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            gap: 12, flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                            <div style={{
                              width: 38, height: 38, borderRadius: "50%",
                              background: `linear-gradient(135deg, var(--violet-500), var(--pink-500))`,
                              display: "grid", placeItems: "center", color: "#fff", fontWeight: 800, flexShrink: 0,
                            }}>{(s.studentName || "?").charAt(0).toUpperCase()}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 15 }}>{s.studentName}</div>
                              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                                {s.studentCourse} · {s.examDate} ·
                                <span style={{
                                  marginLeft: 6, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                                  background: s.mode === "live" ? "#fce7f3" : "#dbeafe",
                                  color: s.mode === "live" ? "#9d174d" : "#1e40af",
                                }}>{s.mode === "live" ? "🎮 En vivo" : "🌐 Online"}</span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{
                              fontWeight: 700, padding: "4px 12px", borderRadius: 8, fontSize: 14,
                              background: s.score >= 3 ? "#d1fae5" : "#fee2e2",
                              color: s.score >= 3 ? "#065f46" : "#991b1b",
                            }}>{(s.score || 0).toFixed(1)}</span>
                            <span style={{ fontSize: 13, color: "var(--ink-500)" }}>
                              {s.correct}/{s.total}
                            </span>
                            <span style={{ fontSize: 18, color: "var(--ink-400)" }}>
                              {isOpen ? "▲" : "▼"}
                            </span>
                          </div>
                        </button>

                        {/* Detalle expandido */}
                        {isOpen && (
                          <div style={{
                            padding: "0 16px 16px", borderTop: "1px solid var(--ink-100)",
                          }}>
                            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                              {selectedQuiz.questions.map((q, qIdx) => {
                                const det = (s.gradeDetail || []).find(d => d.qid === q.id);
                                const userAns = det?.userAnswer;
                                const answerText = getAnswerText(q, userAns);
                                const isCorrect = det?.correct;
                                const hasAnswer = det && userAns != null && userAns !== "";

                                return (
                                  <div key={q.id} style={{
                                    padding: 12, borderRadius: 10,
                                    background: !hasAnswer ? "#f1f5f9" : (isCorrect ? "#f0fdf4" : "#fef2f2"),
                                    borderLeft: "4px solid " + (!hasAnswer ? "#94a3b8" : (isCorrect ? "#10b981" : "#ef4444")),
                                  }}>
                                    <div style={{ display: "flex", gap: 8, alignItems: "start", marginBottom: 6 }}>
                                      <span style={{
                                        background: "var(--violet-100)", color: "var(--violet-700)",
                                        padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                                        flexShrink: 0,
                                      }}>P{qIdx + 1}</span>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-700)" }}>
                                        {q.text}
                                      </span>
                                    </div>
                                    <div style={{
                                      fontSize: 11, color: "var(--ink-500)", marginBottom: 4, marginLeft: 32,
                                    }}>
                                      {getQuestionTypeName(q.type)}
                                    </div>
                                    <div style={{
                                      marginLeft: 32, padding: 10, borderRadius: 8,
                                      background: "var(--white)", border: "1px solid var(--ink-200)",
                                      fontSize: 14,
                                      fontStyle: !hasAnswer ? "italic" : "normal",
                                      color: !hasAnswer ? "var(--ink-400)" : "var(--ink-900)",
                                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                                    }}>
                                      <div style={{ fontSize: 11, color: "var(--ink-500)", marginBottom: 2, fontWeight: 600 }}>
                                        Respuesta:
                                      </div>
                                      {answerText}
                                    </div>
                                    <div style={{
                                      marginLeft: 32, marginTop: 6, display: "flex", gap: 12,
                                      fontSize: 12, color: "var(--ink-500)",
                                    }}>
                                      {det && (
                                        <span style={{
                                          fontWeight: 700,
                                          color: isCorrect ? "var(--emerald-600)" : "var(--red-500)",
                                        }}>
                                          {isCorrect ? "✓ Correcta" : "✗ Incorrecta"}
                                        </span>
                                      )}
                                      <span>
                                        Puntos: <b>{det?.points ?? 0}</b> / {det?.pointsMax ?? ((q.pointsCorrect ?? 100) + (q.pointsSpeedBonus ?? 0))}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// Exponer componentes globalmente
window.QS.PublishModal = PublishModal;
window.QS.StudentExam = StudentExam;
window.QS.OnlineResultsPanel = OnlineResultsPanel;
