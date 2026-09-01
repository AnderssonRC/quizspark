/* global React, I, youtubeId, tileColor, Field, Toggle, NumberField */
// ============================================================
// QuizSpark — TALLER EVALUATIVO (modo "workshop")
// Un tercer tipo de actividad, además de Quiz y Encuesta:
//   - Submodo En Vivo: sala en vivo (reutiliza LiveSessionHost/StudentJoinLive/
//     StudentLive de 09-live.js), pero con calificación 1-10 en las
//     preguntas abiertas en vez de las 3 etiquetas del quiz normal.
//   - Submodo Offline: el estudiante lo hace por su cuenta hasta una fecha
//     límite; el docente le pone UNA sola nota a toda la entrega.
// Preguntas cerradas: 10 puntos si acierta, 0 si no (automático en ambos
// submodos). Preguntas abiertas: el docente califica manualmente.
//
// Componentes expuestos (bare window, igual que 03-creator.js):
//   WorkshopEditorFields — campos extra en el Editor cuando mode === "workshop"
//   WorkshopHeader       — encabezado de presentación (objetivo/intro/entrega)
//   WorkshopOfflineFlow  — flujo completo del estudiante en submodo Offline
//   WorkshopHostReveal   — pantalla de revelación/calificación del docente (En vivo)
//   WorkshopGradeModal   — asignar la nota única de una entrega Offline (Resultados)
// ============================================================
const { useState: useStateW, useEffect: useEffectW } = React;

const WORKSHOP_ORANGE = "#ea580c";
const WORKSHOP_ORANGE_DARK = "#7c2d12";
const WORKSHOP_BG = `linear-gradient(135deg, ${WORKSHOP_ORANGE}, ${WORKSHOP_ORANGE_DARK})`;
// Fondo del flujo del ESTUDIANTE: deliberadamente más oscuro y sobrio que el
// naranja vivo de arriba (usado del lado del docente/proyección), para que
// se sienta distinto al Quiz — el foco visual queda en la pregunta y la
// respuesta, no en un banner de color brillante.
const WORKSHOP_STUDENT_BG =
  "radial-gradient(ellipse 1100px 700px at 50% -8%, rgba(234,88,12,0.30), transparent 60%), " +
  "linear-gradient(180deg, #170d06 0%, #0c0603 100%)";

function formatDeadline(ts) {
  if (!ts) return "Sin fecha límite definida";
  try {
    return new Date(ts).toLocaleString("es-CO", { dateStyle: "full", timeStyle: "short" });
  } catch (e) {
    return "Sin fecha límite definida";
  }
}

// Corrección automática de preguntas CERRADAS (multi/truefalse/checks/order).
// Las preguntas de texto (abiertas) siempre se califican a mano → null.
function checkClosedWorkshopAnswer(q, answer) {
  if (q.type === "multi" || q.type === "truefalse") {
    const c = (q.options || []).find(o => o.correct);
    return !!c && answer === c.id;
  }
  if (q.type === "checks") {
    const correctIds = (q.options || []).filter(o => o.correct).map(o => o.id).sort();
    const userIds = Array.isArray(answer) ? [...answer].sort() : [];
    return JSON.stringify(correctIds) === JSON.stringify(userIds);
  }
  if (q.type === "order") {
    const correctIds = (q.items || []).map(it => it.id);
    const userIds = Array.isArray(answer) ? answer : [];
    return JSON.stringify(correctIds) === JSON.stringify(userIds);
  }
  return null;
}

