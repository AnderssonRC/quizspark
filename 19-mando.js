/* global React */
// ============================================================
// QuizSpark — MANDO DEL CELULAR (Modo Sin Celular · "Presentar")
// ------------------------------------------------------------
// El docente proyecta en un televisor o videobeam (LectioPresenter,
// 11-lectio.js) y lo controla desde SU celular:
//   · Cambiar de pregunta (anterior / siguiente / ir a una)
//   · Revelar u ocultar la respuesta correcta
//   · Lanzar un Reto Físico (base o escrito en vivo) y terminarlo
//   · Mostrar a Esmigol en grande con una frase (base o escrita en vivo)
//   · Reloj de la pregunta actual: sumar/restar tiempo, pausar y reanudar
//
// Conexión: el presentador crea un "canal" en liveSessions (la colección
// que el celular puede escribir sin permisos extra), marcado como
// kind:"lectioRemote" y status:"remote" para que NO aparezca como sala en
// vivo ni en el historial. En el televisor se muestra un QR con
// "?remote=<id>". Para que SOLO el profesor lo use, el celular pide
// iniciar sesión con la cuenta de docente y comprueba que sea el dueño:
// un estudiante que escanee el QR del televisor no puede entrar.
//
//   canal = { kind, status, ownerId, quizId, quizTitle, createdAt,
//             state: { idx, total, revealed, finished, challenge, question },
//             cmd:   { id, type, payload, at },   ← lo escribe el celular
//             phoneSeenAt }
// ============================================================

const { useState: useStateMd, useEffect: useEffectMd, useRef: useRefMd } = React;

const MANDO_KIND = "lectioRemote";
const MANDO_FONT = "var(--font-display, 'Poppins', 'Segoe UI', system-ui, sans-serif)";
const MANDO_PHRASES_KEY = "qs_mando_frases";

function mandoUrl(id) {
  return window.location.origin + window.location.pathname + "?remote=" + encodeURIComponent(id);
}
const mandoPlain = (s) => (window.richToPlain ? window.richToPlain(s) : String(s || "")).trim();

// ============================================================
// 1) PRESENTADOR (televisor)
// ============================================================
// Hook del LectioPresenter. El canal se crea solo cuando el docente abre
// "📱 Mando" (no en cada presentación). onCommand recibe cada orden NUEVA
// del celular; publish(state) deja al celular ver dónde va la presentación.
function useLectioRemote({ quiz, onCommand }) {
  const [remoteId, setRemoteId] = useStateMd(null);
  const [remote, setRemote] = useStateMd(null);
  const lastCmdRef = useRefMd(undefined);
  const lastStateRef = useRefMd("");
  const onCommandRef = useRefMd(onCommand); onCommandRef.current = onCommand;
  const idRef = useRefMd(null);

  const open = async () => {
    if (idRef.current) return idRef.current;
    const uid = window.QS.currentUser?.uid;
    if (!uid) { alert("Inicia sesión para usar el mando del celular."); return null; }
    try {
      const ref = await window.QS.db.collection("liveSessions").add({
        kind: MANDO_KIND, status: "remote", ownerId: uid,
        quizId: quiz.id || null, quizTitle: quiz.title || "Presentación",
        createdAt: Date.now(), state: null, cmd: null, phoneSeenAt: 0,
      });
      idRef.current = ref.id;
      setRemoteId(ref.id);
      return ref.id;
    } catch (err) {
      console.error("Error creando el canal del mando:", err);
      alert("No se pudo crear el mando: " + err.message);
      return null;
    }
  };

  // Escuchar el canal: órdenes del celular y señal de conexión.
  useEffectMd(() => {
    if (!remoteId) return;
    const unsub = window.QS.db.collection("liveSessions").doc(remoteId).onSnapshot(doc => {
      if (!doc.exists) return;
      const data = doc.data();
      setRemote(data);
      const cmd = data.cmd;
      // Primera lectura: no ejecutar una orden vieja.
      if (lastCmdRef.current === undefined) { lastCmdRef.current = cmd ? cmd.id : null; return; }
      if (cmd && cmd.id !== lastCmdRef.current) {
        lastCmdRef.current = cmd.id;
        try { onCommandRef.current && onCommandRef.current(cmd); }
        catch (e) { console.error("Error aplicando orden del mando:", e); }
      }
    }, err => console.error("Error escuchando el mando:", err));
    return () => unsub();
  }, [remoteId]);

  // Al salir de la presentación, cerrar el canal (el celular lo muestra).
  useEffectMd(() => () => {
    if (idRef.current) {
      window.QS.db.collection("liveSessions").doc(idRef.current)
        .update({ status: "closed", closedAt: Date.now() }).catch(() => {});
    }
  }, []);

  const publish = (state) => {
    if (!idRef.current) return;
    const json = JSON.stringify(state);
    if (json === lastStateRef.current) return;
    lastStateRef.current = json;
    window.QS.db.collection("liveSessions").doc(idRef.current).update({ state })
      .catch(err => console.error("Error publicando estado al mando:", err));
  };

  const connected = !!remote && (Date.now() - (remote.phoneSeenAt || 0)) < 5 * 60 * 1000;
  return { remoteId, open, publish, connected };
}

