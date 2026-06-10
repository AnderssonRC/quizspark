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

  // En modo encuesta no se califica nada: solo se recogen respuestas
  const isSurvey = quiz.mode === "survey";

  for (const q of quiz.questions) {
    // Las diapositivas no se cuentan en la nota ni en el total de preguntas
    if (q.type === "slide") continue;
    // En encuesta tampoco se cuentan para nota, pero las registramos en detail
    if (isSurvey) {
      detail.push({
        qid: q.id,
        type: q.type,
        userAnswer: answers[q.id] ?? null,
        correct: false,
        points: 0,
        pointsMax: 0,
        survey: true,
      });
      continue;
    }
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
      const accepted = (q.acceptedAnswers || []).map(a => a.toLowerCase().trim()).filter(Boolean);
      if (accepted.length > 0) {
        const user = (userAnswer || "").toLowerCase().trim();
        isCorrect = accepted.includes(user);
      }
      // Si no hay respuestas aceptadas, queda sin calificar (0). El docente
      // las revisa manualmente solo en modo "calificar en vivo" (sala en vivo).
    } else if (q.type === "order") {
      const correctIds = (q.items || []).map(it => it.id);
      const userIds = Array.isArray(userAnswer) ? userAnswer : [];
      isCorrect = JSON.stringify(correctIds) === JSON.stringify(userIds);
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
  // La escala solo es utilizable si cubre un rango real (no algo como [{from:0,to:0}])
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
  // Por defecto (o escala inválida): escala colombiana 0-5 lineal
  if (!maxPoints || maxPoints === 0) return 0;
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
  // Cronómetro por pregunta: cuándo arrancó la pregunta actual y cuánto queda
  const [questionStartedAt, setQuestionStartedAt] = useStateO(null);
  const [secondsLeft, setSecondsLeft] = useStateO(null);

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

  // Cronómetro por pregunta (solo en preguntas, no en diapositivas)
  // Cuando entra una pregunta nueva, registramos cuándo arrancó.
  useEffectO(() => {
    if (phase !== "exam") return;
    const q = questionsOrder[currentIdx];
    if (!q) return;
    // Las diapositivas no tienen cronómetro
    if (q.type === "slide") {
      setQuestionStartedAt(null);
      setSecondsLeft(null);
      return;
    }
    setQuestionStartedAt(Date.now());
    setSecondsLeft(q.timer || 20);
  }, [phase, currentIdx]);

  // Tick del cronómetro: cada segundo descontamos. Si llega a 0, avanzamos.
  useEffectO(() => {
    if (phase !== "exam") return;
    if (questionStartedAt == null) return; // diapositiva: sin cronómetro
    const q = questionsOrder[currentIdx];
    if (!q) return;
    const totalSec = q.timer || 20;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - questionStartedAt) / 1000;
      const left = Math.max(0, totalSec - elapsed);
      // Solo re-renderizar cuando cambia el segundo visible
      setSecondsLeft(prev => (prev != null && Math.ceil(left) === Math.ceil(prev) ? prev : left));
      if (left <= 0) {
        clearInterval(interval);
        // Se acabó el tiempo: avanzar (la respuesta queda como está, sin marcar)
        if (currentIdx < questionsOrder.length - 1) {
          setCurrentIdx(currentIdx + 1);
        } else {
          handleSubmit();
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [phase, currentIdx, questionStartedAt]);

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
  // Las diapositivas no tienen respuesta: se consideran "vistas" automáticamente
  const isAnswered = q.type === "slide"
    ? true
    : (q.type === "checks" || q.type === "order"
        ? Array.isArray(userAnswer) && userAnswer.length > 0
        : userAnswer !== undefined && userAnswer !== "");

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
      padding: 20, paddingBottom: 100,
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
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {q.type !== "slide" && secondsLeft != null && (
              <div style={{
                background: secondsLeft <= 5 ? "var(--red-500)" : "rgba(0,0,0,0.25)",
                padding: "4px 12px", borderRadius: 10, fontWeight: 800, fontSize: 16,
                fontFamily: "var(--font-display)", minWidth: 56, textAlign: "center",
                transition: "background 0.3s",
              }}>
                ⏱ {Math.ceil(secondsLeft)}s
              </div>
            )}
            <div style={{ fontSize: 14 }}>
              Pregunta {currentIdx + 1} de {totalQ}
            </div>
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

        {/* Pregunta o Diapositiva */}
        <div className="qs-card qs-fade-in" key={q.id} style={{ padding: 28, marginBottom: 16 }}>
          {q.type === "slide" ? (
            <>
              <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 10, background: "var(--violet-100)", color: "var(--violet-700)", fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
                📋 Diapositiva
              </div>
              {q.slideTitle && (
                <h2 style={{ fontSize: 24, marginBottom: 14, fontFamily: "var(--font-display)" }}>
                  {q.slideTitle}
                </h2>
              )}
              {q.image && (
                <div style={{ textAlign: "center", marginBottom: 14 }}>
                  <img src={q.image} alt=""
                    style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 10, border: "1px solid var(--ink-200)" }}/>
                </div>
              )}
              {q.video && youtubeId(q.video) && (
                <div style={{ marginBottom: 14, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
                  <iframe src={`https://www.youtube.com/embed/${youtubeId(q.video)}`} title="Video"
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                    allowFullScreen/>
                </div>
              )}
              {q.slideBody && (
                <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap", color: "var(--ink-800)" }}>
                  {q.slideBody}
                </div>
              )}
              {!q.slideTitle && !q.slideBody && !q.image && !q.video && (
                <p style={{ color: "var(--ink-400)", fontStyle: "italic", textAlign: "center" }}>
                  Esta diapositiva está vacía.
                </p>
              )}
              <div style={{ marginTop: 16, padding: 10, background: "var(--ink-50)", borderRadius: 8, fontSize: 12, color: "var(--ink-500)", textAlign: "center" }}>
                ℹ️ Esta diapositiva no se califica. Pulsa "Siguiente" para continuar.
              </div>
            </>
          ) : (
            <>
          <h2 style={{ fontSize: 22, marginBottom: (q.image || q.video) ? 12 : 20, lineHeight: 1.4 }}>
            {q.text}
          </h2>
          {q.image && (
            <div style={{ textAlign: "center", marginBottom: q.video ? 12 : 20 }}>
              <img src={q.image} alt=""
                style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 10, border: "1px solid var(--ink-200)" }}/>
            </div>
          )}
          {q.video && youtubeId(q.video) && (
            <div style={{ marginBottom: 20, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
              <iframe src={`https://www.youtube.com/embed/${youtubeId(q.video)}`} title="Video"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                allowFullScreen/>
            </div>
          )}

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

          {/* Ordenar */}
          {q.type === "order" && (() => {
            // Establecer un orden inicial mezclado si aún no ha respondido
            const currentOrder = Array.isArray(userAnswer) && userAnswer.length > 0
              ? userAnswer
              : (() => {
                  const ids = (q.items || []).map(it => it.id);
                  for (let i = ids.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [ids[i], ids[j]] = [ids[j], ids[i]];
                  }
                  return ids;
                })();
            const byId = {}; (q.items || []).forEach(it => byId[it.id] = it);
            const move = (idx, dir) => {
              const ni = idx + dir;
              if (ni < 0 || ni >= currentOrder.length) return;
              const next = [...currentOrder];
              [next[idx], next[ni]] = [next[ni], next[idx]];
              setAnswer(q.id, next);
            };
            // Si no había respuesta previa, guardar el orden inicial mezclado
            if (!Array.isArray(userAnswer) || userAnswer.length === 0) {
              setTimeout(() => setAnswer(q.id, currentOrder), 0);
            }
            return (
              <div style={{ display: "grid", gap: 8 }}>
                <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 4 }}>
                  Usa ↑ y ↓ para acomodar los elementos en el orden correcto:
                </p>
                {currentOrder.map((id, i) => {
                  const it = byId[id];
                  if (!it) return null;
                  return (
                    <div key={id} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
                      borderRadius: 12, background: "var(--ink-50)", border: "1px solid var(--ink-200)",
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
                      <button onClick={() => move(i, 1)} disabled={i === currentOrder.length - 1}
                        style={{
                          width: 32, height: 32, borderRadius: 8, border: "1px solid var(--ink-200)",
                          background: i === currentOrder.length - 1 ? "var(--ink-100)" : "white", cursor: i === currentOrder.length - 1 ? "default" : "pointer",
                          fontSize: 16, fontWeight: 800, color: i === currentOrder.length - 1 ? "var(--ink-300)" : "var(--violet-700)",
                        }}>↓</button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
            </>
          )}
        </div>

        {/* Navegación — solo botón Siguiente (no se puede volver atrás) */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleNext}
            disabled={!isAnswered}
            className="qs-btn qs-btn--lg"
            style={{
              flex: 1, background: "var(--white)", color: "var(--violet-700)",
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
  const [reviewing, setReviewing] = useStateO(null); // submission abierta para revisar

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

  // Filtros
  const filtered = submissions.filter(s => {
    if (filterCourse && !s.studentCourse.toLowerCase().includes(filterCourse.toLowerCase())) return false;
    if (filterDate && s.examDate !== filterDate) return false;
    return true;
  });

  const stats = {
    total: filtered.length,
    avgScore: filtered.length > 0
      ? (filtered.reduce((s, x) => s + (x.score || 0), 0) / filtered.length).toFixed(2)
      : "0.00",
    passing: filtered.filter(x => x.score >= 3.0).length,
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

  const downloadExcel = () => {
    if (!selectedQuiz || filtered.length === 0) {
      alert("No hay registros para descargar.");
      return;
    }
    // Construimos CSV (compatible con Excel y Google Sheets)
    const header = ["Nombre", "Curso", "Fecha", "Nota", "Puntos obtenidos", "Puntos máximos", "Aciertos", "Total preguntas", "% Correcto", "Tiempo (segundos)", "Enviado"];
    selectedQuiz.questions.forEach((q, i) => {
      header.push(`P${i+1}: ${q.text.substring(0, 50)}`);
      header.push(`P${i+1} ¿correcto?`);
      header.push(`P${i+1} puntos obtenidos`);
    });
    const rows = filtered.map(s => {
      const row = [
        s.studentName,
        s.studentCourse,
        s.examDate,
        (s.score || 0).toFixed(2),
        s.pointsEarned != null ? s.pointsEarned : "",
        s.pointsMax != null ? s.pointsMax : "",
        s.correct || 0,
        s.total || 0,
        (s.percent || 0) + "%",
        s.totalSeconds || 0,
        new Date(s.submittedAt || 0).toLocaleString("es-CO"),
      ];
      selectedQuiz.questions.forEach(q => {
        const det = (s.gradeDetail || []).find(d => d.qid === q.id);
        let answerText = "—";
        if (det) {
          const userAns = det.userAnswer;
          if (q.type === "multi" || q.type === "truefalse") {
            const opt = (q.options || []).find(o => o.id === userAns);
            answerText = opt ? opt.text : "(sin respuesta)";
          } else if (q.type === "checks") {
            const arr = Array.isArray(userAns) ? userAns : [];
            answerText = arr.map(id => {
              const o = (q.options || []).find(x => x.id === id);
              return o ? o.text : id;
            }).join(" | ");
          } else if (q.type === "text") {
            answerText = userAns || "(sin respuesta)";
          }
        }
        row.push(answerText);
        row.push(det ? (det.correct ? "Sí" : "No") : "");
        row.push(det && det.points != null ? det.points : "");
      });
      return row;
    });

    const escapeCsv = (val) => {
      const s = String(val == null ? "" : val);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };

    const csv = [header, ...rows].map(r => r.map(escapeCsv).join(",")).join("\n");
    // BOM UTF-8 para que Excel abra bien acentos
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTitle = (selectedQuiz.title || "quiz").replace(/[^a-z0-9_-]/gi, "_");
    a.href = url;
    a.download = `quizspark_${safeTitle}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
                  📥 Descargar Excel/CSV
                </button>
              </div>

              {/* Tabla */}
              {filtered.length === 0 ? (
                <div className="qs-card" style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                  <p>No hay respuestas {(filterCourse || filterDate) ? "con esos filtros." : "todavía."}</p>
                </div>
              ) : (
                <div className="qs-card" style={{ overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: "var(--ink-50)", textAlign: "left" }}>
                          <th style={{ padding: 12, fontSize: 12 }}>Estudiante</th>
                          <th style={{ padding: 12, fontSize: 12 }}>Curso</th>
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
                        {filtered.map(s => {
                          return (
                          <tr key={s.id} onClick={() => setReviewing(s)}
                            style={{ borderTop: "1px solid var(--ink-100)", cursor: "pointer" }}
                            title="Clic para ver respuestas">
                            <td style={{ padding: 12, fontWeight: 600 }}>{s.studentName}</td>
                            <td style={{ padding: 12 }}>{s.studentCourse}</td>
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
                              <button onClick={(e) => { e.stopPropagation(); deleteSubmission(s.id); }} title="Eliminar registro"
                                style={{
                                  background: "transparent", border: "none", cursor: "pointer",
                                  color: "var(--red-500)", fontSize: 16,
                                }}>🗑️</button>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {reviewing && (
        <ReviewModal
          submission={reviewing}
          quiz={selectedQuiz}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}

// =================== REVIEW MODAL — ver respuestas (solo lectura) ===================
function ReviewModal({ submission, quiz, onClose }) {
  const questions = quiz?.questions || [];
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
      display: "grid", placeItems: "center", padding: 20, zIndex: 60, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{
        padding: 24, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 20 }}>{submission.studentName}</h3>
            <p style={{ fontSize: 13, color: "var(--ink-500)" }}>
              {submission.studentCourse} · {submission.examDate}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Nota</div>
            <div style={{
              fontSize: 24, fontWeight: 800, fontFamily: "var(--font-display)",
              color: (submission.score || 0) >= 3 ? "var(--emerald-600)" : "var(--red-500)",
            }}>{(submission.score || 0).toFixed(1)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {questions.map((q, i) => {
            const det = (submission.gradeDetail || []).find(d => d.qid === q.id) || {};
            const userAnswer = det.userAnswer;
            const isOpen = q.type === "text";

            // Render legible de la respuesta del estudiante
            let answerText = "—";
            if (userAnswer != null && userAnswer !== "") {
              if (Array.isArray(userAnswer)) {
                answerText = userAnswer.map(id => (q.options || []).find(o => o.id === id)?.text || id).join(", ");
              } else if (q.type === "multi" || q.type === "truefalse") {
                answerText = (q.options || []).find(o => o.id === userAnswer)?.text || String(userAnswer);
              } else {
                answerText = String(userAnswer);
              }
            }

            return (
              <div key={q.id} style={{
                padding: 14, borderRadius: 12, border: "1px solid var(--ink-200)",
                background: isOpen ? "var(--violet-50)" : "var(--white)",
              }}>
                <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 4 }}>
                  Pregunta {i + 1} · {isOpen ? "Respuesta abierta" : q.type}
                </div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{q.text || "(sin enunciado)"}</div>
                <div style={{
                  padding: 10, borderRadius: 8, background: "var(--ink-50)",
                  fontSize: 14,
                  fontStyle: answerText === "—" ? "italic" : "normal",
                  color: answerText === "—" ? "var(--ink-400)" : "var(--ink-900)",
                }}>
                  {answerText === "—" ? "Sin respuesta" : answerText}
                </div>
                {!isOpen && (
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600,
                    color: det.correct ? "var(--emerald-600)" : "var(--red-500)" }}>
                    {det.correct ? "✓ Correcta" : "✗ Incorrecta"} · {det.points || 0}/{det.pointsMax || 0} pts
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="qs-btn qs-btn--primary qs-btn--lg" style={{ width: "100%", marginTop: 16 }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// Exponer componentes globalmente
window.QS.PublishModal = PublishModal;
window.QS.StudentExam = StudentExam;
window.QS.OnlineResultsPanel = OnlineResultsPanel;