// ============================================================
// EDITOR — campos propios del Taller (se insertan en 03-creator.js)
// ============================================================
function WorkshopEditorFields({ quiz, setQuiz }) {
  const workshopMode = quiz.workshopMode || "live";
  const deadlineObj = quiz.deliveryDeadline ? new Date(quiz.deliveryDeadline) : null;
  const pad2 = (n) => String(n).padStart(2, "0");
  const dateStr = deadlineObj ? `${deadlineObj.getFullYear()}-${pad2(deadlineObj.getMonth() + 1)}-${pad2(deadlineObj.getDate())}` : "";
  const timeStr = deadlineObj ? `${pad2(deadlineObj.getHours())}:${pad2(deadlineObj.getMinutes())}` : "";
  // Construye la fecha con los componentes de día/hora directamente en hora
  // LOCAL (evita el corrimiento de un día que da parsear "YYYY-MM-DD" como
  // si fuera UTC).
  const updateDeadline = (newDateStr, newTimeStr) => {
    if (!newDateStr) { setQuiz({ ...quiz, deliveryDeadline: null }); return; }
    const [y, m, d] = newDateStr.split("-").map(Number);
    const [hh, mm] = (newTimeStr || "23:59").split(":").map(Number);
    setQuiz({ ...quiz, deliveryDeadline: new Date(y, m - 1, d, hh, mm, 0, 0).getTime() });
  };
  return (
    <>
      <Field label="Submodo del Taller">
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "live", label: "🔴 En Vivo" },
            { id: "offline", label: "📅 Offline" },
          ].map(opt => {
            const on = workshopMode === opt.id;
            return (
              <button key={opt.id} onClick={() => setQuiz({ ...quiz, workshopMode: opt.id })}
                style={{
                  flex: 1, padding: "10px 6px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                  background: on ? "rgba(234,88,12,0.14)" : "var(--ink-50)",
                  color: on ? WORKSHOP_ORANGE : "var(--ink-500)",
                  border: "1px solid " + (on ? WORKSHOP_ORANGE : "var(--ink-200)"),
                }}>{opt.label}</button>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.5 }}>
          {workshopMode === "live"
            ? "Sala en vivo con código: las cerradas se corrigen solas y las abiertas las calificas de 1 a 10 al revelar cada pregunta."
            : "El estudiante lo hace por su cuenta hasta la fecha límite; luego le asignas una sola nota a toda la entrega desde Resultados."}
        </p>
      </Field>

      <Field label="Objetivo de aprendizaje">
        <input className="qs-input" value={quiz.learningObjective || ""}
          placeholder="¿Qué debe lograr el estudiante con este taller?"
          onChange={e => setQuiz({ ...quiz, learningObjective: e.target.value })} />
      </Field>

      <Field label="Introducción / resumen del contenido">
        <textarea className="qs-input" value={quiz.introText || ""}
          placeholder="Contexto, instrucciones, materiales de apoyo..."
          onChange={e => setQuiz({ ...quiz, introText: e.target.value })}
          style={{ minHeight: 90, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />
      </Field>

      {workshopMode === "offline" && (
        <Field label="Tiempo de entrega (fecha y hora límite)">
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, display: "block", marginBottom: 4 }}>📅 Día</span>
              <input type="date" className="qs-input" value={dateStr}
                onChange={e => updateDeadline(e.target.value, timeStr)} />
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, display: "block", marginBottom: 4 }}>🕐 Hora</span>
              <input type="time" className="qs-input" value={timeStr || "23:59"}
                onChange={e => updateDeadline(dateStr, e.target.value)}
                disabled={!dateStr} />
            </div>
          </div>
          {quiz.deliveryDeadline ? (
            <div style={{
              marginTop: 10, padding: "8px 12px", borderRadius: 8,
              background: "rgba(234,88,12,0.14)", fontSize: 12, color: WORKSHOP_ORANGE, fontWeight: 700,
            }}>
              🔒 Se cierra: {formatDeadline(quiz.deliveryDeadline)}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8 }}>
              Elige un día para activar la fecha límite.
            </p>
          )}
          <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.5 }}>
            El estudiante verá esta fecha desde el inicio. Pasada esta fecha, el taller
            se cierra solo y ve "Habla con el profe, el tiempo ha terminado."
          </p>
        </Field>
      )}
    </>
  );
}

