/* global React, ReactDOM, TopNav, Dashboard, Editor, I */
// ============================================================
// QuizSpark — App shell + router + autenticación
// ============================================================
const { useState: useStateA, useEffect: useEffectA } = React;

function getURLParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  } catch (e) { return null; }
}

function App() {
  // Detección de modos especiales por URL
  const [examCode] = useStateA(getURLParam("exam"));   // evaluación asincrónica
  const [joinCode] = useStateA(getURLParam("join"));   // sala en vivo

  // ---- Estado de autenticación ----
  const [authChecking, setAuthChecking] = useStateA(true);
  const [authView, setAuthView] = useStateA("login");
  const [user, setUser] = useStateA(null);
  const [userData, setUserData] = useStateA(null);

  // ---- Estado de la app (profesor) ----
  const [view, setView] = useStateA("dashboard");
  const [editingId, setEditingId] = useStateA(null);
  const [liveQuizId, setLiveQuizId] = useStateA(null);
  const [showAdmin, setShowAdmin] = useStateA(false);
  const [showJoinFromNav, setShowJoinFromNav] = useStateA(false);

  // ---- Listener de sesión Firebase (solo si NO estamos en modo estudiante por URL) ----
  useEffectA(() => {
    if (examCode || joinCode) {
      setAuthChecking(false);
      return;
    }
    const unsub = window.QS.auth.onAuthStateChanged(async (fbUser) => {
      if (fbUser) {
        try {
          const doc = await window.QS.db.collection("users").doc(fbUser.uid).get();
          if (doc.exists) {
            const data = doc.data();
            setUser(fbUser);
            setUserData(data);
            window.QS.currentUser = fbUser;
            window.QS.currentUserData = data;
          } else {
            await window.QS.auth.signOut();
            setUser(null);
            setUserData(null);
          }
        } catch (err) {
          console.error("Error obteniendo perfil:", err);
        }
      } else {
        setUser(null);
        setUserData(null);
        window.QS.currentUser = null;
        window.QS.currentUserData = null;
      }
      setAuthChecking(false);
    });
    return () => unsub();
  }, [examCode, joinCode]);

  const handleLogout = async () => {
    await window.QS.auth.signOut();
    setView("dashboard");
    setShowAdmin(false);
  };

  // ===== MODOS ESPECIALES POR URL (sin login) =====
  if (examCode) {
    return <window.QS.StudentExam examCode={examCode} />;
  }
  if (joinCode) {
    return <window.QS.StudentJoinLive
      initialCode={joinCode}
      onCancel={() => window.location.href = window.location.origin + window.location.pathname}
    />;
  }

  // ===== MODO PROFESOR (requiere login) =====
  if (authChecking) return <window.QS.AuthLoading message="Verificando sesión..." />;

  if (!user) {
    if (authView === "register") {
      return <window.QS.RegisterScreen onSwitchToLogin={() => setAuthView("login")} />;
    }
    return <window.QS.LoginScreen onSwitchToRegister={() => setAuthView("register")} />;
  }

  if (userData?.status === "pending") {
    return <window.QS.PendingScreen user={userData} onLogout={handleLogout} />;
  }
  if (userData?.status === "rejected") {
    return <window.QS.RejectedScreen onLogout={handleLogout} />;
  }
  if (showAdmin && userData?.role === "admin") {
    return <window.QS.AdminPanel onClose={() => setShowAdmin(false)} />;
  }

  // ===== VISTA: SALA EN VIVO (profesor) =====
  if (view === "live" && liveQuizId) {
    return <window.QS.LiveSessionHost
      quizId={liveQuizId}
      onExit={() => { setView("dashboard"); setLiveQuizId(null); }}
    />;
  }

  // ===== VISTA: JOIN desde botón TopNav =====
  if (showJoinFromNav) {
    return <window.QS.StudentJoinLive onCancel={() => setShowJoinFromNav(false)} />;
  }

  const handleNav = (target) => {
    if (target === "join") setShowJoinFromNav(true);
    else if (target === "admin") setShowAdmin(true);
    else setView(target);
  };

  // Función global para lanzar sala en vivo desde Dashboard/Editor
  const startLiveSession = (quizId) => {
    if (!quizId || String(quizId).startsWith("new-")) {
      alert("Primero guarda el quiz antes de iniciar una sala en vivo.");
      return;
    }
    setLiveQuizId(quizId);
    setView("live");
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink-50)" }}>
      <TopNav
        active={view}
        onNav={handleNav}
        onLaunch={() => alert("Selecciona un quiz desde 'Mis quizzes' para iniciar una sala en vivo.")}
        user={userData}
        onLogout={handleLogout}
        onAdmin={userData?.role === "admin" ? () => setShowAdmin(true) : null}
      />

      {view === "dashboard" && (
        <Dashboard
          onOpenEditor={(id) => { setEditingId(id); setView("editor"); }}
          onLaunch={startLiveSession}
          onResults={() => setView("results")}
        />
      )}
      {view === "editor" && (
        <Editor
          quizId={editingId}
          onBack={() => setView("dashboard")}
          onLaunch={startLiveSession}
        />
      )}
      {view === "results" && (
        <window.QS.OnlineResultsPanel onBack={() => setView("dashboard")}/>
      )}
      {view === "library" && (
        <LibraryView onBack={() => setView("dashboard")}/>
      )}
    </div>
  );
}

function LibraryView({ onBack }) {
  const items = [
    { emoji: "📚", title: "Plantilla: Historia", desc: "Conceptos clave", c: "var(--violet-600)" },
    { emoji: "🧮", title: "Plantilla: Matemáticas", desc: "Operaciones básicas", c: "var(--emerald-500)" },
    { emoji: "🌍", title: "Plantilla: Geografía", desc: "Capitales y banderas", c: "var(--sky-500)" },
    { emoji: "🎬", title: "Plantilla: Cine y series", desc: "Para iniciar reuniones", c: "var(--violet-700)" },
  ];
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Biblioteca</h1>
      <p style={{ color: "var(--ink-500)", marginBottom: 24 }}>
        Plantillas listas para arrancar tu próximo quiz en segundos.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {items.map((it, i) => (
          <div key={i} className="qs-card" style={{ overflow: "hidden" }}>
            <div style={{
              height: 120, background: it.c, display: "grid", placeItems: "center", fontSize: 56,
            }}>{it.emoji}</div>
            <div style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: 4 }}>{it.title}</div>
              <div style={{ fontSize: 13, color: "var(--ink-500)", marginBottom: 12 }}>{it.desc}</div>
              <button onClick={onBack} className="qs-btn qs-btn--ghost qs-btn--sm" style={{ width: "100%" }}>
                Usar plantilla
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