// QR (qrcodejs ya se carga en index.html)
function MandoQR({ text, size = 240 }) {
  const ref = useRefMd(null);
  useEffectMd(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    if (typeof window.QRCode === "undefined") { ref.current.textContent = "QR no disponible"; return; }
    try {
      new window.QRCode(ref.current, {
        text, width: size, height: size, colorDark: "#0f172a", colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    } catch (e) { ref.current.textContent = "QR no disponible"; }
  }, [text, size]);
  return <div ref={ref} style={{ display: "inline-block", lineHeight: 0, padding: 12, background: "#fff", borderRadius: 16 }} />;
}

// Ventana del televisor con el QR para conectar el celular.
function LectioRemotePanel({ remoteId, connected, onClose }) {
  const url = remoteId ? mandoUrl(remoteId) : "";
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 960, background: "rgba(2,6,23,.75)",
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxWidth: 520, borderRadius: 24, padding: 28, textAlign: "center",
        background: "linear-gradient(160deg, #0f172a, #111827)", color: "#f1f5f9", fontFamily: MANDO_FONT,
        border: "2px solid #14b8a6", boxShadow: "0 24px 60px rgba(0,0,0,.6)",
      }}>
        <div style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>📱 Mando del celular</div>
        <p style={{ fontSize: 14, color: "#94a3b8", margin: "0 0 18px", lineHeight: 1.5 }}>
          Escanéalo con <b style={{ color: "#f1f5f9" }}>tu</b> celular e inicia sesión con tu cuenta de docente.
          Solo tú podrás controlar la presentación.
        </p>
        {remoteId ? <MandoQR text={url} /> : <p>Creando el mando…</p>}
        <div style={{ marginTop: 14, fontSize: 12, color: "#64748b", wordBreak: "break-all" }}>{url}</div>
        <div style={{
          marginTop: 16, display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999,
          background: connected ? "rgba(16,185,129,.15)" : "rgba(148,163,184,.12)",
          color: connected ? "#34d399" : "#94a3b8", fontWeight: 800, fontSize: 14,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: connected ? "#10b981" : "#64748b" }} />
          {connected ? "Celular conectado" : "Esperando al celular…"}
        </div>
        <div>
          <button onClick={onClose} className="qs-btn qs-btn--lg" style={{ marginTop: 18, background: "#14b8a6", color: "#04201b", fontWeight: 900, border: 0 }}>
            {connected ? "Listo, ocultar" : "Ocultar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Esmigol EN GRANDE para televisor / videobeam (lo manda el celular).
function LectioEsmigolTV({ msg, onDone }) {
  if (!msg || !window.Esmigol) return null;
  return (
    <window.Esmigol
      key={msg.at}
      texto={msg.text}
      expression={msg.expression || "retador"}
      position="bottom-center"
      placement="above"
      imageSize={Math.round(Math.min(window.innerHeight * 0.42, 380))}
      bubbleMaxWidth={Math.round(Math.min(window.innerWidth * 0.8, 1000))}
      fontSize={Math.round(Math.max(26, Math.min(window.innerWidth / 38, 46)))}
      textAlign="center"
      holdMs={9000}
      onCerrar={onDone}
    />
  );
}

// ============================================================
// 2) MANDO (celular del docente) — se abre con ?remote=<id>
// ============================================================
function mandoLoadPhrases() {
  try { const v = JSON.parse(localStorage.getItem(MANDO_PHRASES_KEY) || "[]"); return Array.isArray(v) ? v : []; }
  catch (e) { return []; }
}
function mandoSavePhrases(list) {
  try { localStorage.setItem(MANDO_PHRASES_KEY, JSON.stringify(list.slice(0, 30))); } catch (e) { /* no-op */ }
}

function LectioRemoteControl({ remoteId }) {
  const [authUser, setAuthUser] = useStateMd(undefined); // undefined = verificando
  const [remote, setRemote] = useStateMd(undefined);     // undefined = cargando, null = no existe
  const [quiz, setQuiz] = useStateMd(null);
  const [email, setEmail] = useStateMd("");
  const [password, setPassword] = useStateMd("");
  const [loginError, setLoginError] = useStateMd("");
  const [busy, setBusy] = useStateMd(false);
  const [panel, setPanel] = useStateMd(null); // null | "reto" | "esmigol" | "ir"
  const [flash, setFlash] = useStateMd("");

  // Sesión de Firebase en este celular (queda guardada: la próxima vez
  // basta con escanear el QR).
  useEffectMd(() => window.QS.auth.onAuthStateChanged(u => setAuthUser(u || null)), []);

  // El canal (lectura pública: no necesita sesión para saber de quién es).
  useEffectMd(() => {
    const unsub = window.QS.db.collection("liveSessions").doc(remoteId).onSnapshot(
      doc => setRemote(doc.exists && doc.data().kind === MANDO_KIND ? doc.data() : null),
      () => setRemote(null),
    );
    return () => unsub();
  }, [remoteId]);

  // Quiz (para las frases de Esmigol configuradas por el docente).
  useEffectMd(() => {
    if (!remote || !remote.quizId || quiz) return;
    window.QS.db.collection("quizzes").doc(remote.quizId).get()
      .then(d => { if (d.exists) setQuiz({ id: d.id, ...d.data() }); })
      .catch(() => {});
  }, [remote && remote.quizId]);

  const isOwner = !!authUser && !!remote && authUser.uid === remote.ownerId;

  // Avisar al televisor que el mando está conectado.
  useEffectMd(() => {
    if (!isOwner) return;
    window.QS.db.collection("liveSessions").doc(remoteId).update({ phoneSeenAt: Date.now() }).catch(() => {});
  }, [isOwner]);

  const send = async (type, payload, label) => {
    if (!isOwner) return;
    try {
      await window.QS.db.collection("liveSessions").doc(remoteId).update({
        cmd: { id: "c-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), type, payload: payload ?? null, at: Date.now() },
        phoneSeenAt: Date.now(),
      });
      if (label) { setFlash(label); setTimeout(() => setFlash(f => (f === label ? "" : f)), 1600); }
      if (navigator.vibrate) navigator.vibrate(30);
    } catch (err) {
      alert("No se pudo enviar: " + err.message);
    }
  };

  const login = async (e) => {
    e && e.preventDefault();
    setBusy(true); setLoginError("");
    try { await window.QS.auth.signInWithEmailAndPassword(email.trim(), password); setPassword(""); }
    catch (err) { setLoginError("Correo o contraseña incorrectos."); }
    finally { setBusy(false); }
  };

  const shell = (children) => (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(180deg, #0b1220, #060a13)", color: "#f1f5f9",
      fontFamily: MANDO_FONT, padding: "18px 16px 28px",
    }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>{children}</div>
    </div>
  );
  const card = { background: "#101a2e", border: "1px solid rgba(255,255,255,.12)", borderRadius: 18, padding: 16 };

  // ---- Estados de carga / acceso ----
  if (remote === undefined || authUser === undefined) {
    return shell(<p style={{ textAlign: "center", marginTop: 80, color: "#94a3b8" }}>Conectando con la presentación…</p>);
  }
  if (remote === null) {
    return shell(<div style={{ ...card, textAlign: "center", marginTop: 60 }}>
      <div style={{ fontSize: 44 }}>🔌</div>
      <h2 style={{ fontSize: 20, margin: "8px 0" }}>Este mando no existe</h2>
      <p style={{ color: "#94a3b8", fontSize: 14 }}>Vuelve a escanear el QR que aparece en el televisor.</p>
    </div>);
  }
  if (remote.status === "closed") {
    return shell(<div style={{ ...card, textAlign: "center", marginTop: 60 }}>
      <div style={{ fontSize: 44 }}>🏁</div>
      <h2 style={{ fontSize: 20, margin: "8px 0" }}>La presentación terminó</h2>
      <p style={{ color: "#94a3b8", fontSize: 14 }}>Para controlar otra, escanea su nuevo QR.</p>
    </div>);
  }
  if (!authUser) {
    return shell(<form onSubmit={login} style={{ ...card, marginTop: 40 }}>
      <div style={{ textAlign: "center", fontSize: 44 }}>📱🔒</div>
      <h2 style={{ fontSize: 20, textAlign: "center", margin: "6px 0 4px" }}>Mando del docente</h2>
      <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", marginBottom: 14 }}>
        «{remote.quizTitle}». Inicia sesión con tu cuenta de Desafíate para controlar la presentación.
      </p>
      <input className="qs-input" type="email" autoComplete="username" placeholder="Correo" value={email}
        onChange={e => setEmail(e.target.value)} style={{ width: "100%", marginBottom: 8 }} required />
      <input className="qs-input" type="password" autoComplete="current-password" placeholder="Contraseña" value={password}
        onChange={e => setPassword(e.target.value)} style={{ width: "100%", marginBottom: 8 }} required />
      {loginError && <p style={{ color: "#f87171", fontSize: 13, fontWeight: 700, margin: "4px 0 8px" }}>{loginError}</p>}
      <button type="submit" disabled={busy} className="qs-btn qs-btn--lg" style={{ width: "100%", background: "#14b8a6", color: "#04201b", fontWeight: 900, border: 0 }}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>);
  }
  if (!isOwner) {
    return shell(<div style={{ ...card, textAlign: "center", marginTop: 60 }}>
      <div style={{ fontSize: 44 }}>⛔</div>
      <h2 style={{ fontSize: 20, margin: "8px 0" }}>Solo el docente de esta presentación</h2>
      <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 14 }}>Entraste como {authUser.email}, que no es quien la está proyectando.</p>
      <button onClick={() => window.QS.auth.signOut()} className="qs-btn" style={{ background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.3)" }}>
        Cambiar de cuenta
      </button>
    </div>);
  }

  // ---- Mando ----
  const st = remote.state || {};
  const q = st.question || null;
  const big = (bg, fg) => ({
    width: "100%", padding: "18px 12px", borderRadius: 16, border: 0, fontSize: 18, fontWeight: 900,
    fontFamily: MANDO_FONT, background: bg, color: fg, cursor: "pointer", boxShadow: "0 4px 0 rgba(0,0,0,.35)",
  });

  return shell(<>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#14b8a6", fontWeight: 900, letterSpacing: ".08em" }}>📱 MANDO · SIN CELULAR</div>
        <div style={{ fontWeight: 800, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{remote.quizTitle}</div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>● Conectado</span>
    </div>

    {/* Dónde va la presentación (con la correcta: solo la ve el docente) */}
    <div style={{ ...card, marginBottom: 12 }}>
      {st.finished ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 36 }}>🎉</div>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Fin de la presentación</div>
          <button onClick={() => send("restart", null, "↺ Reiniciada")} style={big("rgba(255,255,255,.1)", "#fff")}>↺ Volver a empezar</button>
        </div>
      ) : q ? (
        <>
          <div style={{ fontSize: 13, color: "#94a3b8", fontWeight: 700, marginBottom: 6 }}>
            Pregunta {st.idx + 1} de {st.total} {st.revealed ? "· ✅ revelada" : ""}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4, marginBottom: 10 }}>{q.text || "(sin texto)"}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {(q.options || []).map(o => (
              <div key={o.letter} style={{
                display: "flex", gap: 8, alignItems: "center", padding: "7px 10px", borderRadius: 10, fontSize: 14,
                background: o.correct ? "rgba(16,185,129,.18)" : "rgba(255,255,255,.04)",
                border: "1px solid " + (o.correct ? "#10b981" : "rgba(255,255,255,.08)"),
              }}>
                <b style={{ width: 20 }}>{o.letter}</b>
                <span style={{ flex: 1 }}>{o.text}</span>
                {o.correct && <span style={{ color: "#34d399", fontWeight: 900 }}>✓</span>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <p style={{ color: "#94a3b8", textAlign: "center" }}>Esperando a la presentación…</p>
      )}
    </div>

    {flash && (
      <div style={{ textAlign: "center", fontWeight: 900, color: "#34d399", marginBottom: 8 }}>{flash}</div>
    )}

    {/* Reloj de la presentación: sumar minutos / pausar */}
    <MandoClock clock={st.clock || null} onSend={send} />

    {/* Cambiar pregunta */}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
      <button onClick={() => send("prev", null, "◀ Anterior")} disabled={!st.total || st.idx <= 0}
        style={{ ...big("rgba(255,255,255,.1)", "#fff"), opacity: !st.total || st.idx <= 0 ? .4 : 1 }}>◀ Anterior</button>
      <button onClick={() => send("next", null, st.idx >= (st.total || 1) - 1 ? "🏁 Finalizada" : "Siguiente ▶")}
        style={big("#0ea5e9", "#04141f")}>{st.idx >= (st.total || 1) - 1 ? "🏁 Finalizar" : "Siguiente ▶"}</button>
    </div>
    <button onClick={() => setPanel(panel === "ir" ? null : "ir")} style={{ ...big("rgba(255,255,255,.06)", "#cbd5e1"), fontSize: 14, padding: "10px 12px", marginBottom: 10 }}>
      🔢 Ir a una pregunta {panel === "ir" ? "▲" : "▼"}
    </button>
    {panel === "ir" && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6, marginBottom: 12 }}>
        {Array.from({ length: st.total || 0 }, (_, i) => (
          <button key={i} onClick={() => { send("goto", i, "Pregunta " + (i + 1)); setPanel(null); }} style={{
            padding: "10px 0", borderRadius: 10, fontWeight: 900, fontFamily: MANDO_FONT, cursor: "pointer",
            border: "1px solid rgba(255,255,255,.15)",
            background: i === st.idx ? "#14b8a6" : "rgba(255,255,255,.06)", color: i === st.idx ? "#04201b" : "#fff",
          }}>{i + 1}</button>
        ))}
      </div>
    )}

    {/* Pregunta en vivo (cerrada): sale justo después de la actual */}
    <button onClick={() => setPanel(panel === "pregunta" ? null : "pregunta")} style={{ ...big("rgba(124,58,237,.85)", "#fff"), fontSize: 15, padding: "12px 12px", marginBottom: 10 }}>
      ➕ Pregunta en vivo {panel === "pregunta" ? "▲" : "▼"}
    </button>
    {panel === "pregunta" && (
      <div style={{ ...card, marginBottom: 12 }}>
        <LiveClosedQuestionForm onSubmit={(p) => { send("addQuestion", p, "➕ Pregunta agregada"); setPanel(null); }} />
      </div>
    )}

    {/* Revelar */}
    <button onClick={() => send("reveal", !st.revealed, st.revealed ? "🙈 Oculta" : "✅ Revelada")} style={{ ...big(st.revealed ? "rgba(255,255,255,.1)" : "#14b8a6", st.revealed ? "#fff" : "#04201b"), marginBottom: 10 }}>
      {st.revealed ? "🙈 Ocultar respuesta" : "✅ Revelar la correcta"}
    </button>

    {/* Reto físico */}
    {st.challenge ? (
      <button onClick={() => send("challengeEnd", null, "↩️ Reto terminado")} style={{ ...big("#39ff14", "#03200b"), marginBottom: 10 }}>
        ↩️ Terminar reto: «{st.challenge}»
      </button>
    ) : (
      <button onClick={() => setPanel(panel === "reto" ? null : "reto")} style={{ ...big("#39ff14", "#03200b"), marginBottom: 10 }}>
        💪 Reto Físico {panel === "reto" ? "▲" : "▼"}
      </button>
    )}
    {panel === "reto" && !st.challenge && (
      <MandoRetoPicker onLaunch={(text) => { send("challenge", { text }, "💪 Reto lanzado"); setPanel(null); }} />
    )}

    {/* Esmigol */}
    <button onClick={() => setPanel(panel === "esmigol" ? null : "esmigol")} style={{ ...big("#f59e0b", "#fff"), marginBottom: 10 }}>
      🐶 Esmigol {panel === "esmigol" ? "▲" : "▼"}
    </button>
    {panel === "esmigol" && (
      <MandoEsmigolPicker quiz={quiz} onSend={(p) => send("esmigol", p, "🐶 Esmigol enviado")} />
    )}

    <p style={{ textAlign: "center", fontSize: 12, color: "#64748b", marginTop: 16 }}>
      {authUser.email} · <button onClick={() => window.QS.auth.signOut()} style={{ background: "none", border: 0, color: "#94a3b8", textDecoration: "underline", cursor: "pointer", fontSize: 12 }}>cerrar sesión</button>
    </p>
  </>);
}

