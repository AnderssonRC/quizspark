/* global React, ReactDOM */
// ============================================================
// QuizSpark — LECTOR OMR · Tabla de resultados + editor + guardado
// ------------------------------------------------------------
// Completa los pasos 7 y 8 del lector OMR (13-omr-reader.js hace 1-6).
//
//   buildOmrEntries(pages, quiz)   — aplana pages[].sheets[] en filas de
//                                    tabla, detecta duplicados y califica
//                                    cada una.
//   buildOmrResultData(...)        — arma el documento de resultado
//                                    reutilizando EXACTAMENTE la misma
//                                    fórmula que ya usan los quizzes
//                                    digitales (convertToGrade, de
//                                    09-live.js) — spec 3.7: "una hoja
//                                    física y un quiz digital deben dar
//                                    idénticamente el mismo resultado".
//   confirmOmrEntry(quiz, entry)   — guarda en la colección "results"
//                                    (spec 6) SOLO cuando el docente
//                                    confirma. Si ya existe un resultado
//                                    para ese quizId+studentId, pregunta
//                                    antes de sobrescribir (nunca en
//                                    silencio).
//   OMRResultsTable                — la tabla (spec 5) + su editor modal
//                                    (spec 5.2).
// ============================================================
const { useState: useStateRes, useMemo: useMemoRes, useEffect: useEffectRes, useRef: useRefRes } = React;

// Códigos de incidencia que bloquean el guardado (spec 5.1).
const OMR_BLOCKING_CODES = ["FIDUCIAL_FAIL", "QR_FAIL", "WRONG_QUIZ", "DUPLICATE"];
function omrIsBlocked(entry) {
  return (entry.incidences || []).some(code =>
    OMR_BLOCKING_CODES.some(b => code === b || code.indexOf(b + ":") === 0));
}

// ------------------------------------------------------------
// Traduce los códigos crudos de incidencia (los que arma 13-omr-reader.js
// y 13b-omr-worker.js) a un texto que un docente entiende de un vistazo,
// en vez del código técnico. El código crudo sigue disponible en el
// atributo title de cada chip, por si hace falta para depurar.
// ------------------------------------------------------------
const OMR_INCIDENCE_LABELS = {
  FIDUCIAL_FAIL: "No se detectó la hoja",
  QR_FAIL: "Error de QR",
  WRONG_QUIZ: "QR de otro quiz",
  DUPLICATE: "Estudiante duplicado",
  LOW_DPI: "Resolución de escaneo baja",
  SHEET_ERROR: "Error al procesar la hoja",
};
function formatOmrQList(rest) {
  const nums = (rest || "").split(",").filter(Boolean);
  if (nums.length <= 1) return nums[0] || "";
  return "preg. " + nums.slice(0, -1).join(", ") + " y " + nums[nums.length - 1];
}
function omrIncidenceLabel(code) {
  const sep = code.indexOf(":");
  const base = sep === -1 ? code : code.slice(0, sep);
  const rest = sep === -1 ? "" : code.slice(sep + 1);
  if (base === "MULTI") return "Doble círculo" + (rest ? " · " + formatOmrQList(rest) : "");
  if (base === "WEAK") return "Círculo débil" + (rest ? " · " + formatOmrQList(rest) : "");
  if (base === "BLANK") return "Círculo vacío" + (rest ? " · " + formatOmrQList(rest) : "");
  return OMR_INCIDENCE_LABELS[base] || code;
}

