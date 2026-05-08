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
      padding: "16px 32px", background: "var(--white)",
      borderBottom: "1px solid var(--ink-200)", position: "sticky", top: 0, zIndex: 50,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <button onClick={() => onNav("dashboard")} style={{
          display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)",
          fontWeight: 800, fontSize: 22, color: "var(--violet-700)",
        }}>
          <span style={{
            width: 36, height: 36, borderRadius: 12,
            background: "linear-gradient(135deg, var(--violet-500), var(--pink-500))",
            display: "grid", placeItems: "center", color: "#fff",
            boxShadow: "0 4px 0 var(--violet-700)",
          }}>
            <I.spark size={20} stroke="#fff" sw={2.5} />
          </span>
          QuizSpark
        </button>
        <nav style={{ display: "flex", gap: 4 }}>
          {[
            { id: "dashboard", label: "Mis quizzes" },
            { id: "results",   label: "Resultados" },
            { id: "library",   label: "Biblioteca" },
          ].map(item => (
            <button key={item.id} onClick={() => onNav(item.id)} style={{
              padding: "8px 14px", borderRadius: 999,
              background: active === item.id ? "var(--violet-100)" : "transparent",
              color: active === item.id ? "var(--violet-700)" : "var(--ink-500)",
              fontWeight: 700, fontSize: 14,
            }}>{item.label}</button>
          ))}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
        <button className="qs-btn qs-btn--ghost qs-btn--sm" onClick={() => onNav("join")}>
          <I.users size={16} /> Unirme a un quiz
        </button>
        <button className="qs-btn qs-btn--primary" onClick={onLaunch}>
          <I.play size={16} /> Iniciar sesión
        </button>
        <button
          onClick={() => setShowMenu(!showMenu)}
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--amber-400), var(--pink-500))",
            display: "grid", placeItems: "center", color: "#fff",
            fontWeight: 800, fontFamily: "var(--font-display)",
            border: "none", cursor: "pointer",
          }}
          title={user?.name || user?.email}
        >{initial}</button>

        {showMenu && (
          <>
            <div
              onClick={() => setShowMenu(false)}
              style={{ position: "fixed", inset: 0, zIndex: 60 }}
            />
            <div style={{
              position: "absolute", top: "100%", right: 0, marginTop: 8,
              background: "var(--white)", border: "1px solid var(--ink-200)",
              borderRadius: 12, padding: 8, minWidth: 240, zIndex: 70,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            }}>
              <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--ink-100)", marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.name || "Usuario"}</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{user?.email}</div>
                {user?.institution && (
                  <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>🏫 {user.institution}</div>
                )}
              </div>
              {onAdmin && (
                <button
                  onClick={() => { setShowMenu(false); onAdmin(); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8,
                    background: "transparent", border: "none", cursor: "pointer", fontSize: 14,
                    color: "var(--violet-700)", fontWeight: 600,
                  }}
                >🛡️ Panel de administración</button>
              )}
              <button
                onClick={() => { setShowMenu(false); onLogout(); }}
                style={{
                  width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8,
                  background: "transparent", border: "none", cursor: "pointer", fontSize: 14,
                  color: "var(--red-500)", fontWeight: 600,
                }}
              >🚪 Cerrar sesión</button>
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
            <button className="qs-btn" onClick={() => onLaunch()} style={{
              background: "rgba(255,255,255,.18)", color: "#fff", boxShadow: "0 0 0 2px rgba(255,255,255,.4) inset",
            }}>
              <I.play size={16} /> Sesión rápida
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
              <div style={{ fontWeight: 700, fontSize: 15, fontFamily: "var(--font-display)" }}>{q.title}</div>
              <div style={{ display: "flex", gap: 12, color: "var(--ink-500)", fontSize: 12, fontWeight: 600 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><I.list size={14}/> {q.qs} preguntas</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><I.play size={12}/> {q.plays} sesiones</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
                <button onClick={() => onOpenEditor(q.id)} className="qs-btn qs-btn--ghost qs-btn--sm" style={{ flex: 1 }}>
                  <I.edit size={14}/> Editar
                </button>
                <button onClick={() => onLaunch(q.id)} className="qs-btn qs-btn--primary qs-btn--sm" style={{ flex: 1 }}>
                  <I.play size={14}/> Iniciar
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
function Editor({ onBack, onLaunch }) {
  const [quiz, setQuiz] = useStateC(() => ({
    ...MOCK_QUIZ,
    id: "new-" + Date.now(),
    title: "Nuevo quiz",
    questions: [{
      id: "qq-" + Date.now(),
      type: "multi",
      text: "Escribe tu pregunta aquí",
      timer: 20,
      options: [
        { id: "a", text: "Opción A", correct: true },
        { id: "b", text: "Opción B", correct: false },
        { id: "c", text: "Opción C", correct: false },
        { id: "d", text: "Opción D", correct: false },
      ],
    }],
  }));
  const [activeIdx, setActiveIdx] = useStateC(0);
  const [showSettings, setShowSettings] = useStateC(false);
  const [saving, setSaving] = useStateC(false);
  const [saveStatus, setSaveStatus] = useStateC(""); // "" | "saved" | "error"
  const active = quiz.questions[activeIdx];

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("");
    try {
      const uid = window.QS.currentUser?.uid;
      if (!uid) throw new Error("No hay sesión activa");
      const data = {
        ...quiz,
        ownerId: uid,
        updatedAt: Date.now(),
      };
      // Si el id empieza con "new-", crear documento; si no, actualizar
      if (String(quiz.id).startsWith("new-") || !quiz.id) {
        const docRef = await window.QS.db.collection("quizzes").add(data);
        setQuiz(q => ({ ...q, id: docRef.id }));
      } else {
        await window.QS.db.collection("quizzes").doc(quiz.id).set(data, { merge: true });
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 2500);
    } catch (err) {
      console.error("Error guardando:", err);
      setSaveStatus("error");
      alert("Error al guardar: " + err.message);
    }
    setSaving(false);
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
    const base = { id, text: "", timer: 20 };
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
          <button onClick={() => setShowSettings(true)} className="qs-btn qs-btn--ghost qs-btn--sm">
            <I.lock size={14}/> Privacidad y reglas
          </button>
          <button className="qs-btn qs-btn--ghost qs-btn--sm">
            <I.eye size={14}/> Vista previa
          </button>
          <button onClick={handleSave} disabled={saving} className="qs-btn qs-btn--primary qs-btn--sm">
            {saving ? "Guardando..." : "💾 Guardar"}
          </button>
          <button className="qs-btn qs-btn--success" onClick={() => onLaunch(quiz.id)}>
            <I.play size={14}/> Lanzar
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <button onClick={(e) => { e.stopPropagation(); duplicateQuestion(i); }} title="Duplicar"
                      style={{ width: 22, height: 22, borderRadius: 6, color: "var(--ink-500)" }}>
                      <I.copy size={14}/>
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteQuestion(i); }} title="Eliminar"
                      style={{ width: 22, height: 22, borderRadius: 6, color: "var(--red-500)" }}>
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

            <textarea value={active.text}
              onChange={e => updateQuestion({ text: e.target.value })}
              placeholder="Escribe tu pregunta..."
              style={{
                width: "100%", border: "2px dashed var(--ink-200)", borderRadius: 16,
                padding: 20, fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)",
                resize: "none", outline: "none", minHeight: 80, marginBottom: 20,
                background: "var(--ink-50)", color: "var(--ink-900)",
              }}/>

            {/* Image / cover slot */}
            <div style={{
              border: "2px dashed var(--ink-200)", borderRadius: 16, padding: 20,
              textAlign: "center", color: "var(--ink-400)", marginBottom: 20,
              background: "var(--ink-50)", fontSize: 14, fontWeight: 600,
            }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>🖼️</div>
              Agregar imagen o medio (opcional)
            </div>

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
                      placeholder="Opción..." style={{
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
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(20,16,43,.5)", zIndex: 100,
      display: "grid", placeItems: "center",
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{ padding: 28, maxWidth: 480 }}>
        <h2 style={{ marginBottom: 16 }}>Privacidad y reglas</h2>
        <Field label="Contraseña de acceso">
          <input className="qs-input" value={quiz.password}
            onChange={e => setQuiz({ ...quiz, password: e.target.value })} />
        </Field>
        <button onClick={onClose} className="qs-btn qs-btn--primary" style={{ width: "100%" }}>Listo</button>
      </div>
    </div>
  );
}

Object.assign(window, { TopNav, Dashboard, Editor });