// Reloj de la presentación en el celular. Cuenta por su cuenta desde que
// recibe el dato del televisor (leftMs), así no importa si la hora de los
// dos equipos no coincide. `stamp` cambia cuando el docente suma minutos,
// pausa o reanuda: ahí se vuelve a sincronizar.
function MandoClock({ clock, onSend }) {
  const [base, setBase] = useStateMd(() => (clock ? { leftMs: clock.leftMs, at: Date.now() } : null)); // { leftMs, at }
  const [, setTick] = useStateMd(0);
  const key = clock ? clock.stamp + "|" + clock.paused : "";
  useEffectMd(() => {
    setBase(clock ? { leftMs: clock.leftMs, at: Date.now() } : null);
  }, [key]);
  useEffectMd(() => {
    if (!clock || clock.paused) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [key]);

  const left = !clock || !base ? 0 : clock.paused ? base.leftMs : Math.max(0, base.leftMs - (Date.now() - base.at));
  const s = Math.ceil(left / 1000);
  const txt = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  const out = clock && left <= 0;
  const warn = clock && !out && left <= 10000; // últimos 10 s
  const btn = (label, onClick, extra) => (
    <button onClick={onClick} style={{
      padding: "12px 0", borderRadius: 12, fontWeight: 900, fontSize: 15, fontFamily: MANDO_FONT, cursor: "pointer",
      background: "rgba(255,255,255,.08)", color: "#fff", border: "1px solid rgba(255,255,255,.18)", ...extra,
    }}>{label}</button>
  );

  return (
    <div style={{
      background: "#101a2e", border: "1px solid " + (out ? "#dc2626" : warn ? "#f59e0b" : "rgba(255,255,255,.12)"),
      borderRadius: 18, padding: 14, marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 900, color: "#94a3b8", letterSpacing: ".08em" }}>⏱ TIEMPO DE LA PREGUNTA</span>
        <span style={{
          fontFamily: "ui-monospace, monospace", fontSize: 34, fontWeight: 900, lineHeight: 1,
          color: out ? "#f87171" : warn ? "#fbbf24" : clock ? "#fff" : "#64748b",
          opacity: clock && clock.paused ? 0.6 : 1,
        }}>
          {!clock ? "Sin reloj" : out ? "⏰ ¡Tiempo!" : (clock.paused ? "⏸ " : "") + txt}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {/* En segundos: el reloj es el de la pregunta actual */}
        {btn("+30 s", () => onSend("clockAdd", 30, "+30 segundos"))}
        {btn("+1 min", () => onSend("clockAdd", 60, "+1 minuto"))}
        {btn("−30 s", () => onSend("clockAdd", -30, "−30 segundos"), { opacity: clock ? 1 : .4 })}
        {clock && clock.paused
          ? btn("▶", () => onSend("clockResume", null, "▶ Reloj en marcha"), { background: "#10b981", color: "#04201b", border: 0 })
          : btn("⏸", () => onSend("clockPause", null, "⏸ Reloj en pausa"), { opacity: clock ? 1 : .4 })}
      </div>
    </div>
  );
}

// Pregunta CERRADA en vivo (Modo Sin Celular): la usan el televisor
// (11-lectio.js, botón "➕ Pregunta") y el mando. onSubmit recibe
// { text, options:[4 textos], correctIdx, timer }; quien la recibe la
// inserta justo después de la pregunta actual.
function LiveClosedQuestionForm({ onSubmit }) {
  const [text, setText] = useStateMd("");
  const [options, setOptions] = useStateMd(["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useStateMd(0);
  const [timer, setTimer] = useStateMd(60);
  const filled = options.filter(o => o.trim()).length;
  const valid = text.trim() && filled >= 2 && (options[correctIdx] || "").trim();
  const submit = () => {
    if (!valid) return;
    onSubmit({ text: text.trim(), options, correctIdx, timer });
    setText(""); setOptions(["", "", "", ""]); setCorrectIdx(0);
  };
  const input = {
    width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 15, fontFamily: MANDO_FONT,
    background: "rgba(255,255,255,.06)", color: "#f1f5f9", border: "1px solid rgba(255,255,255,.18)",
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="Escribe la pregunta…"
        style={{ ...input, resize: "vertical" }} />
      {options.map((o, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setCorrectIdx(i)} title="Marcar como correcta" style={{
            width: 34, height: 34, flexShrink: 0, borderRadius: 10, fontWeight: 900, cursor: "pointer", fontFamily: MANDO_FONT,
            background: correctIdx === i ? "#10b981" : "rgba(255,255,255,.08)", color: "#fff",
            border: "1px solid " + (correctIdx === i ? "#10b981" : "rgba(255,255,255,.2)"),
          }}>{correctIdx === i ? "✓" : "ABCD"[i]}</button>
          <input value={o} placeholder={`Opción ${"ABCD"[i]}`}
            onChange={e => setOptions(list => list.map((x, j) => (j === i ? e.target.value : x)))}
            style={{ ...input, borderColor: correctIdx === i ? "#10b981" : "rgba(255,255,255,.18)" }} />
        </div>
      ))}
      <div style={{ fontSize: 12, color: "#94a3b8" }}>Toca la letra para marcar la correcta (✓). Mínimo 2 opciones.</div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700 }}>
        ⏱ Tiempo
        <select value={timer} onChange={e => setTimer(Number(e.target.value))} style={{ ...input, width: "auto" }}>
          {[20, 30, 45, 60, 90, 120, 180, 300].map(s => <option key={s} value={s}>{s < 60 ? s + " s" : (s / 60) + " min"}</option>)}
        </select>
      </label>
      <button onClick={submit} disabled={!valid} style={{
        padding: "14px 12px", borderRadius: 14, border: 0, fontWeight: 900, fontSize: 16, fontFamily: MANDO_FONT, cursor: valid ? "pointer" : "default",
        background: "#14b8a6", color: "#04201b", opacity: valid ? 1 : .45,
      }}>➕ Agregar después de la actual</button>
    </div>
  );
}