// ------------------------------------------------------------
// Calificación — el Modo Sin Celular usa su PROPIA fórmula, distinta de la
// tabla de rangos ("Tabla de conversión a nota") de los quizzes digitales:
//
//     nota = (puntos obtenidos / puntos máximos respondidos) × nota máxima
//
// Lineal y con decimales, sin tramos ni saltos — cada pregunta pesa igual
// (no hay "valor por pregunta" configurable: con todas las preguntas
// pesando lo mismo, cualquier valor que se les ponga da la misma nota, así
// que esa opción se quitó por innecesaria) y cada acierto extra sube la
// nota proporcionalmente (ej.: 9 de 10 preguntas con nota máxima 4 → 3.6).
// La "nota máxima" es quiz.omrMaxGrade (editable en "🔒 Calificación y
// Reglas" para quizzes de Modo Sin Celular; 5 si no se ha tocado).
// Esto es exclusivo del Modo Sin Celular — no toca la calificación de las
// salas en vivo/online, que sigue usando convertToGrade + la tabla de
// rangos tal cual.
// Las preguntas BLANK/WEAK/MULTI (o sin respuesta) se tratan como "no
// respondidas": se excluyen del total y lo ganado se reescala sobre las
// preguntas sí respondidas, igual que un estudiante que no alcanzó a
// responder todo en una sala en vivo.
// ------------------------------------------------------------
function buildOmrResultData(quiz, answers, student, meta) {
  const mcQuestions = (quiz.questions || []).filter(q => q.type === "multi");
  let answeredCount = 0, correctCount = 0;

  const gradeDetail = mcQuestions.map((q, i) => {
    const optIdx = answers ? answers[i] : null;
    const attempted = optIdx != null;
    let correct = false, userOptionId = null;
    if (attempted) {
      answeredCount++;
      const opt = (q.options || [])[optIdx];
      userOptionId = opt ? opt.id : null;
      correct = !!(opt && opt.correct);
      if (correct) correctCount++;
    }
    return { qid: q.id, type: q.type, userAnswer: userOptionId, correct, points: correct ? 1 : 0, pointsMax: 1, attempted };
  });

  const notaMaxima = quiz.omrMaxGrade ?? 5;
  const grade = answeredCount > 0 ? +((correctCount / answeredCount) * notaMaxima).toFixed(2) : 0;
  const percent = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  return {
    quizId: quiz.id, quizTitle: quiz.title || "Quiz",
    studentName: (student && student.name) || "(sin asignar)",
    studentCourse: (student && student.course) || "—",
    examDate: (meta && meta.examDate) || new Date().toISOString().slice(0, 10),
    gradeDetail,
    correct: correctCount, total: mcQuestions.length, answered: answeredCount,
    percent, score: correctCount, pointsMax: mcQuestions.length, grade,
  };
}

// ------------------------------------------------------------
// Aplana pages[].sheets[] (de 13-omr-reader.js) en filas de tabla,
// detecta duplicados de studentId dentro del mismo lote y califica cada
// una con buildOmrResultData. El Modo Sin Celular es siempre 1 hoja por
// estudiante (12-omr.js no deja exportar un quiz con más preguntas de las
// que caben en una hoja), así que no hace falta fusionar nada aquí.
// ------------------------------------------------------------
function buildOmrEntries(pages, quiz) {
  const flat = [];
  (pages || []).forEach((p, pi) => {
    (p.sheets || []).forEach((sh, si) => {
      flat.push({
        id: `p${pi}-s${si}`,
        pageLabel: p.label,
        qr: sh.qr,
        student: sh.student || null,
        chosenStudentId: sh.chosenStudentId != null ? sh.chosenStudentId : ((sh.qr && sh.qr.ok) ? sh.qr.studentId : null),
        answers: sh.answers || [],
        preview: sh.preview || null,
        manuallyEdited: !!sh.manuallyEdited,
        status: sh.status || "pending",
        incidences: [...(sh.incidences || [])],
      });
    });
  });

  // Duplicados: mismo estudiante (por QR o elegido a mano) más de una vez
  // en este lote — nunca se decide en silencio cuál es la buena.
  const countBySid = {};
  flat.forEach(e => { if (e.chosenStudentId) countBySid[e.chosenStudentId] = (countBySid[e.chosenStudentId] || 0) + 1; });
  flat.forEach(e => {
    e.incidences = e.incidences.filter(c => c !== "DUPLICATE");
    if (e.chosenStudentId && countBySid[e.chosenStudentId] > 1) e.incidences.push("DUPLICATE");
  });

  flat.forEach(e => {
    const student = e.chosenStudentId ? (quiz.omrStudents || []).find(s => s.id === e.chosenStudentId) : null;
    e.student = student || null;
    e.result = buildOmrResultData(quiz, e.answers, student, {});
  });

  return flat;
}

