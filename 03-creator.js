/* global React, I, QUESTION_TYPES, tileColor, tileShape, MOCK_QUIZ */
// ============================================================
// QuizSpark — Creator views: Dashboard, Editor
// ============================================================
const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

// =================== TOP NAV ===================
function TopNav({ active, onNav, onLaunch, user, onLogout, onAdmin }) {
  const [showMenu, setShowMenu] = useStateC(false);
  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", background: "var(--white)",
      borderBottom: "1px solid var(--ink-200)", position: "sticky", top: 0, zIndex: 50,
      flexWrap: "nowrap", gap: 8,
    }}>
      {/* Logo */}
      <button onClick={() => onNav("dashboard")} style={{
        display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-display)",
        fontWeight: 800, fontSize: 18, color: "var(--violet-700)", flexShrink: 0,
        background: "transparent", border: "none", cursor: "pointer", padding: 0,
      }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: "linear-gradient(135deg, var(--violet-500), var(--pink-500))",
          display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff",
        }}>
          <I.spark size={18} stroke="#fff" sw={2.5} />
        </span>
        <span className="qs-nav-logo-text">QuizSpark</span>
      </button>

      {/* Nav central — oculto en móvil pequeño */}
      <nav className="qs-nav-tabs" style={{ display: "flex", gap: 2, flex: 1, justifyContent: "center" }}>
        {[
          { id: "dashboard", label: "Mis quizzes" },
          { id: "results",   label: "Resultados" },
          { id: "library",   label: "Biblioteca" },
        ].map(item => (
          <button key={item.id} onClick={() => onNav(item.id)} style={{
            padding: "7px 11px", borderRadius: 999,
            background: active === item.id ? "var(--violet-100)" : "transparent",
            color: active === item.id ? "var(--violet-700)" : "var(--ink-500)",
            fontWeight: 700, fontSize: 13,
            border: "none", cursor: "pointer", whiteSpace: "nowrap",
          }}>{item.label}</button>
        ))}
      </nav>

      {/* Acciones */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, position: "relative" }}>
        {/* "Unirme" solo ícono en móvil */}
        <button className="qs-btn qs-btn--ghost qs-btn--sm qs-btn-join" onClick={() => onNav("join")}
          title="Unirme a un quiz">
          <I.users size={15} />
          <span className="qs-nav-btn-text"> Unirme</span>
        </button>
        {/* "Iniciar" solo ícono en móvil pequeño */}
        <button className="qs-btn qs-btn--primary qs-btn--sm" onClick={onLaunch}
          title="Iniciar sesión en vivo">
          <I.play size={15} />
          <span className="qs-nav-btn-text"> Iniciar</span>
        </button>

        {/* Avatar */}
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--amber-400), var(--pink-500))",
            display: "grid", placeItems: "center", color: "#fff",
            fontWeight: 800, fontFamily: "var(--font-display)", fontSize: 14,
            border: "none", cursor: "pointer", flexShrink: 0,
          }}
          title={user?.name || user?.email}
        >{initial}</button>

        {showMenu && (
          <>
            <div onClick={() => setShowMenu(false)}
              style={{ position: "fixed", inset: 0, zIndex: 60 }} />
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 8,
              background: "var(--white)", border: "1px solid var(--ink-200)",
              borderRadius: 12, padding: 8, minWidth: 220, zIndex: 70,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--ink-100)", marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.name || "Usuario"}</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{user?.email}</div>
                {user?.institution && (
                  <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>🏫 {user.institution}</div>
                )}
              </div>
              {/* En móvil, mostrar la navegación también en el menú */}
              <div className="qs-menu-nav-mobile">
                {[
                  { id: "dashboard", label: "📋 Mis quizzes" },
                  { id: "results", label: "📊 Resultados" },
                  { id: "library", label: "📚 Biblioteca" },
                ].map(item => (
                  <button key={item.id}
                    onClick={() => { setShowMenu(false); onNav(item.id); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8,
                      background: active === item.id ? "var(--violet-50)" : "transparent",
                      color: active === item.id ? "var(--violet-700)" : "var(--ink-700)",
                      border: "none", cursor: "pointer", fontSize: 14, fontWeight: active === item.id ? 700 : 400,
                    }}
                  >{item.label}</button>
                ))}
                <div style={{ borderTop: "1px solid var(--ink-100)", margin: "4px 0" }}/>
              </div>
              {onAdmin && (
                <button onClick={() => { setShowMenu(false); onAdmin(); }} style={{
                  width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8,
                  background: "transparent", border: "none", cursor: "pointer", fontSize: 14,
                  color: "var(--violet-700)", fontWeight: 600,
                }}>🛡️ Panel de administración</button>
              )}
              <button onClick={() => { setShowMenu(false); onLogout(); }} style={{
                width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8,
                background: "transparent", border: "none", cursor: "pointer", fontSize: 14,
                color: "var(--red-500)", fontWeight: 600,
              }}>🚪 Cerrar sesión</button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

// =================== DASHBOARD ===================
function Dashboard({ onOpenEditor, onLaunch, onResults }) {
  const [quizzes, setQuizzes] = useStateC([]);
  const [loadingQuizzes, setLoadingQuizzes] = useStateC(true);
  const userData = window.QS.currentUserData;
  const userName = userData?.name || "Profesor";
  const firstName = userName.split(" ")[0];

  useEffectC(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const uid = window.QS.currentUser?.uid;
        if (!uid) { setLoadingQuizzes(false); return; }
        const snap = await window.QS.db.collection("quizzes")
          .where("ownerId", "==", uid).get();
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title || "Sin título",
            emoji: data.cover || "✨",
            qs: (data.questions || []).length,
            plays: data.plays || 0,
            color: data.color || "var(--violet-500)",
            isPublished: data.isPublished || false,
            publishCode: data.publishCode || null,
            updatedAt: data.updatedAt || 0,
          };
        });
        list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (!cancelled) { setQuizzes(list); setLoadingQuizzes(false); }
      } catch (err) {
        console.error("Error cargando quizzes:", err);
        if (!cancelled) setLoadingQuizzes(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const deleteQuiz = async (id) => {
    if (!confirm("¿Eliminar este quiz? Esta acción no se puede deshacer.")) return;
    try {
      await window.QS.db.collection("quizzes").doc(id).delete();
      setQuizzes(quizzes.filter(q => q.id !== id));
    } catch (err) {
      alert("Error al eliminar: " + err.message);
    }
  };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px" }}>
      {/* Hero */}
      <div className="qs-card" style={{
        padding: "32px 40px", marginBottom: 32, position: "relative", overflow: "hidden",
        background: "linear-gradient(120deg, var(--violet-600) 0%, var(--pink-500) 100%)",
        color: "#fff",
      }}>
        <div style={{ position: "relative", zIndex: 2, maxWidth: 600 }}>
          <div className="qs-chip" style={{
            background: "rgba(255,255,255,.2)", color: "#fff", marginBottom: 12,
          }}>
            <I.flame size={14} stroke="#fff" /> {quizzes.length} quizzes en tu biblioteca
          </div>
          <h1 style={{ fontSize: 36, color: "#fff", marginBottom: 8 }}>¡Hola, {firstName}! 👋</h1>
          <p style={{ opacity: .9, marginBottom: 20, fontSize: 16 }}>
            Crea un quiz, comparte el código con tus participantes y mira las respuestas en vivo.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="qs-btn" onClick={() => onOpenEditor("new")} style={{
              background: "#fff", color: "var(--violet-700)", boxShadow: "0 4px 0 rgba(0,0,0,.2)",
            }}>
              <I.plus size={18} /> Nuevo quiz
            </button>
            <button className="qs-btn" onClick={() => {
              if (quizzes.length === 0) {
                alert("Crea primero un quiz para poder iniciar una sala.");
              } else {
                onLaunch(quizzes[0].id);
              }
            }} style={{
              background: "rgba(255,255,255,.18)", color: "#fff", boxShadow: "0 0 0 2px rgba(255,255,255,.4) inset",
            }}>
              <I.play size={16} /> Sala con último quiz
            </button>
          </div>
        </div>
        {/* Decorative shapes */}
        <div style={{ position: "absolute", right: -40, top: -30, opacity: .25 }}>
          <div style={{ fontSize: 220, lineHeight: 1, filter: "blur(.5px)" }}>✨</div>
        </div>
        <div style={{ position: "absolute", right: 80, bottom: -20, fontSize: 90, opacity: .35 }}>🎯</div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { label: "Quizzes creados", value: quizzes.length, icon: "list", c: "var(--violet-500)" },
          { label: "Sesiones jugadas", value: quizzes.reduce((s, q) => s + (q.plays || 0), 0), icon: "play", c: "var(--pink-500)" },
          { label: "Total de preguntas", value: quizzes.reduce((s, q) => s + (q.qs || 0), 0), icon: "users", c: "var(--amber-500)" },
          { label: "Tu rol", value: (window.QS.currentUserData?.role === "admin" ? "Admin" : "Profesor"), icon: "star", c: "var(--emerald-500)" },
        ].map((s, i) => {
          const Ico = I[s.icon];
          return (
            <div key={i} className="qs-card" style={{ padding: 18, display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: s.c,
                display: "grid", placeItems: "center", color: "#fff",
              }}><Ico size={22} stroke="#fff" /></div>
              <div>
                <div style={{ fontSize: 13, color: "var(--ink-500)", fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "var(--font-display)" }}>{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quiz grid */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 22 }}>Mis quizzes</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
            background: "var(--white)", borderRadius: 999, border: "1px solid var(--ink-200)",
          }}>
            <I.search size={16} stroke="var(--ink-400)" />
            <input placeholder="Buscar quiz..." style={{ border: 0, outline: 0, width: 180, background: "transparent" }} />
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        <button onClick={() => onOpenEditor("new")} className="qs-card" style={{
          padding: 24, border: "2px dashed var(--violet-200)", background: "var(--violet-50)",
          minHeight: 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, color: "var(--violet-700)", cursor: "pointer",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, background: "var(--violet-600)",
            display: "grid", placeItems: "center", boxShadow: "0 4px 0 var(--violet-700)",
          }}><I.plus size={28} stroke="#fff" sw={3} /></div>
          <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "var(--font-display)" }}>Nuevo quiz</div>
          <div style={{ fontSize: 13, color: "var(--violet-700)", opacity: .75 }}>Empieza desde cero</div>
        </button>
        {loadingQuizzes && (
          <div className="qs-card" style={{
            padding: 24, minHeight: 220, display: "grid", placeItems: "center",
            color: "var(--ink-500)",
          }}>Cargando tus quizzes...</div>
        )}
        {!loadingQuizzes && quizzes.length === 0 && (
          <div className="qs-card" style={{
            padding: 24, minHeight: 220, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", textAlign: "center",
            color: "var(--ink-500)", gridColumn: "span 2",
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📝</div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Aún no tienes quizzes</div>
            <div style={{ fontSize: 13 }}>Crea tu primer quiz haciendo clic en "Nuevo quiz" 👈</div>
          </div>
        )}
        {quizzes.map(q => (
          <div key={q.id} className="qs-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{
              height: 110, background: q.color, display: "grid", placeItems: "center",
              fontSize: 56, position: "relative",
            }}>
              <span>{q.emoji}</span>
              <button
                onClick={() => deleteQuiz(q.id)}
                title="Eliminar quiz"
                style={{
                  position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: 999,
                  background: "rgba(255,255,255,.25)", color: "#fff", display: "grid", placeItems: "center",
                  border: "none", cursor: "pointer",
                }}><I.trash size={16} stroke="#fff" /></button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--font-display)", flex: 1 }}>{q.title}</div>
                {q.isPublished && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px",
                    borderRadius: 6, background: "#d1fae5", color: "#065f46", whiteSpace: "nowrap",
                  }}>🟢 ONLINE</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, color: "var(--ink-500)", fontSize: 12, fontWeight: 600 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><I.list size={14}/> {q.qs} preguntas</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><I.play size={12}/> {q.plays} sesiones</span>
              </div>
              {q.isPublished && q.publishCode && (
                <button
                  onClick={() => {
                    const url = window.location.origin + window.location.pathname + "?exam=" + q.publishCode;
                    navigator.clipboard.writeText(url);
                    alert("Enlace copiado:\n" + url);
                  }}
                  className="qs-btn qs-btn--ghost qs-btn--sm"
                  style={{ fontSize: 12 }}
                >🔗 Copiar enlace ({q.publishCode})</button>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                <button onClick={() => onOpenEditor(q.id)} className="qs-btn qs-btn--ghost qs-btn--sm" style={{ flex: 1 }}>
                  <I.edit size={14}/> Editar
                </button>
                <button onClick={() => onLaunch(q.id)} className="qs-btn qs-btn--primary qs-btn--sm" style={{ flex: 1 }}>
                  🎮 Sala en vivo
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =================== EDITOR ===================
function Editor({ quizId, onBack, onLaunch }) {
  const [quiz, setQuiz] = useStateC(() => ({
    ...MOCK_QUIZ,
    id: "new-" + Date.now(),
    title: "Nuevo quiz",
    questions: [{
      id: "qq-" + Date.now(),
      type: "multi",
      text: "",
      timer: 20,
      pointsCorrect: 100,
      pointsWrong: 0,
      pointsSpeedBonus: 0,
      options: [
        { id: "a", text: "", correct: true },
        { id: "b", text: "", correct: false },
        { id: "c", text: "", correct: false },
        { id: "d", text: "", correct: false },
      ],
    }],
    gradingScale: [
      { from: 0,    to: 0,    grade: 1.0 },   // se calcula dinámicamente con setupDefaultScale
    ],
  }));
  const [activeIdx, setActiveIdx] = useStateC(0);
  const [showSettings, setShowSettings] = useStateC(false);
  const [saving, setSaving] = useStateC(false);
  const [saveStatus, setSaveStatus] = useStateC("");
  const [showPublish, setShowPublish] = useStateC(false);
  const [loadingQuiz, setLoadingQuiz] = useStateC(false);
  const active = quiz.questions[activeIdx];

  // Cargar quiz desde Firestore si recibimos un id existente
  useEffectC(() => {
    if (!quizId || quizId === "new") return;
    setLoadingQuiz(true);
    window.QS.db.collection("quizzes").doc(quizId).get()
      .then(doc => {
        if (doc.exists) {
          const data = { id: doc.id, ...doc.data() };
          if (!data.questions || data.questions.length === 0) {
            data.questions = [{
              id: "qq-" + Date.now(), type: "multi",
              text: "", timer: 20,
              pointsCorrect: 100, pointsWrong: 0, pointsSpeedBonus: 0,
              options: [
                { id: "a", text: "", correct: true },
                { id: "b", text: "", correct: false },
              ],
            }];
          } else {
            // Aplicar defaults de puntaje a preguntas sin esos campos (quizzes viejos)
            data.questions = data.questions.map(q => ({
              ...q,
              pointsCorrect: q.pointsCorrect ?? 100,
              pointsWrong: q.pointsWrong ?? 0,
              pointsSpeedBonus: q.pointsSpeedBonus ?? 0,
            }));
          }
          setQuiz(data);
          setActiveIdx(0);
        }
      })
      .catch(err => {
        console.error("Error cargando quiz:", err);
        alert("Error cargando el quiz: " + err.message);
      })
      .finally(() => setLoadingQuiz(false));
  }, [quizId]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("");
    try {
      const uid = window.QS.currentUser?.uid;
      if (!uid) throw new Error("No hay sesión activa");

      // Limpiar el id interno antes de guardar (no debe ir dentro del documento)
      const { id: _ignoreId, ...dataNoId } = quiz;
      const data = { ...dataNoId, ownerId: uid, updatedAt: Date.now() };

      let realId;
      if (String(quiz.id).startsWith("new-") || !quiz.id) {
        const docRef = await window.QS.db.collection("quizzes").add(data);
        realId = docRef.id;
        // Sobrescribir con el id correcto adentro
        await window.QS.db.collection("quizzes").doc(realId).update({ id: realId });
        setQuiz(q => ({ ...q, id: realId }));
      } else {
        realId = quiz.id;
        // Asegurar que el campo id dentro del doc coincida con el ID real
        await window.QS.db.collection("quizzes").doc(realId).set(
          { ...data, id: realId }, { merge: true }
        );
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2500);
      return realId;
    } catch (err) {
      console.error("Error guardando:", err);
      setSaveStatus("error");
      alert("Error al guardar: " + err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePublishClick = async () => {
    // Asegurar que esté guardado antes de publicar
    if (String(quiz.id).startsWith("new-")) {
      const ok = await handleSave();
      if (!ok) return;
    } else {
      await handleSave();
    }
    setShowPublish(true);
  };

  const updateQuestion = (patch) => {
    setQuiz(q => ({
      ...q,
      questions: q.questions.map((qq, i) => i === activeIdx ? { ...qq, ...patch } : qq),
    }));
  };

  const updateOption = (oid, patch) => {
    updateQuestion({
      options: active.options.map(o => o.id === oid ? { ...o, ...patch } : o),
    });
  };

  const addQuestion = (type) => {
    const id = "qq-" + Date.now();
    const base = { id, text: "", timer: 20, pointsCorrect: 100, pointsWrong: 0, pointsSpeedBonus: 0 };
    let q;
    if (type === "multi") q = { ...base, type, options: [
      { id: "a", text: "", correct: false }, { id: "b", text: "", correct: false },
      { id: "c", text: "", correct: false }, { id: "d", text: "", correct: false },
    ]};
    else if (type === "truefalse") q = { ...base, type, options: [
      { id: "t", text: "Verdadero", correct: false }, { id: "f", text: "Falso", correct: false },
    ]};
    else if (type === "checks") q = { ...base, type, options: [
      { id: "a", text: "", correct: false }, { id: "b", text: "", correct: false },
      { id: "c", text: "", correct: false }, { id: "d", text: "", correct: false },
    ]};
    else q = { ...base, type: "text", acceptedAnswers: [] };
    setQuiz(qz => ({ ...qz, questions: [...qz.questions, q] }));
    setActiveIdx(quiz.questions.length);
  };

  const duplicateQuestion = (idx) => {
    const orig = quiz.questions[idx];
    const copy = { ...orig, id: "qq-" + Date.now() };
    setQuiz(qz => ({
      ...qz,
      questions: [...qz.questions.slice(0, idx + 1), copy, ...qz.questions.slice(idx + 1)],
    }));
  };

  const deleteQuestion = (idx) => {
    if (quiz.questions.length === 1) return;
    setQuiz(qz => ({ ...qz, questions: qz.questions.filter((_, i) => i !== idx) }));
    setActiveIdx(Math.max(0, idx - 1));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 73px)" }}>
      {/* Editor toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 24px", background: "var(--white)", borderBottom: "1px solid var(--ink-200)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
          <button onClick={onBack} className="qs-btn qs-btn--ghost qs-btn--sm">
            <I.back size={16} /> Salir
          </button>
          <input value={quiz.title} onChange={e => setQuiz({ ...quiz, title: e.target.value })}
            style={{
              fontSize: 18, fontWeight: 700, fontFamily: "var(--font-display)",
              border: 0, outline: 0, background: "transparent", padding: "6px 10px",
              borderRadius: 8, minWidth: 320, color: "var(--ink-900)",
            }}/>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saveStatus === "saved" && (
            <span style={{ fontSize: 13, color: "var(--emerald-600)", fontWeight: 600 }}>
              ✓ Guardado
            </span>
          )}
          {quiz.isPublished && (
            <span style={{
              fontSize: 12, fontWeight: 700, padding: "4px 10px",
              borderRadius: 8, background: "#d1fae5", color: "#065f46",
            }}>🟢 Publicado</span>
          )}
          <button onClick={() => setShowSettings(true)} className="qs-btn qs-btn--ghost qs-btn--sm">
            <I.lock size={14}/> Calificación y reglas
          </button>
          <button onClick={handlePublishClick} className="qs-btn qs-btn--ghost qs-btn--sm">
            🌐 Publicar online
          </button>
          <button onClick={handleSave} disabled={saving} className="qs-btn qs-btn--primary qs-btn--sm">
            {saving ? "Guardando..." : "💾 Guardar"}
          </button>
          <button className="qs-btn qs-btn--success" onClick={async () => {
            // Si el id es temporal o nunca se guardó, forzar guardar primero
            let realId = quiz.id;
            if (!realId || String(realId).startsWith("new-")) {
              realId = await handleSave();
              if (!realId) {
                alert("No se pudo guardar el quiz. Inténtalo de nuevo antes de lanzar la sala.");
                return;
              }
            } else {
              // Si ya tiene id real, guardar cambios pendientes silenciosamente
              await handleSave();
            }
            onLaunch(realId);
          }}>
            🎮 Sala en vivo
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 320px", flex: 1, minHeight: 0 }}>
        {/* Question list */}
        <aside style={{
          background: "var(--white)", borderRight: "1px solid var(--ink-200)",
          padding: 16, overflowY: "auto",
        }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-500)", letterSpacing: ".05em", marginBottom: 10 }}>
            PREGUNTAS · {quiz.questions.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {quiz.questions.map((q, i) => {
              const t = QUESTION_TYPES.find(t => t.id === q.type);
              const Tico = t ? I[t.icon] : I.list;
              return (
                <div key={q.id} onClick={() => setActiveIdx(i)} style={{
                  padding: 10, borderRadius: 12, cursor: "pointer",
                  background: activeIdx === i ? "var(--violet-100)" : "transparent",
                  border: activeIdx === i ? "2px solid var(--violet-400)" : "2px solid transparent",
                  display: "flex", gap: 8, alignItems: "flex-start",
                }}>
                  <div style={{
                    minWidth: 28, height: 28, borderRadius: 8, background: "var(--violet-600)",
                    color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13,
                  }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-900)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.text || <span style={{ color: "var(--ink-400)", fontStyle: "italic" }}>Sin título</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2,
                      fontSize: 11, color: "var(--ink-500)", fontWeight: 600 }}>
                      <Tico size={12} /> {t?.label}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button onClick={(e) => { e.stopPropagation(); duplicateQuestion(i); }} title="Duplicar"
                      style={{
                        width: 24, height: 24, borderRadius: 6, color: "var(--ink-500)",
                        background: "transparent", border: "none", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        padding: 0,
                      }}>
                      <I.copy size={14}/>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteQuestion(i); }} title="Eliminar"
                      style={{
                        width: 24, height: 24, borderRadius: 6, color: "var(--red-500)",
                        background: "transparent", border: "none", cursor: "pointer",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        padding: 0,
                      }}>
                      <I.trash size={14}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--ink-500)", letterSpacing: ".05em", marginBottom: 8 }}>
            AGREGAR PREGUNTA
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {QUESTION_TYPES.map(t => {
              const Tico = I[t.icon];
              return (
                <button key={t.id} onClick={() => addQuestion(t.id)} style={{
                  padding: "10px 8px", borderRadius: 12, background: "var(--ink-50)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                  border: "1px solid var(--ink-200)", color: "var(--ink-700)",
                }}>
                  <Tico size={18} stroke="var(--violet-600)"/>
                  <div style={{ fontSize: 11, fontWeight: 700, textAlign: "center" }}>{t.label}</div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: question canvas */}
        <main style={{
          background: "var(--ink-50)", padding: "32px 40px", overflowY: "auto",
        }}>
          <div className="qs-card" style={{ padding: 28, maxWidth: 800, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span className="qs-chip">
                {(()=>{const t=QUESTION_TYPES.find(t=>t.id===active.type);const Tico=I[t.icon];return <><Tico size={12}/> {t.label}</>;})()}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-500)", fontSize: 13, fontWeight: 600 }}>
                <I.clock size={14}/>
                <input type="number" value={active.timer}
                  onChange={e => updateQuestion({ timer: +e.target.value })}
                  style={{ width: 50, border: "1px solid var(--ink-200)", borderRadius: 8, padding: "4px 8px", textAlign: "center" }}/>
                seg
              </span>
            </div>

            {/* === Puntuación de la pregunta === */}
            <div style={{
              background: "var(--violet-50)", border: "1px solid var(--violet-200)",
              borderRadius: 12, padding: 14, marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--violet-700)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                🎯 Puntuación de esta pregunta
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Si ACIERTA
                  </span>
                  <input type="number"
                    value={active.pointsCorrect ?? 100}
                    onChange={e => updateQuestion({ pointsCorrect: +e.target.value })}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 8,
                      border: "1px solid var(--ink-200)", fontWeight: 700,
                      fontSize: 16, color: "var(--emerald-600)",
                    }}
                  />
                </label>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Si FALLA
                  </span>
                  <input type="number"
                    value={active.pointsWrong ?? 0}
                    onChange={e => updateQuestion({ pointsWrong: +e.target.value })}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 8,
                      border: "1px solid var(--ink-200)", fontWeight: 700,
                      fontSize: 16, color: "var(--red-500)",
                    }}
                  />
                </label>
                <label style={{ display: "block" }}>
                  <span style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, display: "block", marginBottom: 4 }}>
                    Bonus VELOCIDAD (máx)
                  </span>
                  <input type="number"
                    value={active.pointsSpeedBonus ?? 0}
                    onChange={e => updateQuestion({ pointsSpeedBonus: +e.target.value })}
                    style={{
                      width: "100%", padding: "8px 10px", borderRadius: 8,
                      border: "1px solid var(--ink-200)", fontWeight: 700,
                      fontSize: 16, color: "var(--amber-500)",
                    }}
                  />
                </label>
              </div>
              <p style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.5 }}>
                ℹ️ El bonus por velocidad solo aplica en modo <b>sala en vivo</b>. Puedes usar valores negativos en "Si falla" para penalizar respuestas incorrectas.
              </p>
            </div>

            <textarea value={active.text}
              onChange={e => updateQuestion({ text: e.target.value })}
              placeholder="Escribe tu pregunta aquí..."
              style={{
                width: "100%", border: "2px dashed var(--ink-200)", borderRadius: 16,
                padding: 20, fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)",
                resize: "none", outline: "none", minHeight: 80, marginBottom: 20,
                background: "var(--ink-50)", color: "var(--ink-900)",
              }}/>

            {/* Options */}
            {active.type === "text" ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-700)", marginBottom: 8 }}>
                  Respuestas aceptadas (separadas por coma)
                </div>
                <input className="qs-input" placeholder="ej: colón, colones"
                  value={(active.acceptedAnswers || []).join(", ")}
                  onChange={e => updateQuestion({ acceptedAnswers: e.target.value.split(",").map(s => s.trim()) })}/>
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--ink-500)" }}>
                  Las respuestas se comparan ignorando mayúsculas y acentos.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10,
                gridTemplateColumns: active.type === "truefalse" ? "1fr 1fr" : "1fr 1fr" }}>
                {active.options.map((o, i) => (
                  <div key={o.id} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                    borderRadius: 14, background: tileColor(i), color: "#fff",
                    boxShadow: "var(--shadow-tile)",
                  }}>
                    <div style={{ fontSize: 22, opacity: .85, width: 24, textAlign: "center" }}>{tileShape(i)}</div>
                    <input value={o.text}
                      onChange={e => updateOption(o.id, { text: e.target.value })}
                      placeholder={`Opción ${String.fromCharCode(65 + i)}...`}
                      style={{
                        flex: 1, background: "rgba(255,255,255,.2)", color: "#fff",
                        border: 0, outline: 0, padding: "8px 12px", borderRadius: 10,
                        fontWeight: 600, fontSize: 15, minWidth: 0,
                      }}/>
                    <button onClick={() => updateOption(o.id, { correct: !o.correct })}
                      title={o.correct ? "Correcta" : "Marcar correcta"}
                      style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: o.correct ? "#fff" : "rgba(255,255,255,.2)",
                        color: o.correct ? "var(--emerald-600)" : "#fff",
                        display: "grid", placeItems: "center", flexShrink: 0,
                      }}>
                      <I.check size={18} sw={3}/>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 12, color: "var(--ink-500)", textAlign: "center" }}>
              {active.type === "checks" ? "💡 Marca todas las respuestas correctas" :
               active.type === "multi"  ? "💡 Marca solo una respuesta correcta" :
               active.type === "truefalse" ? "💡 Selecciona si la afirmación es verdadera o falsa" :
               "💡 Acepta varias respuestas equivalentes"}
            </div>
          </div>
        </main>

        {/* Right: settings panel */}
        <aside style={{
          background: "var(--white)", borderLeft: "1px solid var(--ink-200)",
          padding: 20, overflowY: "auto",
        }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Configuración del quiz</h3>

          <Field label="Acceso">
            <div style={{ display: "flex", gap: 6 }}>
              {["pública", "con contraseña"].map((opt, i) => (
                <button key={opt} onClick={() => setQuiz({ ...quiz, access: i === 1 ? "password" : "public" })}
                  style={{
                    flex: 1, padding: "8px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    background: (quiz.access || "password") === (i === 1 ? "password" : "public") ? "var(--violet-100)" : "var(--ink-50)",
                    color: (quiz.access || "password") === (i === 1 ? "password" : "public") ? "var(--violet-700)" : "var(--ink-500)",
                    border: "1px solid var(--ink-200)",
                  }}>{opt}</button>
              ))}
            </div>
          </Field>

          <Field label="Contraseña">
            <div style={{ position: "relative" }}>
              <input className="qs-input" value={quiz.password}
                onChange={e => setQuiz({ ...quiz, password: e.target.value.toUpperCase() })}/>
              <button onClick={() => setQuiz({ ...quiz, password: Math.random().toString(36).slice(2, 8).toUpperCase() })}
                style={{ position: "absolute", right: 8, top: 8, fontSize: 11, color: "var(--violet-600)", fontWeight: 700 }}>
                Generar
              </button>
            </div>
          </Field>

          <Field label="Ritmo del quiz">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { id: "timer",  icon: "timer", label: "Con temporizador", desc: "Cada pregunta tiene su tiempo" },
                { id: "manual", icon: "hand",  label: "Avanzo yo (host)", desc: "Yo decido cuándo pasar" },
              ].map(opt => {
                const Ico = I[opt.icon];
                const sel = quiz.pacing === opt.id;
                return (
                  <button key={opt.id} onClick={() => setQuiz({ ...quiz, pacing: opt.id })} style={{
                    padding: 12, borderRadius: 12, textAlign: "left", display: "flex", gap: 10,
                    background: sel ? "var(--violet-50)" : "var(--ink-50)",
                    border: sel ? "2px solid var(--violet-500)" : "2px solid transparent",
                  }}>
                    <Ico size={20} stroke={sel ? "var(--violet-600)" : "var(--ink-500)"}/>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Exportar respuestas">
            <button className="qs-btn qs-btn--ghost qs-btn--sm" style={{ width: "100%", justifyContent: "flex-start" }}>
              <I.sheets size={16} stroke="var(--emerald-600)"/>
              <span style={{ flex: 1, textAlign: "left" }}>Conectado a Google Sheets</span>
              <span style={{ width: 8, height: 8, background: "var(--emerald-500)", borderRadius: "50%" }}></span>
            </button>
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--ink-500)", lineHeight: 1.4 }}>
              Cada respuesta se añade automáticamente a tu hoja vinculada en tiempo real.
            </div>
          </Field>

          <Field label="Mostrar después de cada pregunta">
            <Toggle label="Respuesta correcta" defaultOn />
            <Toggle label="Ranking actualizado" defaultOn />
            <Toggle label="Estadísticas por opción" />
          </Field>
        </aside>
      </div>

      {showSettings && <SettingsModal quiz={quiz} setQuiz={setQuiz} onClose={() => setShowSettings(false)}/>}
      {showPublish && (
        <window.QS.PublishModal
          quiz={quiz}
          onClose={() => setShowPublish(false)}
          onPublished={(updated) => setQuiz(q => ({ ...q, ...updated }))}
        />
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, fontWeight: 800, color: "var(--ink-500)", letterSpacing: ".05em",
        marginBottom: 8, textTransform: "uppercase",
      }}>{label}</div>
      {children}
    </div>
  );
}

