/* global React, firebase */
// ============================================================
// QuizSpark — Autenticación: Login, Registro, Aprobación, Admin
// ============================================================

const { useState: useStateAuth, useEffect: useEffectAuth } = React;

// ---------- Pantalla de carga ----------
function AuthLoading({ message = "Cargando..." }) {
  return (
    <div style={{
      minHeight: "100vh", display: "grid", placeItems: "center",
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
      color: "var(--white)", fontFamily: "var(--font-display)"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>QuizSpark</h1>
        <p style={{ opacity: 0.8 }}>{message}</p>
      </div>
    </div>
  );
}

// ---------- Layout común para login/registro ----------
function AuthShell({ children }) {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, var(--violet-600), var(--violet-900))",
      display: "grid", placeItems: "center", padding: 20
    }}>
      <div style={{
        background: "var(--white)", padding: 40, borderRadius: 20,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        width: "100%", maxWidth: 440
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚡</div>
          <h1 style={{
            fontSize: 28, fontFamily: "var(--font-display)",
            color: "var(--violet-700)", marginBottom: 4
          }}>QuizSpark</h1>
          <p style={{ color: "var(--ink-500)", fontSize: 14 }}>
            Plataforma educativa de quizzes
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- Pantalla de Login ----------
function LoginScreen({ onSwitchToRegister }) {
  const [email, setEmail] = useStateAuth("");
  const [password, setPassword] = useStateAuth("");
  const [error, setError] = useStateAuth("");
  const [loading, setLoading] = useStateAuth(false);

  const handleSubmit = async () => {
    setError("");
    if (!email || !password) {
      setError("Completa todos los campos.");
      return;
    }
    setLoading(true);
    try {
      await window.QS.auth.signInWithEmailAndPassword(email, password);
      // El listener onAuthStateChanged en App se encarga del resto
    } catch (err) {
      let msg = "Error al iniciar sesión.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
        msg = "Correo o contraseña incorrectos.";
      } else if (err.code === "auth/invalid-email") {
        msg = "El formato del correo no es válido.";
      } else if (err.code === "auth/too-many-requests") {
        msg = "Demasiados intentos. Espera unos minutos.";
      }
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <h2 style={{ fontSize: 20, marginBottom: 16, textAlign: "center" }}>Iniciar sesión</h2>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
          Correo electrónico
        </label>
        <input
          type="email"
          className="qs-input"
          placeholder="profesor@colegio.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
          Contraseña
        </label>
        <input
          type="password"
          className="qs-input"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
      </div>

      {error && (
        <div style={{
          background: "#fee2e2", color: "#991b1b", padding: 10,
          borderRadius: 8, fontSize: 13, marginBottom: 14
        }}>
          {error}
        </div>
      )}

      <button
        className="qs-btn qs-btn--primary qs-btn--lg"
        style={{ width: "100%", marginBottom: 16 }}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Ingresando..." : "Iniciar sesión"}
      </button>

      <div style={{ textAlign: "center", fontSize: 14, color: "var(--ink-500)" }}>
        ¿No tienes cuenta?{" "}
        <button
          onClick={onSwitchToRegister}
          style={{
            background: "none", border: "none", color: "var(--violet-600)",
            fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 14
          }}
        >
          Regístrate aquí
        </button>
      </div>
    </AuthShell>
  );
}

// ---------- Pantalla de Registro ----------
function RegisterScreen({ onSwitchToLogin }) {
  const [name, setName] = useStateAuth("");
  const [email, setEmail] = useStateAuth("");
  const [password, setPassword] = useStateAuth("");
  const [password2, setPassword2] = useStateAuth("");
  const [institution, setInstitution] = useStateAuth("");
  const [error, setError] = useStateAuth("");
  const [success, setSuccess] = useStateAuth(false);
  const [loading, setLoading] = useStateAuth(false);

  const handleSubmit = async () => {
    setError("");
    if (!name || !email || !password || !institution) {
      setError("Completa todos los campos.");
      return;
    }
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const cred = await window.QS.auth.createUserWithEmailAndPassword(email, password);
      // Guardar perfil en Firestore con estado pendiente
      await window.QS.db.collection("users").doc(cred.user.uid).set({
        name,
        email,
        institution,
        role: "teacher",
        status: "pending", // pending | approved | rejected
        createdAt: new Date().toISOString(),
      });
      // Cerrar sesión: el usuario debe esperar aprobación
      await window.QS.auth.signOut();
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      let msg = "Error al registrar.";
      if (err.code === "auth/email-already-in-use") {
        msg = "Este correo ya está registrado.";
      } else if (err.code === "auth/invalid-email") {
        msg = "El formato del correo no es válido.";
      } else if (err.code === "auth/weak-password") {
        msg = "La contraseña es demasiado débil.";
      }
      setError(msg);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthShell>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✉️</div>
          <h2 style={{ fontSize: 22, marginBottom: 12, color: "var(--emerald-600)" }}>
            Solicitud enviada
          </h2>
          <p style={{ color: "var(--ink-500)", marginBottom: 20, lineHeight: 1.6 }}>
            Tu cuenta ha sido creada y está <strong>pendiente de aprobación</strong>.
            Recibirás acceso cuando un administrador la apruebe.
          </p>
          <button
            className="qs-btn qs-btn--primary qs-btn--lg"
            style={{ width: "100%" }}
            onClick={onSwitchToLogin}
          >
            Volver al inicio
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h2 style={{ fontSize: 20, marginBottom: 16, textAlign: "center" }}>Crear cuenta</h2>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
          Nombre completo
        </label>
        <input
          type="text" className="qs-input"
          placeholder="María Rodríguez"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
          Institución educativa
        </label>
        <input
          type="text" className="qs-input"
          placeholder="Colegio San Bernardo"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
          Correo electrónico
        </label>
        <input
          type="email" className="qs-input"
          placeholder="profesor@colegio.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
          Contraseña (mínimo 6 caracteres)
        </label>
        <input
          type="password" className="qs-input"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
          Confirmar contraseña
        </label>
        <input
          type="password" className="qs-input"
          placeholder="••••••••"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
        />
      </div>

      {error && (
        <div style={{
          background: "#fee2e2", color: "#991b1b", padding: 10,
          borderRadius: 8, fontSize: 13, marginBottom: 14
        }}>
          {error}
        </div>
      )}

      <button
        className="qs-btn qs-btn--primary qs-btn--lg"
        style={{ width: "100%", marginBottom: 12 }}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? "Creando cuenta..." : "Solicitar acceso"}
      </button>

      <p style={{
        fontSize: 12, color: "var(--ink-500)",
        textAlign: "center", marginBottom: 16, lineHeight: 1.5
      }}>
        Tu cuenta requerirá aprobación de un administrador antes de poder acceder.
      </p>

      <div style={{ textAlign: "center", fontSize: 14, color: "var(--ink-500)" }}>
        ¿Ya tienes cuenta?{" "}
        <button
          onClick={onSwitchToLogin}
          style={{
            background: "none", border: "none", color: "var(--violet-600)",
            fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 14
          }}
        >
          Inicia sesión
        </button>
      </div>
    </AuthShell>
  );
}

// ---------- Pantalla "Pendiente de aprobación" ----------
function PendingScreen({ user, onLogout }) {
  return (
    <AuthShell>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
        <h2 style={{ fontSize: 22, marginBottom: 12, color: "var(--amber-500)" }}>
          Cuenta en revisión
        </h2>
        <p style={{ color: "var(--ink-700)", marginBottom: 8, fontWeight: 600 }}>
          Hola, {user?.name || user?.email}
        </p>
        <p style={{ color: "var(--ink-500)", marginBottom: 24, lineHeight: 1.6 }}>
          Tu cuenta está pendiente de aprobación por parte de un administrador.
          Te recomendamos volver a intentar más tarde.
        </p>
        <button
          className="qs-btn qs-btn--ghost qs-btn--lg"
          style={{ width: "100%" }}
          onClick={onLogout}
        >
          Cerrar sesión
        </button>
      </div>
    </AuthShell>
  );
}

// ---------- Pantalla "Cuenta rechazada" ----------
function RejectedScreen({ onLogout }) {
  return (
    <AuthShell>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🚫</div>
        <h2 style={{ fontSize: 22, marginBottom: 12, color: "var(--red-500)" }}>
          Acceso denegado
        </h2>
        <p style={{ color: "var(--ink-500)", marginBottom: 24, lineHeight: 1.6 }}>
          Tu solicitud de acceso no fue aprobada. Si crees que esto es un error,
          contacta al administrador de la plataforma.
        </p>
        <button
          className="qs-btn qs-btn--ghost qs-btn--lg"
          style={{ width: "100%" }}
          onClick={onLogout}
        >
          Cerrar sesión
        </button>
      </div>
    </AuthShell>
  );
}

// ---------- Panel de Administrador ----------
function AdminPanel({ onClose }) {
  const [users, setUsers] = useStateAuth([]);
  const [loading, setLoading] = useStateAuth(true);
  const [filter, setFilter] = useStateAuth("pending"); // pending | approved | rejected | all

  const loadUsers = async () => {
    setLoading(true);
    try {
      const snap = await window.QS.db.collection("users").get();
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      setUsers(list);
    } catch (err) {
      console.error("Error cargando usuarios:", err);
    }
    setLoading(false);
  };

  useEffectAuth(() => { loadUsers(); }, []);

  const updateStatus = async (userId, newStatus) => {
    try {
      await window.QS.db.collection("users").doc(userId).update({ status: newStatus });
      await loadUsers();
    } catch (err) {
      alert("Error al actualizar: " + err.message);
    }
  };

  const filtered = filter === "all" ? users : users.filter(u => u.status === filter);

  const statusBadge = (status) => {
    const styles = {
      pending: { bg: "#fef3c7", color: "#92400e", label: "Pendiente" },
      approved: { bg: "#d1fae5", color: "#065f46", label: "Aprobado" },
      rejected: { bg: "#fee2e2", color: "#991b1b", label: "Rechazado" },
    };
    const s = styles[status] || styles.pending;
    return (
      <span style={{
        background: s.bg, color: s.color, padding: "4px 10px",
        borderRadius: 12, fontSize: 12, fontWeight: 600
      }}>{s.label}</span>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink-50)", padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, marginBottom: 4 }}>Panel de administración</h1>
            <p style={{ color: "var(--ink-500)" }}>Gestiona las solicitudes de acceso</p>
          </div>
          <button className="qs-btn qs-btn--ghost" onClick={onClose}>← Volver a la app</button>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {[
            { k: "pending", label: "Pendientes" },
            { k: "approved", label: "Aprobados" },
            { k: "rejected", label: "Rechazados" },
            { k: "all", label: "Todos" },
          ].map(t => (
            <button
              key={t.k}
              className={"qs-btn " + (filter === t.k ? "qs-btn--primary" : "qs-btn--ghost")}
              onClick={() => setFilter(t.k)}
            >
              {t.label} ({t.k === "all" ? users.length : users.filter(u => u.status === t.k).length})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="qs-card" style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
            Cargando usuarios...
          </div>
        ) : filtered.length === 0 ? (
          <div className="qs-card" style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>
            No hay usuarios en esta categoría.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map(u => (
              <div key={u.id} className="qs-card" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <h3 style={{ fontSize: 16, margin: 0 }}>{u.name || "Sin nombre"}</h3>
                      {statusBadge(u.status)}
                      {u.role === "admin" && (
                        <span style={{
                          background: "var(--violet-100)", color: "var(--violet-700)",
                          padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600
                        }}>Admin</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
                      📧 {u.email}<br/>
                      🏫 {u.institution || "—"}<br/>
                      📅 {u.createdAt ? new Date(u.createdAt).toLocaleString("es-CO") : "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {u.status !== "approved" && u.role !== "admin" && (
                      <button
                        className="qs-btn qs-btn--success qs-btn--sm"
                        onClick={() => updateStatus(u.id, "approved")}
                      >Aprobar</button>
                    )}
                    {u.status !== "rejected" && u.role !== "admin" && (
                      <button
                        className="qs-btn qs-btn--ghost qs-btn--sm"
                        style={{ color: "var(--red-500)", borderColor: "var(--red-500)" }}
                        onClick={() => updateStatus(u.id, "rejected")}
                      >Rechazar</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Exponer componentes globalmente para que el resto los use
window.QS.LoginScreen = LoginScreen;
window.QS.RegisterScreen = RegisterScreen;
window.QS.PendingScreen = PendingScreen;
window.QS.RejectedScreen = RejectedScreen;
window.QS.AdminPanel = AdminPanel;
window.QS.AuthLoading = AuthLoading;