// ------------------------------------------------------------
// Guardado (spec 6) — solo al confirmar. Misma colección "results" que
// los resultados digitales. Si ya existe un resultado para ese
// quizId+studentId, se pregunta antes de sobrescribir.
// ------------------------------------------------------------
async function confirmOmrEntry(quiz, entry) {
  const db = window.QS.db;
  const studentId = entry.chosenStudentId;
  if (!studentId) throw new Error("Asigna un estudiante antes de confirmar.");
  if (omrIsBlocked(entry)) throw new Error("Esta fila tiene una incidencia que bloquea el guardado.");

  const payload = {
    quizId: quiz.id,
    studentId,
    studentName: entry.result.studentName,
    studentCourse: entry.result.studentCourse,
    examDate: entry.result.examDate,
    source: "omr",
    specVersion: (window.SHEET_SPEC && window.SHEET_SPEC.version) || null,
    answers: entry.answers,
    gradeDetail: entry.result.gradeDetail,
    correct: entry.result.correct,
    total: entry.result.total,
    answered: entry.result.answered,
    percent: entry.result.percent,
    pointsEarned: entry.result.score,
    pointsMax: entry.result.pointsMax,
    score: entry.result.grade,      // "score" en esta colección es la NOTA 0-5 (igual que los resultados digitales)
    graded: true,
    incidences: entry.incidences,
    manuallyEdited: entry.manuallyEdited,
    confirmedBy: (window.QS.currentUser && window.QS.currentUser.uid) || null,
    confirmedAt: Date.now(),
    submittedAt: Date.now(),   // así ordena junto con los resultados digitales en la tabla existente
  };

  const existingSnap = await db.collection("results")
    .where("quizId", "==", quiz.id).where("studentId", "==", studentId).limit(1).get();

  if (!existingSnap.empty) {
    const old = existingSnap.docs[0].data();
    const oldGrade = (old.score != null) ? Number(old.score).toFixed(1) : "—";
    const proceed = window.confirm(
      `Ya existe un resultado guardado para ${payload.studentName} en este quiz.\n` +
      `Nota actual: ${oldGrade}   ·   Nota nueva (hoja escaneada): ${payload.score.toFixed(1)}\n\n` +
      `¿Sobrescribir el resultado existente con el de la hoja?`
    );
    if (!proceed) return "skipped";
    await db.collection("results").doc(existingSnap.docs[0].id).set(payload, { merge: true });
    return "overwritten";
  }
  await db.collection("results").add(payload);
  return "created";
}

// ------------------------------------------------------------
// UI — tabla (spec 5) + editor de respuestas (spec 5.2)
// ------------------------------------------------------------