// Reto físico desde el mando: los base + "Mis retos" (los mismos que guarda
// el botón de la sala en vivo en este dispositivo) + escribir uno nuevo.
function MandoRetoPicker({ onLaunch }) {
  const presets = window.RF_PRESETS || [];
  const [custom, setCustom] = useStateMd(() => (window.rfLoadCustom ? window.rfLoadCustom() : []));
  const [draft, setDraft] = useStateMd("");
  const add = () => {
    const t = draft.trim(); if (!t) return;
    const next = [t, ...custom.filter(c => c !== t)];
    setCustom(next); window.rfSaveCustom && window.rfSaveCustom(next); setDraft("");
    onLaunch(t);
  };
  const row = (t) => (
    <button key={t} onClick={() => onLaunch(t)} style={{
      textAlign: "left", padding: "12px 12px", borderRadius: 12, fontSize: 14, fontWeight: 700, fontFamily: MANDO_FONT,
      background: "rgba(57,255,20,.08)", color: "#eaffe0", border: "1px solid rgba(57,255,20,.35)", cursor: "pointer",
    }}>💪 {t}</button>
  );
  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
      {presets.map(row)}
      {custom.length > 0 && <div style={{ fontSize: 11, fontWeight: 900, color: "#94a3b8", marginTop: 4 }}>MIS RETOS</div>}
      {custom.map(row)}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input className="qs-input" value={draft} maxLength={140} placeholder="Escribe un reto nuevo…"
          onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} style={{ flex: 1, minWidth: 0 }} />
        <button onClick={add} disabled={!draft.trim()} className="qs-btn" style={{ background: "#39ff14", color: "#03200b", fontWeight: 900, border: 0 }}>Lanzar</button>
      </div>
    </div>
  );
}