// ============================================================
// HEADER — encabezado de presentación reutilizado en Vivo y Offline
// ============================================================
function WorkshopHeader({ title, learningObjective, introText, deliveryInfo }) {
  return (
    <div style={{ marginBottom: 20, textAlign: "left" }}>
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 8 }}>🛠️</div>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", color: WORKSHOP_ORANGE, marginBottom: 6 }}>
          TALLER EVALUATIVO
        </div>
        <h2 style={{ fontSize: 22, fontFamily: "var(--font-display)", color: "var(--ink-900)" }}>{title}</h2>
      </div>
      <div style={{
        background: "rgba(234,88,12,0.14)", border: "1px solid rgba(234,88,12,0.4)",
        color: "#ffd9b3", borderRadius: 14, padding: "16px 18px", marginBottom: 12,
      }}>
        {learningObjective && (
          <div style={{ fontSize: 14, marginBottom: 8, lineHeight: 1.5 }}>
            🎯 <strong>Objetivo de aprendizaje:</strong> {learningObjective}
          </div>
        )}
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          ⏰ <strong>Tiempo de entrega:</strong> {deliveryInfo}
        </div>
      </div>
      {introText && (
        <div style={{
          background: "var(--ink-50)", border: "1px solid var(--ink-200)", borderRadius: 12,
          padding: 14, fontSize: 14, lineHeight: 1.6, color: "var(--ink-700)", whiteSpace: "pre-wrap",
        }}>
          {introText}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Renderizadores de pregunta reutilizados por el flujo Offline
// ============================================================
function WorkshopTextArea({ value, onChange }) {
  return (
    <textarea className="qs-input" value={value} onChange={e => onChange(e.target.value)}
      placeholder="Escribe tu respuesta..."
      style={{ minHeight: 120, resize: "vertical", fontSize: 15, lineHeight: 1.5, fontFamily: "inherit" }} />
  );
}

function WorkshopOrderAnswer({ items, value, onChange }) {
  const order = Array.isArray(value) && value.length ? value : items.map(it => it.id);
  useEffectW(() => { if (!Array.isArray(value) || !value.length) onChange(order); }, []);
  const byId = {}; items.forEach(it => { byId[it.id] = it; });
  const move = (idx, dir) => {
    const ni = idx + dir;
    if (ni < 0 || ni >= order.length) return;
    const next = [...order];
    [next[idx], next[ni]] = [next[ni], next[idx]];
    onChange(next);
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {order.map((id, i) => {
        const it = byId[id];
        if (!it) return null;
        return (
          <div key={id} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
            borderRadius: 12, background: "var(--ink-50)", border: "1px solid var(--ink-200)",
          }}>
            <span style={{
              width: 26, height: 26, borderRadius: "50%", background: "#ffedd5", color: WORKSHOP_ORANGE,
              display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
            }}>{i + 1}</span>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{it.text}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--ink-200)", background: i === 0 ? "var(--ink-100)" : "white", fontSize: 16, fontWeight: 800, color: i === 0 ? "var(--ink-300)" : WORKSHOP_ORANGE }}>↑</button>
            <button onClick={() => move(i, 1)} disabled={i === order.length - 1}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--ink-200)", background: i === order.length - 1 ? "var(--ink-100)" : "white", fontSize: 16, fontWeight: 800, color: i === order.length - 1 ? "var(--ink-300)" : WORKSHOP_ORANGE }}>↓</button>
          </div>
        );
      })}
    </div>
  );
}