// Desplegable de estudiante buscable: lista SIEMPRE completa (la que está
// guardada en el quiz desde la pestaña "📄 Hoja de respuestas"), ordenada
// alfabéticamente, y filtrable escribiendo cualquier parte del nombre
// (basta una inicial). Dibuja su propia lista (portal a document.body) en
// vez de <input list>+<datalist> nativo — el datalist del navegador no se
// veía en este entorno, y además así el listado nunca queda recortado por
// el contenedor con scroll de la tabla. `excludedStudentIds` son los que
// ya tienen nota GUARDADA en Firestore para este quiz (nunca los de otras
// hojas del mismo lote sin confirmar todavía — eso lo cubre la incidencia
// "Estudiante duplicado").
function omrStudentLabel(s) {
  return (s.name || s.id) + (s.course ? " · " + s.course : "");
}
function OMRStudentPicker({ students, value, onChange, excludedStudentIds, placeholder, style }) {
  const inputRef = useRefRes(null);
  const [open, setOpen] = useStateRes(false);
  const [rect, setRect] = useStateRes(null);
  const [query, setQuery] = useStateRes("");

  const options = useMemoRes(() => {
    const excluded = excludedStudentIds || new Set();
    return (students || [])
      .filter(s => !excluded.has(s.id) || s.id === value)
      .slice()
      .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "es", { sensitivity: "base" }));
  }, [students, excludedStudentIds, value]);

  const selected = options.find(s => s.id === value);
  useEffectRes(() => { setQuery(selected ? omrStudentLabel(selected) : ""); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemoRes(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && omrStudentLabel(selected) === query)) return options;
    return options.filter(s => omrStudentLabel(s).toLowerCase().includes(q));
  }, [options, query, selected]);

  const openList = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setOpen(true);
  };
  const pick = (s) => { onChange(s.id); setQuery(omrStudentLabel(s)); setOpen(false); };

  return (
    <div style={{ display: "inline-block", width: (style && style.width) || "100%" }}>
      <input ref={inputRef} className="qs-input" value={query}
        placeholder={placeholder || "Escribe para buscar…"}
        onFocus={openList}
        onChange={ev => { setQuery(ev.target.value); if (value) onChange(null); openList(); }}
        onBlur={() => setTimeout(() => {
          setOpen(false);
          setQuery(prevQuery => {
            const match = options.find(s => omrStudentLabel(s) === prevQuery);
            return match ? prevQuery : (selected ? omrStudentLabel(selected) : "");
          });
        }, 150)}
        style={{ ...style, width: "100%" }}
      />
      {open && ReactDOM.createPortal(
        <div className="qs-card" style={{
          position: "fixed", top: rect ? rect.bottom + 4 : 0, left: rect ? rect.left : 0,
          width: rect ? Math.max(rect.width, 220) : 220,
          maxHeight: 240, overflowY: "auto", zIndex: 9999, padding: 4,
        }}>
          {filtered.length ? filtered.map(s => (
            <div key={s.id} onMouseDown={ev => { ev.preventDefault(); pick(s); }}
              style={{ padding: "7px 10px", fontSize: 13, borderRadius: 8, cursor: "pointer", color: "var(--ink-900)" }}
              onMouseEnter={ev => { ev.currentTarget.style.background = "var(--ink-100)"; }}
              onMouseLeave={ev => { ev.currentTarget.style.background = "transparent"; }}
            >{omrStudentLabel(s)}</div>
          )) : (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--ink-400)" }}>Sin resultados</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function OMREditorModal({ entry, quiz, onClose, onSave, onAssignStudent, excludedStudentIds }) {
  const mcQuestions = (quiz.questions || []).filter(q => q.type === "multi").slice(0, entry.answers.length);
  const [answers, setAnswers] = useStateRes([...entry.answers]);
  const setAnswer = (qi, val) => setAnswers(prev => prev.map((v, i) => (i === qi ? val : v)));
  const live = useMemoRes(() => buildOmrResultData(quiz, answers, entry.student, { examDate: entry.result.examDate }), [answers]);
  const wrongQuiz = (entry.incidences || []).includes("WRONG_QUIZ");

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 250,
      display: "grid", placeItems: "center", padding: 20, overflowY: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{ padding: 24, maxWidth: 860, width: "100%", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>
            ✏️ Editar respuestas{entry.student ? ` · ${entry.student.name}` : ""}
          </h3>
          <span style={{
            fontWeight: 800, padding: "4px 12px", borderRadius: 8, fontSize: 15,
            background: live.grade >= 3 ? "#d1fae5" : "#fee2e2",
            color: live.grade >= 3 ? "#065f46" : "#991b1b",
          }}>{live.grade.toFixed(1)} · {live.correct}/{live.total}</span>
        </div>

        {/* El QR no identificó al estudiante — elegirlo a mano acá mismo,
            sin tener que cerrar el editor. Se descartan del desplegable
            los que ya tienen nota (guardada o asignada a otra hoja de este
            lote) para no asignar por error el mismo estudiante dos veces. */}
        {!entry.student && !wrongQuiz && onAssignStudent && (
          <div style={{
            marginBottom: 16, padding: 10, borderRadius: 10,
            background: "rgba(255,190,31,0.12)", border: "1px solid rgba(255,190,31,0.35)",
          }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#b45309", marginBottom: 6 }}>
              ⚠️ El QR no identificó al estudiante — elegilo a mano (o escribe una inicial para buscar):
            </label>
            <OMRStudentPicker students={quiz.omrStudents} value={entry.chosenStudentId}
              onChange={sid => onAssignStudent(entry.id, sid)}
              excludedStudentIds={excludedStudentIds}
              style={{ padding: "7px 10px", fontSize: 13, width: "100%", maxWidth: 340 }} />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.1fr)", gap: 20 }}>
          <div>
            {entry.preview
              ? <img src={entry.preview} alt="Hoja" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--ink-200)" }} />
              : <p style={{ color: "var(--ink-500)", fontSize: 13 }}>Sin vista previa.</p>}
          </div>
          <div style={{ maxHeight: 460, overflowY: "auto", paddingRight: 4 }}>
            {mcQuestions.map((q, qi) => (
              <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderBottom: "1px solid var(--ink-100)" }}>
                <span style={{ width: 20, fontSize: 12, color: "var(--ink-500)", fontWeight: 800, flexShrink: 0 }}>{qi + 1}</span>
                {(q.options || []).map((opt, oi) => {
                  const on = answers[qi] === oi;
                  return (
                    <button key={opt.id} onClick={() => setAnswer(qi, oi)} title={opt.text || `Opción ${String.fromCharCode(65 + oi)}`} style={{
                      width: 28, height: 28, borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer",
                      background: on ? "#2563eb" : "var(--ink-50)", color: on ? "#fff" : "var(--ink-600)",
                      border: "1px solid " + (on ? "#2563eb" : "var(--ink-200)"),
                    }}>{String.fromCharCode(65 + oi)}</button>
                  );
                })}
                <button onClick={() => setAnswer(qi, null)} title="Marcar sin respuesta" style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 600, background: "transparent", border: "none", cursor: "pointer",
                  color: answers[qi] == null ? "var(--red-500)" : "var(--ink-400)",
                }}>vacío</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <button className="qs-btn qs-btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="qs-btn qs-btn--primary" onClick={() => onSave(answers)}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

function OMRResultsTable({ quiz, entries, onAssignStudent, onEditAnswers, onConfirm, onConfirmAll, excludedStudentIds }) {
  const [editing, setEditing] = useStateRes(null);
  const [zoom, setZoom] = useStateRes(null);
  const [confirmingId, setConfirmingId] = useStateRes(null);
  const [confirmingAll, setConfirmingAll] = useStateRes(false);

  if (!entries.length) return null;
  const pendingCount = entries.filter(e => e.status !== "confirmed").length;
  // La entrada que edita el modal se busca de nuevo en `entries` en cada
  // render (en vez de usar directamente el snapshot capturado al abrirlo):
  // así, si dentro del editor se asigna un estudiante, el modal lo refleja
  // al toque sin tener que cerrarlo y volver a abrirlo.
  const editingLive = editing ? (entries.find(e => e.id === editing.id) || editing) : null;

  const handleConfirm = async (id) => {
    setConfirmingId(id);
    try { await onConfirm(id); } finally { setConfirmingId(null); }
  };
  const handleConfirmAll = async () => {
    setConfirmingAll(true);
    try { await onConfirmAll(); } finally { setConfirmingAll(false); }
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>📋 Resultados detectados ({entries.length})</h3>
        <button className="qs-btn qs-btn--success qs-btn--sm" disabled={!pendingCount || confirmingAll} onClick={handleConfirmAll}>
          {confirmingAll ? "Confirmando…" : `✅ Confirmar ${pendingCount} pendiente(s)`}
        </button>
      </div>

      <div className="qs-card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--ink-50)", textAlign: "left" }}>
                <th style={{ padding: 10, fontSize: 11 }}>Estudiante</th>
                <th style={{ padding: 10, fontSize: 11 }}>Curso</th>
                <th style={{ padding: 10, fontSize: 11 }}>Nota</th>
                <th style={{ padding: 10, fontSize: 11 }}>Aciertos</th>
                <th style={{ padding: 10, fontSize: 11 }}>Errores de lectura</th>
                <th style={{ padding: 10, fontSize: 11 }}>Editor</th>
                <th style={{ padding: 10, fontSize: 11 }}>Hoja</th>
                <th style={{ padding: 10, fontSize: 11 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => {
                const blocked = omrIsBlocked(e);
                const wrongQuiz = e.incidences.includes("WRONG_QUIZ");
                return (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--ink-100)" }}>
                    <td style={{ padding: 10, fontWeight: 600 }}>
                      {e.student ? e.student.name
                        : wrongQuiz ? <span style={{ color: "var(--red-500)", fontWeight: 700 }}>⚠️ Hoja de otro quiz</span>
                        : (
                          <OMRStudentPicker students={quiz.omrStudents} value={e.chosenStudentId}
                            onChange={sid => onAssignStudent(e.id, sid)}
                            excludedStudentIds={excludedStudentIds}
                            style={{ padding: "5px 6px", fontSize: 12, width: 160 }} />
                        )}
                    </td>
                    <td style={{ padding: 10, color: "var(--ink-500)" }}>{e.result.studentCourse}</td>
                    <td style={{ padding: 10 }}>
                      <span style={{
                        fontWeight: 700, padding: "2px 10px", borderRadius: 8,
                        background: e.result.grade >= 3 ? "#d1fae5" : "#fee2e2",
                        color: e.result.grade >= 3 ? "#065f46" : "#991b1b",
                      }}>{e.result.grade.toFixed(1)}</span>
                    </td>
                    <td style={{ padding: 10 }}>{e.result.correct}/{e.result.total}</td>
                    <td style={{ padding: 10 }}>
                      {e.incidences.length ? (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {e.incidences.map((code, k) => {
                            const isBlock = OMR_BLOCKING_CODES.some(b => code === b || code.indexOf(b + ":") === 0);
                            return (
                              <span key={k} title={code} style={{
                                fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 6,
                                background: isBlock ? "rgba(255,77,103,0.16)" : "rgba(245,158,11,0.18)",
                                color: isBlock ? "var(--red-500)" : "#fbbf24",
                              }}>{omrIncidenceLabel(code)}</span>
                            );
                          })}
                        </div>
                      ) : <span style={{ color: "var(--ink-400)" }}>—</span>}
                    </td>
                    <td style={{ padding: 10 }}>
                      <button className="qs-btn qs-btn--ghost qs-btn--sm" onClick={() => setEditing(e)}>✏️ Editar</button>
                    </td>
                    <td style={{ padding: 10 }}>
                      {e.preview && (
                        <img src={e.preview} alt="Hoja escaneada" onClick={() => setZoom(e)} title="Ver vista previa"
                          style={{ width: 42, height: 55, objectFit: "cover", borderRadius: 4, cursor: "pointer", border: "1px solid var(--ink-200)" }} />
                      )}
                    </td>
                    <td style={{ padding: 10 }}>
                      {e.status === "confirmed" ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--emerald-400)" }}>✅ Confirmada</span>
                      ) : (
                        <button className="qs-btn qs-btn--primary qs-btn--sm" disabled={blocked || confirmingId === e.id}
                          onClick={() => handleConfirm(e.id)} title={blocked ? "Resuelve las incidencias antes de confirmar" : "Guardar en Resultados"}>
                          {confirmingId === e.id ? "Guardando…" : "⏳ Confirmar"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editingLive && (
        <OMREditorModal entry={editingLive} quiz={quiz} onClose={() => setEditing(null)}
          onSave={(answers) => { onEditAnswers(editingLive.id, answers); setEditing(null); }}
          onAssignStudent={onAssignStudent} excludedStudentIds={excludedStudentIds} />
      )}

      {zoom && (
        <div onClick={() => setZoom(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 240,
          display: "grid", placeItems: "center", padding: 24,
        }}>
          <img src={zoom.preview} alt="Hoja escaneada" onClick={e => e.stopPropagation()}
            style={{ maxWidth: "92vw", maxHeight: "92vh", borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  OMR_BLOCKING_CODES, omrIsBlocked, omrIncidenceLabel,
  buildOmrResultData, buildOmrEntries, confirmOmrEntry,
  OMRResultsTable,
});