function Toggle({ label, defaultOn }) {
  const [on, setOn] = useStateC(!!defaultOn);
  return (
    <div onClick={() => setOn(!on)} style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "8px 0", cursor: "pointer", fontSize: 13,
    }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <div style={{
        width: 36, height: 20, borderRadius: 999, padding: 2, position: "relative",
        background: on ? "var(--violet-500)" : "var(--ink-200)", transition: "background .15s",
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transform: `translateX(${on ? 16 : 0}px)`, transition: "transform .15s",
        }}/>
      </div>
    </div>
  );
}

function SettingsModal({ quiz, setQuiz, onClose }) {
  // Calcular total máximo del quiz sumando pointsCorrect + pointsSpeedBonus de cada pregunta
  const totalMaxPoints = (quiz.questions || []).reduce((sum, q) => {
    const correct = q.pointsCorrect ?? 100;
    const bonus = q.pointsSpeedBonus ?? 0;
    return sum + correct + bonus;
  }, 0);

  // Tabla de conversión por defecto (escala colombiana 0-5) si no existe
  const defaultScale = [
    { from: 0,                       to: Math.floor(totalMaxPoints * 0.30) - 1, grade: 1.0 },
    { from: Math.floor(totalMaxPoints * 0.30), to: Math.floor(totalMaxPoints * 0.60) - 1, grade: 2.0 },
    { from: Math.floor(totalMaxPoints * 0.60), to: Math.floor(totalMaxPoints * 0.80) - 1, grade: 3.0 },
    { from: Math.floor(totalMaxPoints * 0.80), to: Math.floor(totalMaxPoints * 0.90) - 1, grade: 4.0 },
    { from: Math.floor(totalMaxPoints * 0.90), to: totalMaxPoints,                       grade: 5.0 },
  ];

  const currentScale = (quiz.gradingScale && quiz.gradingScale.length > 0 && quiz.gradingScale[0].to !== 0)
    ? quiz.gradingScale
    : defaultScale;

  const updateRange = (idx, field, value) => {
    const next = [...currentScale];
    next[idx] = { ...next[idx], [field]: value };
    setQuiz({ ...quiz, gradingScale: next });
  };

  const addRange = () => {
    const last = currentScale[currentScale.length - 1];
    const newRange = { from: (last.to || 0) + 1, to: (last.to || 0) + 100, grade: (last.grade || 0) + 1 };
    setQuiz({ ...quiz, gradingScale: [...currentScale, newRange] });
  };

  const removeRange = (idx) => {
    const next = currentScale.filter((_, i) => i !== idx);
    setQuiz({ ...quiz, gradingScale: next });
  };

  const resetScale = () => {
    if (confirm("¿Restablecer la tabla a la escala colombiana 0-5 por defecto?")) {
      setQuiz({ ...quiz, gradingScale: defaultScale });
    }
  };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(20,16,43,.5)", zIndex: 100,
      display: "grid", placeItems: "center", padding: 20, overflow: "auto",
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{
        padding: 28, maxWidth: 580, width: "100%", maxHeight: "90vh", overflowY: "auto",
      }}>
        <h2 style={{ marginBottom: 16, fontSize: 22 }}>⚙️ Configuración del quiz</h2>

        <Field label="Contraseña de acceso (opcional)">
          <input className="qs-input" value={quiz.password || ""}
            onChange={e => setQuiz({ ...quiz, password: e.target.value })}
            placeholder="Dejar vacío si no se requiere" />
        </Field>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--ink-200)" }}>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>📊 Tabla de conversión a nota</h3>
          <p style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 12 }}>
            Define cómo se traducen los puntos obtenidos a una nota.
          </p>

          <div style={{
            background: "var(--violet-50)", border: "1px solid var(--violet-200)",
            padding: 10, borderRadius: 10, marginBottom: 12, fontSize: 13, color: "var(--violet-700)",
          }}>
            <b>Total máximo del quiz:</b> {totalMaxPoints} puntos
            <br/>
            <span style={{ fontSize: 11, opacity: 0.85 }}>
              (suma de "si acierta" + bonus de velocidad de todas las preguntas)
            </span>
          </div>

          {currentScale.map((range, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6,
              marginBottom: 8, fontSize: 13,
            }}>
              <span style={{ minWidth: 30, color: "var(--ink-500)" }}>De</span>
              <input type="number" value={range.from}
                onChange={e => updateRange(i, "from", +e.target.value)}
                style={{ width: 80, padding: 6, borderRadius: 6, border: "1px solid var(--ink-200)", textAlign: "center" }}
              />
              <span style={{ color: "var(--ink-500)" }}>a</span>
              <input type="number" value={range.to}
                onChange={e => updateRange(i, "to", +e.target.value)}
                style={{ width: 80, padding: 6, borderRadius: 6, border: "1px solid var(--ink-200)", textAlign: "center" }}
              />
              <span style={{ color: "var(--ink-500)" }}>→ nota</span>
              <input type="number" step="0.1" value={range.grade}
                onChange={e => updateRange(i, "grade", +e.target.value)}
                style={{
                  width: 70, padding: 6, borderRadius: 6, border: "1px solid var(--violet-300)",
                  textAlign: "center", fontWeight: 700, color: "var(--violet-700)",
                }}
              />
              <button onClick={() => removeRange(i)}
                style={{
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "var(--red-500)", fontSize: 18, padding: 4,
                }}
                title="Eliminar este rango"
              >🗑️</button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={addRange} className="qs-btn qs-btn--ghost qs-btn--sm">
              + Agregar rango
            </button>
            <button onClick={resetScale} className="qs-btn qs-btn--ghost qs-btn--sm">
              ↻ Restaurar 0-5
            </button>
          </div>
        </div>

        <button onClick={onClose} className="qs-btn qs-btn--primary" style={{ width: "100%", marginTop: 24 }}>
          Listo
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { TopNav, Dashboard, Editor });
