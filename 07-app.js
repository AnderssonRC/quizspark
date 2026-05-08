/* global React, ReactDOM, TopNav, Dashboard, Editor, HostFlow, ResultsDashboard, ParticipantFlow, I */
// ============================================================
// QuizSpark — App shell + router + autenticación
// ============================================================
const { useState: useStateA, useEffect: useEffectA } = React;

function App() {
  // ---- Estado de autenticación ----
  const [authChecking, setAuthChecking] = useStateA(true);
  const [authView, setAuthView] = useStateA("login"); // login | register
  const [user, setUser] = useStateA(null);
  const [userData, setUserData] = useStateA(null);

  // ---- Estado de la app ----
  const [view, setView] = useStateA("dashboard");
  const [editingId, setEditingId] = useStateA(null);
  const [showAdmin, setShowAdmin] = useStateA(false);

  // ---- Listener de sesión Firebase ----
  useEffectA(() => {
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
            // Usuario auth pero sin perfil — caso raro, cerrar sesión
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
  }, []);

  const handleLogout = async () => {
    await window.QS.auth.signOut();
    setView("dashboard");
    setShowAdmin(false);
  };

  // ---- Render según estado de sesión ----

  // 1. Verificando sesión
  if (authChecking) {
    return <window.QS.AuthLoading message="Verificando sesión..." />;
  }

  // 2. No hay sesión: mostrar login o registro
  if (!user) {
    if (authView === "register") {
      return <window.QS.RegisterScreen onSwitchToLogin={() => setAuthView("login")} />;
    }
    return <window.QS.LoginScreen onSwitchToRegister={() => setAuthView("register")} />;
  }

  // 3. Sesión iniciada pero pendiente de aprobación
  if (userData?.status === "pending") {
    return <window.QS.PendingScreen user={userData} onLogout={handleLogout} />;
  }

  // 4. Sesión iniciada pero rechazada
  if (userData?.status === "rejected") {
    return <window.QS.RejectedScreen onLogout={handleLogout} />;
  }

  // 5. Si admin abrió el panel
  if (showAdmin && userData?.role === "admin") {
    return <window.QS.AdminPanel onClose={() => setShowAdmin(false)} />;
  }

  // 6. Sesión aprobada: mostrar la app
  const handleNav = (target) => {
    if (target === "join") setView("participant");
    else if (target === "admin") setShowAdmin(true);
    else setView(target);
  };

  const showChrome = ["dashboard", "library", "results"].includes(view) || view === "editor";

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink-50)" }}>
      {showChrome && view !== "editor" && (
        <TopNav
          active={view}
          onNav={handleNav}
          onLaunch={() => setView("host")}
          user={userData}
          onLogout={handleLogout}
          onAdmin={userData?.role === "admin" ? () => setShowAdmin(true) : null}
        />
      )}
      {view === "editor" && (
        <TopNav
          active="dashboard"
          onNav={handleNav}
          onLaunch={() => setView("host")}
          user={userData}
          onLogout={handleLogout}
          onAdmin={userData?.role === "admin" ? () => setShowAdmin(true) : null}
        />
      )}

      {view === "dashboard" && (
        <Dashboard
          onOpenEditor={(id) => { setEditingId(id); setView("editor"); }}
          onLaunch={(id) => { setEditingId(id); setView("host"); }}
          onResults={() => setView("results")}
        />
      )}
      {view === "editor" && (
        <Editor onBack={() => setView("dashboard")} onLaunch={() => setView("host")}/>
      )}
      {view === "host" && (
        <HostFlow onBack={() => setView("dashboard")} onResults={() => setView("results")}/>
      )}
      {view === "results" && (
        <ResultsDashboard onBack={() => setView("dashboard")}/>
      )}
      {view === "library" && (
        <LibraryView onBack={() => setView("dashboard")}/>
      )}
      {view === "participant" && (
        <ParticipantFlow onExit={() => setView("dashboard")}/>
      )}
    </div>
  );
}

// LibraryView (mantenido del archivo original, simplificado)
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