function WorkshopQuestionCard({ q, answer, onAnswer }) {
  if (q.type === "slide") {
    return (
      <div className="qs-card" style={{ padding: 28 }}>
        <div style={{ display: "inline-block", padding: "4px 10px", borderRadius: 10, background: "#ffedd5", color: WORKSHOP_ORANGE, fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
          📋 Diapositiva
        </div>
        {q.slideTitle && <h2 style={{ fontSize: 22, marginBottom: 12, fontFamily: "var(--font-display)" }}>{q.slideTitle}</h2>}
        {q.image && (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <img src={q.image} alt="" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 10 }} />
          </div>
        )}
        {q.video && youtubeId(q.video) && (
          <div style={{ marginBottom: 14, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
            <iframe src={`https://www.youtube.com/embed/${youtubeId(q.video)}`} title="Video"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
          </div>
        )}
        {q.slideBody && <div style={{ fontSize: 15, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{q.slideBody}</div>}
        {!q.slideTitle && !q.slideBody && !q.image && !q.video && (
          <p style={{ color: "var(--ink-400)", fontStyle: "italic", textAlign: "center" }}>Esta diapositiva está vacía.</p>
        )}
      </div>
    );
  }
  return (
    <div className="qs-card" style={{ padding: 28 }}>
      <h2 style={{ fontSize: 20, marginBottom: (q.image || q.video) ? 12 : 20, lineHeight: 1.4 }}>{q.text}</h2>
      {q.image && (
        <div style={{ textAlign: "center", marginBottom: q.video ? 12 : 20 }}>
          <img src={q.image} alt="" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 10 }} />
        </div>
      )}
      {q.video && youtubeId(q.video) && (
        <div style={{ marginBottom: 20, position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
          <iframe src={`https://www.youtube.com/embed/${youtubeId(q.video)}`} title="Video"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} allowFullScreen />
        </div>
      )}
      {q.type === "multi" && (
        <div style={{ display: "grid", gap: 10 }}>
          {(q.options || []).map(opt => (
            <button key={opt.id} onClick={() => onAnswer(opt.id)} style={{
              padding: 16, borderRadius: 12, textAlign: "left",
              background: answer === opt.id ? "#ffedd5" : "var(--white)",
              color: answer === opt.id ? WORKSHOP_ORANGE_DARK : "var(--ink-900)",
              border: "2px solid " + (answer === opt.id ? WORKSHOP_ORANGE : "var(--ink-200)"),
              fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}>{opt.text}</button>
          ))}
        </div>
      )}
      {q.type === "truefalse" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(q.options || []).map(opt => (
            <button key={opt.id} onClick={() => onAnswer(opt.id)} style={{
              padding: "20px 16px", borderRadius: 12,
              background: answer === opt.id ? "#ffedd5" : "var(--white)",
              color: answer === opt.id ? WORKSHOP_ORANGE_DARK : "var(--ink-900)",
              border: "2px solid " + (answer === opt.id ? WORKSHOP_ORANGE : "var(--ink-200)"),
              fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}>{opt.text}</button>
          ))}
        </div>
      )}
      {q.type === "checks" && (
        <div style={{ display: "grid", gap: 10 }}>
          {(q.options || []).map(opt => {
            const arr = Array.isArray(answer) ? answer : [];
            const selected = arr.includes(opt.id);
            return (
              <button key={opt.id} onClick={() => {
                const next = selected ? arr.filter(x => x !== opt.id) : [...arr, opt.id];
                onAnswer(next);
              }} style={{
                padding: 14, borderRadius: 12, textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                background: selected ? "#ffedd5" : "var(--white)",
                color: selected ? WORKSHOP_ORANGE_DARK : "var(--ink-900)",
                border: "2px solid " + (selected ? WORKSHOP_ORANGE : "var(--ink-200)"),
                fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6,
                  border: "2px solid " + (selected ? WORKSHOP_ORANGE : "var(--ink-300)"),
                  background: selected ? WORKSHOP_ORANGE : "transparent",
                  display: "grid", placeItems: "center", color: "white", fontSize: 14,
                }}>{selected ? "✓" : ""}</span>
                {opt.text}
              </button>
            );
          })}
        </div>
      )}
      {q.type === "text" && <WorkshopTextArea value={answer || ""} onChange={onAnswer} />}
      {q.type === "order" && <WorkshopOrderAnswer items={q.items || []} value={answer} onChange={onAnswer} />}
    </div>
  );
}

// ============================================================
// FLUJO OFFLINE — el estudiante lo hace por su cuenta hasta la fecha límite
// ============================================================
function WorkshopOfflineFlow({ quiz, onExit }) {
  const deadline = quiz.deliveryDeadline || null;
  const alreadyClosed = deadline && Date.now() > deadline;
  // identify | workshop | submitting | done | closed
  const [phase, setPhase] = useStateW(alreadyClosed ? "closed" : "identify");
  const [studentName, setStudentName] = useStateW("");
  const [studentCourse, setStudentCourse] = useStateW("");
  const [partnerName, setPartnerName] = useStateW("");
  const [currentIdx, setCurrentIdx] = useStateW(0);
  const [answers, setAnswers] = useStateW({});
  const [startedAt, setStartedAt] = useStateW(null);

  const questions = quiz.questions || [];

  // Vigilar el cierre por fecha límite mientras el estudiante trabaja
  useEffectW(() => {
    if (!deadline || phase === "closed" || phase === "done") return;
    const check = () => { if (Date.now() > deadline) setPhase("closed"); };
    const id = setInterval(check, 15000);
    return () => clearInterval(id);
  }, [deadline, phase]);

  const handleStart = () => {
    if (!studentName.trim() || !studentCourse.trim()) {
      alert("Completa tu nombre y curso.");
      return;
    }
    if (deadline && Date.now() > deadline) { setPhase("closed"); return; }
    setStartedAt(Date.now());
    setPhase("workshop");
  };

  const setAnswer = (qid, value) => setAnswers(a => ({ ...a, [qid]: value }));

  const isAnswered = (q) => {
    if (q.type === "slide") return true;
    const a = answers[q.id];
    if (q.type === "checks" || q.type === "order") return Array.isArray(a) && a.length > 0;
    return a !== undefined && a !== "";
  };

  const handleNext = () => {
    if (deadline && Date.now() > deadline) { setPhase("closed"); return; }
    if (currentIdx < questions.length - 1) setCurrentIdx(currentIdx + 1);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    if (deadline && Date.now() > deadline) { setPhase("closed"); return; }
    setPhase("submitting");
    try {
      const finishedAt = Date.now();
      const totalSeconds = startedAt ? Math.round((finishedAt - startedAt) / 1000) : 0;
      let correctCount = 0, totalGraded = 0;
      const gradeDetail = questions.filter(q => q.type !== "slide").map(q => {
        const userAnswer = answers[q.id];
        let correct = null, points = null;
        if (q.type !== "text") {
          correct = checkClosedWorkshopAnswer(q, userAnswer);
          points = correct ? 10 : 0;
          totalGraded++;
          if (correct) correctCount++;
        }
        return { qid: q.id, type: q.type, userAnswer: userAnswer ?? null, correct, points, pointsMax: 10 };
      });
      const submission = {
        quizId: quiz.id,
        ownerId: quiz.ownerId,
        studentName: studentName.trim(),
        studentCourse: studentCourse.trim(),
        partnerName: partnerName.trim() || null,
        examDate: new Date().toISOString().slice(0, 10),
        activityType: "workshop",
        workshopMode: "offline",
        answers,
        gradeDetail,
        correct: correctCount,
        total: totalGraded,
        percent: totalGraded > 0 ? Math.round((correctCount / totalGraded) * 100) : null,
        pointsEarned: null,
        pointsMax: null,
        score: null,       // el docente asigna la nota única después
        graded: false,
        startedAt, finishedAt, totalSeconds,
        submittedAt: Date.now(),
      };
      await window.QS.db.collection("results").add(submission);
      setPhase("done");
    } catch (err) {
      console.error("Error enviando el taller:", err);
      alert("Error al enviar el taller: " + err.message);
      setPhase("workshop");
    }
  };

  const shellStyle = { minHeight: "100vh", background: WORKSHOP_STUDENT_BG, padding: 20 };

  if (phase === "closed") {
    return (
      <div style={{ ...shellStyle, display: "grid", placeItems: "center" }}>
        <div className="qs-card" style={{ padding: 36, maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 14 }}>⏰</div>
          <h2 style={{ fontSize: 22, marginBottom: 10 }}>Habla con el profe, el tiempo ha terminado.</h2>
          <p style={{ color: "var(--ink-500)", fontSize: 14, marginBottom: 20 }}>
            El taller "{quiz.title}" ya no acepta entregas.
          </p>
          <button onClick={onExit} className="qs-btn qs-btn--ghost">Ir al inicio</button>
        </div>
      </div>
    );
  }

  if (phase === "identify") {
    return (
      <div style={shellStyle}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <WorkshopHeader
            title={quiz.title}
            learningObjective={quiz.learningObjective}
            introText={quiz.introText}
            deliveryInfo={formatDeadline(deadline)}
          />
          <div className="qs-card" style={{ padding: 28 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Tu nombre completo</label>
              <input type="text" className="qs-input" placeholder="Ana María Pérez"
                value={studentName} onChange={e => setStudentName(e.target.value)} autoFocus />
            </div>
            <div style={{ marginBottom: quiz.pairMode ? 14 : 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Curso</label>
              <input type="text" className="qs-input" placeholder="Ej: 10A"
                value={studentCourse} onChange={e => setStudentCourse(e.target.value)} />
            </div>
            {quiz.pairMode && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
                  👥 Nombre de tu compañero (opcional)
                </label>
                <input type="text" className="qs-input" placeholder="Ej: Juan Pérez"
                  value={partnerName} onChange={e => setPartnerName(e.target.value)} />
              </div>
            )}
            <button onClick={handleStart} className="qs-btn qs-btn--lg"
              style={{ width: "100%", background: WORKSHOP_ORANGE, color: "white", boxShadow: "0 4px 0 " + WORKSHOP_ORANGE_DARK }}>
              🚀 Empezar Taller
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "submitting") {
    return (
      <div style={{ ...shellStyle, display: "grid", placeItems: "center", color: "white" }}>
        <div style={{ textAlign: "center" }}><div style={{ fontSize: 40 }}>📤</div><p>Enviando tu taller...</p></div>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div style={{ ...shellStyle, display: "grid", placeItems: "center" }}>
        <div className="qs-card" style={{ padding: 32, maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>¡Taller enviado!</h2>
          <p style={{ color: "var(--ink-500)", fontSize: 14, lineHeight: 1.6 }}>
            Gracias, {studentName}. Tu profesor revisará tu entrega y te asignará una nota
            para toda la actividad.
          </p>
        </div>
      </div>
    );
  }

  // === phase === "workshop" ===
  // Layout deliberadamente más angosto y centrado que el del Quiz: la barra
  // superior queda mínima (solo datos + progreso) y el peso visual completo
  // cae sobre la tarjeta de pregunta/respuesta, con un contorno naranja que
  // la separa del fondo oscuro.
  const q = questions[currentIdx];
  if (!q) return null;
  const progress = ((currentIdx + 1) / questions.length) * 100;
  return (
    <div style={{ ...shellStyle, paddingBottom: 100 }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 13, color: "#e7dccf",
        }}>
          <div style={{ fontWeight: 700 }}>{studentName} · {studentCourse}</div>
          <div>Pregunta {currentIdx + 1} de {questions.length}</div>
        </div>
        {deadline && (
          <div style={{ fontSize: 12, color: WORKSHOP_ORANGE, marginBottom: 10, fontWeight: 600 }}>
            ⏰ Entrega hasta: {formatDeadline(deadline)}
          </div>
        )}
        <div style={{ height: 6, background: "rgba(255,255,255,0.12)", borderRadius: 3, marginBottom: 24, overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress + "%", background: WORKSHOP_ORANGE, transition: "width 0.3s ease" }} />
        </div>
        <div key={q.id} className="qs-fade-in" style={{
          marginBottom: 16, borderRadius: 16,
          boxShadow: "0 0 0 1.5px rgba(234,88,12,0.5), 0 24px 60px rgba(234,88,12,0.18)",
        }}>
          <WorkshopQuestionCard q={q} answer={answers[q.id]} onAnswer={v => setAnswer(q.id, v)} />
        </div>
        <button onClick={handleNext} disabled={!isAnswered(q)} className="qs-btn qs-btn--lg" style={{
          width: "100%", background: WORKSHOP_ORANGE, color: "white", fontWeight: 700,
          boxShadow: "0 4px 0 " + WORKSHOP_ORANGE_DARK,
          opacity: !isAnswered(q) ? 0.5 : 1,
        }}>
          {currentIdx < questions.length - 1 ? "Siguiente →" : "Enviar taller ✓"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// REVELACIÓN EN VIVO — reemplaza HostReveal para mode === "workshop"
// ============================================================
function WorkshopHostReveal({ session, quiz, currentQ, answersThisQ, onNext, onGradeWorkshop }) {
  const totalAnswers = Object.keys(answersThisQ || {}).length;
  const isLast = session.currentQuestionIdx >= quiz.questions.length - 1;
  const colors = ["var(--tile-1)", "var(--tile-2)", "var(--tile-3)", "var(--tile-4)"];

  const shell = (inner, customFooter) => (
    <div style={{ minHeight: "100vh", background: WORKSHOP_BG, padding: 24, color: "white" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ opacity: 0.75, fontSize: 13 }}>🛠️ Taller — Pregunta {session.currentQuestionIdx + 1} de {quiz.questions.length}</p>
          <h2 style={{ fontSize: 26, marginTop: 4 }}>{currentQ.text}</h2>
        </div>
        {inner}
        {!customFooter && (
          <>
            <div style={{ marginTop: 4, marginBottom: 20, padding: 12, background: "rgba(255,255,255,0.15)", borderRadius: 10, textAlign: "center", fontSize: 13 }}>
              <b>{totalAnswers}</b> respuestas totales
            </div>
            <button onClick={onNext} className="qs-btn qs-btn--lg" style={{ width: "100%", background: "white", color: WORKSHOP_ORANGE_DARK, fontWeight: 800, fontSize: 16 }}>
              {isLast ? "🏁 Ver resultado final" : "➡️ Siguiente pregunta"}
            </button>
          </>
        )}
        {customFooter}
      </div>
    </div>
  );

  // ----- Preguntas cerradas: 10 puntos automáticos -----
  if (currentQ.type !== "text") {
    if (currentQ.type === "order") {
      const total = Object.keys(answersThisQ || {}).length;
      const correctCount = Object.values(answersThisQ || {}).filter(a => a.correct).length;
      return shell(
        <div className="qs-card" style={{ padding: 24, marginBottom: 20, color: "var(--ink-900)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--emerald-600)", marginBottom: 10, textAlign: "center" }}>✓ Orden correcto</div>
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {(currentQ.items || []).map((it, i) => (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "#fff7ed", borderLeft: "4px solid " + WORKSHOP_ORANGE }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: WORKSHOP_ORANGE, color: "white", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: WORKSHOP_ORANGE_DARK }}>{it.text}</span>
              </div>
            ))}
          </div>
          {total > 0 && (
            <div style={{ padding: 10, background: "#fff7ed", borderRadius: 10, textAlign: "center", fontSize: 14, color: WORKSHOP_ORANGE, fontWeight: 700 }}>
              {correctCount} de {total} acertaron el orden completo — 10 pts automáticos
            </div>
          )}
        </div>
      );
    }
    const optionCounts = {};
    (currentQ.options || []).forEach(o => { optionCounts[o.id] = 0; });
    Object.values(answersThisQ || {}).forEach(a => {
      if (Array.isArray(a.answer)) a.answer.forEach(id => { if (optionCounts.hasOwnProperty(id)) optionCounts[id]++; });
      else if (optionCounts.hasOwnProperty(a.answer)) optionCounts[a.answer]++;
    });
    const maxCount = Math.max(1, ...Object.values(optionCounts));
    return shell(
      <div className="qs-card" style={{ padding: 28, marginBottom: 20, color: "var(--ink-900)" }}>
        <div style={{ display: "grid", gap: 12 }}>
          {(currentQ.options || []).map((opt, i) => {
            const count = optionCounts[opt.id] || 0;
            const widthPct = (count / maxCount) * 100;
            return (
              <div key={opt.id} className="qs-fade-in" style={{
                position: "relative", display: "flex", alignItems: "center", padding: 16,
                borderRadius: 12, background: opt.correct ? "var(--emerald-500)" : colors[i % 4],
                color: "white", overflow: "hidden", opacity: opt.correct || count > 0 ? 1 : 0.5,
              }}>
                <div style={{ position: "absolute", inset: 0, width: widthPct + "%", background: "rgba(255,255,255,0.15)", transition: "width 0.6s ease" }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 10 }}>
                    {opt.correct && <span style={{ fontSize: 22 }}>✓</span>}{opt.text}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>{count}</div>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ marginTop: 12, fontSize: 12, color: "var(--ink-500)", textAlign: "center" }}>10 puntos automáticos si acierta, 0 si no.</p>
      </div>
    );
  }

  // ----- Pregunta abierta: calificación manual de 1 a 10 -----
  const entries = Object.entries(answersThisQ || {}).map(([pid, a]) => ({
    pid,
    text: (a.answer == null ? "" : String(a.answer)).trim(),
    graded: a.graded || false,
    points: a.points || null,
    name: session.participants?.[pid]?.name || "Estudiante",
  })).filter(e => e.text);
  const pending = entries.filter(e => !e.graded).length;
  const canAdvance = !(pending > 0 && entries.length > 0);

  return shell(
    <div className="qs-card" style={{ padding: 24, marginBottom: 20, color: "var(--ink-900)", maxHeight: "58vh", overflowY: "auto" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: WORKSHOP_ORANGE, marginBottom: 12 }}>
        ✍️ Califica cada respuesta de 1 a 10 — faltan {pending}
      </div>
      {entries.length === 0 ? (
        <p style={{ textAlign: "center", color: "var(--ink-500)" }}>Aún no hay respuestas.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {entries.map(e => (
            <div key={e.pid} style={{ padding: 12, borderRadius: 10, background: "var(--ink-50)", border: "1px solid " + (e.graded ? WORKSHOP_ORANGE : "var(--ink-200)") }}>
              <div style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 2 }}>{e.name}</div>
              <div style={{ fontSize: 15, marginBottom: 8 }}>{e.text}</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                  const on = e.graded && e.points === n;
                  return (
                    <button key={n} onClick={() => onGradeWorkshop(e.pid, n)}
                      style={{
                        width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer",
                        fontWeight: 800, fontSize: 13,
                        color: on ? "white" : WORKSHOP_ORANGE_DARK,
                        background: on ? WORKSHOP_ORANGE : "#fed7aa",
                      }}>{n}</button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,
    <button onClick={onNext} disabled={!canAdvance} className="qs-btn qs-btn--lg" style={{
      width: "100%", marginTop: 4,
      background: canAdvance ? "white" : "var(--ink-200)",
      color: canAdvance ? WORKSHOP_ORANGE_DARK : "var(--ink-400)",
      fontWeight: 800, fontSize: 16,
    }}>
      {canAdvance ? (isLast ? "🏁 Ver resultado final" : "➡️ Siguiente pregunta") : `Califica a todos para continuar (${pending} restantes)`}
    </button>
  );
}

// ============================================================
// MODAL DE CALIFICACIÓN — nota única para una entrega Offline (Resultados)
// ============================================================
function WorkshopGradeModal({ submission, quiz, onClose, onSaved }) {
  const [grade, setGrade] = useStateW(submission.score != null ? submission.score : null);
  const [saving, setSaving] = useStateW(false);
  const questions = quiz?.questions || [];

  const answerText = (q, userAnswer) => {
    if (userAnswer == null || userAnswer === "") return "—";
    if (Array.isArray(userAnswer)) {
      if (q.type === "order") {
        const byId = {}; (q.items || []).forEach(it => { byId[it.id] = it.text; });
        return userAnswer.map(id => byId[id] || id).join(" → ");
      }
      return userAnswer.map(id => (q.options || []).find(o => o.id === id)?.text || id).join(", ");
    }
    if (q.type === "multi" || q.type === "truefalse") {
      return (q.options || []).find(o => o.id === userAnswer)?.text || String(userAnswer);
    }
    return String(userAnswer);
  };

  const handleSave = async () => {
    const num = grade;
    if (num == null || isNaN(num) || num < 0 || num > 5) {
      alert("Ingresa una nota válida entre 0 y 5.");
      return;
    }
    setSaving(true);
    try {
      await window.QS.db.collection("results").doc(submission.id).update({
        score: num, graded: true, gradedAt: Date.now(),
      });
      onSaved({ id: submission.id, score: num, graded: true });
    } catch (err) {
      alert("Error al guardar la nota: " + err.message);
    }
    setSaving(false);
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
      display: "grid", placeItems: "center", padding: 20, zIndex: 60, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{
        padding: 24, maxWidth: 640, width: "100%", maxHeight: "88vh", overflowY: "auto",
        borderTop: "4px solid " + WORKSHOP_ORANGE,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ fontSize: 20 }}>{submission.studentName}</h3>
            <p style={{ fontSize: 13, color: "var(--ink-500)" }}>
              {submission.studentCourse} · {submission.examDate}
              {submission.partnerName ? <><br />👥 Con {submission.partnerName}</> : null}
            </p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "rgba(234,88,12,0.14)", color: WORKSHOP_ORANGE }}>
            🛠️ Taller Offline
          </span>
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          {questions.filter(q => q.type !== "slide").map((q, i) => {
            const det = (submission.gradeDetail || []).find(d => d.qid === q.id) || {};
            const userAnswer = submission.answers ? submission.answers[q.id] : det.userAnswer;
            return (
              <div key={q.id} style={{
                padding: 14, borderRadius: 12, border: "1px solid var(--ink-200)",
                background: q.type === "text" ? "#fff7ed" : "var(--white)",
                color: q.type === "text" ? WORKSHOP_ORANGE_DARK : "var(--ink-900)",
              }}>
                <div style={{ fontSize: 12, marginBottom: 4, opacity: 0.75 }}>
                  Pregunta {i + 1} · {q.type === "text" ? "Respuesta abierta" : q.type}
                </div>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{q.text || "(sin enunciado)"}</div>
                <div style={{ padding: 10, borderRadius: 8, background: "var(--ink-50)", fontSize: 14, color: "var(--ink-900)" }}>
                  {answerText(q, userAnswer)}
                </div>
                {q.type !== "text" && det.correct != null && (
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: det.correct ? "var(--emerald-600)" : "var(--red-500)" }}>
                    {det.correct ? "✓ Correcta (referencia, 10 pts)" : "✗ Incorrecta (referencia, 0 pts)"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 12, padding: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: WORKSHOP_ORANGE, display: "block", marginBottom: 8 }}>
            🎯 Nota para toda la actividad (0 a 5)
          </label>
          <NumberField value={grade} fallback={0} step="0.1" min="0" max="5"
            onChange={setGrade}
            style={{
              maxWidth: 160, padding: "8px 10px", borderRadius: 8, border: "1px solid #fdba74",
              background: "white", fontWeight: 700, fontSize: 18, color: WORKSHOP_ORANGE_DARK,
            }} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button onClick={onClose} className="qs-btn qs-btn--ghost qs-btn--lg" style={{ flex: 1 }}>Cerrar</button>
          <button onClick={handleSave} disabled={saving} className="qs-btn qs-btn--lg" style={{ flex: 1, background: WORKSHOP_ORANGE, color: "white" }}>
            {saving ? "Guardando..." : "💾 Guardar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  WorkshopEditorFields, WorkshopHeader, WorkshopOfflineFlow, WorkshopHostReveal, WorkshopGradeModal,
});