// Esmigol desde el mando: frases de la configuración del docente (todos los
// grupos), las escritas en este celular y una caja para escribir en vivo.
function MandoEsmigolPicker({ quiz, onSend }) {
  const cfg = window.esmigolConfigFor ? window.esmigolConfigFor(quiz) : null;
  const order = window.ESMIGOL_TRIGGER_GROUP_ORDER || [];
  const firstGroup = order.includes("docenteVivo") ? "docenteVivo" : order[0];
  const [group, setGroup] = useStateMd(firstGroup);
  const [mine, setMine] = useStateMd(mandoLoadPhrases);
  const [draft, setDraft] = useStateMd("");
  const [face, setFace] = useStateMd("retador");
  const phrases = (cfg && cfg.groups && cfg.groups[group] && cfg.groups[group].phrases) || [];

  const sendNew = () => {
    const text = draft.trim(); if (!text) return;
    const item = { id: "m-" + Date.now(), text, expression: face };
    const next = [item, ...mine.filter(m => m.text !== text)];
    setMine(next); mandoSavePhrases(next); setDraft("");
    onSend(item);
  };
  const row = (p, removable) => (
    <div key={p.id} style={{ display: "flex", gap: 6 }}>
      <button onClick={() => onSend({ id: p.id, text: p.text, expression: p.expression })} style={{
        flex: 1, display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "8px 10px", borderRadius: 12,
        fontSize: 14, fontWeight: 600, fontFamily: MANDO_FONT, background: "rgba(245,158,11,.08)", color: "#fff",
        border: "1px solid rgba(245,158,11,.35)", cursor: "pointer",
      }}>
        <img src={window.esmigolImageSrc ? window.esmigolImageSrc(p.expression) : ""} alt="" style={{ width: 34, height: 34, objectFit: "contain", flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{p.text}</span>
      </button>
      {removable && (
        <button onClick={() => { const next = mine.filter(m => m.id !== p.id); setMine(next); mandoSavePhrases(next); }}
          style={{ background: "transparent", border: 0, color: "#f87171", fontSize: 16, cursor: "pointer" }}>🗑️</button>
      )}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
      {/* Escribir en vivo */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {window.EsmigolExpressionPicker && <window.EsmigolExpressionPicker value={face} onChange={setFace} size={30} />}
        <input className="qs-input" value={draft} maxLength={120} placeholder="Frase nueva para Esmigol…"
          onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && sendNew()} style={{ flex: 1, minWidth: 0 }} />
        <button onClick={sendNew} disabled={!draft.trim()} className="qs-btn" style={{ background: "#f59e0b", color: "#fff", fontWeight: 900, border: 0 }}>Enviar</button>
      </div>
      {mine.length > 0 && <div style={{ fontSize: 11, fontWeight: 900, color: "#94a3b8", marginTop: 4 }}>MIS FRASES</div>}
      {mine.map(p => row(p, true))}

      {/* Grupos de frases del docente */}
      {cfg && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "6px 0 2px", paddingBottom: 2 }}>
          {order.map(g => (
            <button key={g} onClick={() => setGroup(g)} style={{
              whiteSpace: "nowrap", padding: "6px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800, fontFamily: MANDO_FONT, cursor: "pointer",
              background: group === g ? "#f59e0b" : "rgba(255,255,255,.06)", color: "#fff", border: "1px solid rgba(255,255,255,.15)",
            }}>{cfg.groups[g]?.label || g}</button>
          ))}
        </div>
      )}
      {phrases.map(p => row(p, false))}
    </div>
  );
}

window.useLectioRemote = useLectioRemote;
window.LectioRemotePanel = LectioRemotePanel;
window.LectioEsmigolTV = LectioEsmigolTV;
window.LectioRemoteControl = LectioRemoteControl;
window.LiveClosedQuestionForm = LiveClosedQuestionForm;
window.mandoPlain = mandoPlain;
