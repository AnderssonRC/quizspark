/* global React, ReactDOM, TopNav, Dashboard, Editor, I */
// ============================================================
// QuizSpark — App shell + router + autenticación
// ============================================================
const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

function getURLParam(name) {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  } catch (e) { return null; }
}

// Malla de seguridad de EJECUCIÓN: si una vista falla mientras se usa,
// muestra un mensaje claro con salida, en vez de pantalla en blanco.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary capturó:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: "100vh", display: "grid", placeItems: "center",
          background: "var(--ink-50)", padding: 20,
        }}>
          <div className="qs-card" style={{ padding: 32, maxWidth: 460, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
            <h2 style={{ fontSize: 20, marginBottom: 8 }}>Esta sección tuvo un problema</h2>
            <p style={{ fontSize: 14, color: "var(--ink-500)", marginBottom: 20 }}>
              El resto de la aplicación sigue funcionando. Puedes reintentar o volver al inicio.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="qs-btn qs-btn--primary"
                onClick={() => this.setState({ error: null })}>
                ↻ Reintentar
              </button>
              <button className="qs-btn qs-btn--ghost"
                onClick={() => { window.location.href = window.location.origin + window.location.pathname; }}>
                🏠 Ir al inicio
              </button>
            </div>
            <details style={{ marginTop: 18, textAlign: "left", fontSize: 11, color: "var(--ink-400)" }}>
              <summary style={{ cursor: "pointer" }}>Detalle técnico (envíalo si pides ayuda)</summary>
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error))}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
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
  const [unauthedJoin, setUnauthedJoin] = useStateA(false); // estudiante uniéndose desde el login

  // ---- Guarda de navegación: el botón "Atrás" del navegador no debe
  // sacar al docente de Desafíate, debe devolverlo al Dashboard ----
  // Sin esto, como la app nunca usa pushState, "Atrás" simplemente
  // navega a lo que había en el historial ANTES de llegar a la app (el
  // buscador, otro sitio, etc.) — se sale de Desafíate sin aviso, sin
  // importar en qué pantalla interna estaba.
  // Estrategia: al entrar, se agrega UNA entrada "canario" al historial.
  // Si el usuario presiona Atrás estando en cualquier pantalla que no
  // sea el Dashboard (editor, resultados, biblioteca, sala en vivo,
  // panel de admin, unirse desde el nav), se resetea todo al Dashboard
  // y se vuelve a agregar el canario — así ese "Atrás" se queda DENTRO
  // de la app. Solo si ya estaba en el Dashboard (sin nada abierto) se
  // deja que el navegador siga para atrás con normalidad (ahí sí tiene
  // sentido salir, porque ya se llegó al "inicio" de la app).
  const navStateRef = useRefA({ view: "dashboard", showAdmin: false, showJoinFromNav: false });
  useEffectA(() => {
    navStateRef.current = { view, showAdmin, showJoinFromNav };
  });
  useEffectA(() => {
    if (examCode || joinCode) return; // esos modos son de estudiante, sin shell propio
    window.history.pushState({ qsApp: true }, "");
    const onPopState = () => {
      const st = navStateRef.current;
      const atHome = st.view === "dashboard" && !st.showAdmin && !st.showJoinFromNav;
      if (atHome) return; // ya estaba en el inicio: dejar que salga normalmente
      setView("dashboard");
      setShowAdmin(false);
      setShowJoinFromNav(false);
      window.history.pushState({ qsApp: true }, "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [examCode, joinCode]);

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
            // Temas de color retirados: siempre el tema base
            applyTheme("default");
          } else {
            await window.QS.auth.signOut();
            setUser(null);
            setUserData(null);
            applyTheme("default");
          }
        } catch (err) {
          console.error("Error obteniendo perfil:", err);
        }
      } else {
        setUser(null);
        setUserData(null);
        window.QS.currentUser = null;
        window.QS.currentUserData = null;
        applyTheme("default");
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
    // Si el estudiante optó por unirse desde la pantalla de login
    if (unauthedJoin) {
      return <window.QS.StudentJoinLive onCancel={() => setUnauthedJoin(false)} />;
    }
    if (authView === "register") {
      return <window.QS.RegisterScreen onSwitchToLogin={() => setAuthView("login")} />;
    }
    // Banner permanente arriba del login con la salida para estudiantes
    return (
      <div>
        <div style={{
          background: "linear-gradient(135deg, var(--violet-600), var(--violet-700))",
          color: "white", padding: "14px 20px",
          display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center",
          gap: 12, textAlign: "center", fontSize: 14,
        }}>
          <span style={{ fontWeight: 600 }}>
            🎓 ¿Eres estudiante? No necesitas crear cuenta.
          </span>
          <button
            onClick={() => setUnauthedJoin(true)}
            className="qs-btn qs-btn--sm"
            style={{
              background: "white", color: "var(--violet-700)",
              fontWeight: 700, border: 0,
            }}
          >
            Unirme con un código →
          </button>
        </div>
        <window.QS.LoginScreen onSwitchToRegister={() => setAuthView("register")} />
      </div>
    );
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
    <div style={{ minHeight: "100vh", background: "var(--ink-50)", display: "flex", flexDirection: "column" }}>
      <TopNav
        active={view}
        onNav={handleNav}
        onLaunch={() => alert("Selecciona un quiz desde 'Mis quizzes' para iniciar una sala en vivo.")}
        user={userData}
        onLogout={handleLogout}
        onAdmin={userData?.role === "admin" ? () => setShowAdmin(true) : null}
      />

      <div style={{ flex: 1 }}>
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
      <Footer />
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary><App/></ErrorBoundary>
);
