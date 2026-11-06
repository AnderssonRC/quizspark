/* Términos y Condiciones de Res Cogitans.
 *
 * A quien entra y todavía no aceptó la versión vigente se le muestra una
 * ventana con la marca animada (en bucle) y una casilla para aceptar.
 * Al aceptar:
 *   - se guarda en este equipo y en Firestore (terminos/{uid}: nombre, versión, fecha);
 *   - se avisa por correo al titular, solo con el nombre del usuario.
 * El texto completo está en terminos.html (y el PDF en terminos-res-cogitans.pdf).
 * Si los términos cambian, subir TERMINOS_VERSION: todos deberán aceptarlos de nuevo.
 */

const TERMINOS_VERSION = '2026-10-29';
const TERMINOS_CORREO = 'andersson2392@gmail.com';
const TERMINOS_PAGINA = 'terminos.html';

// Claves propias de Desafíate: comparte el localStorage con Presentaciones
// Interactivas (mismo dominio anderssonrc.github.io).
const terminosClave = (uid) => 'rc_terminos_desafiate_' + TERMINOS_VERSION + '_' + uid;
const terminosAvisoClave = (uid) => 'rc_terminos_aviso_desafiate_' + uid;

function terminosLeerLocal(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function terminosGuardarLocal(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
function terminosBorrarLocal(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } }

const bienvenidaClave = (uid) => 'rc_bienvenida_desafiate_' + BIENVENIDA_VER + '_' + uid;
const BIENVENIDA_VER = (window.BIENVENIDA_VERSION || 'beta-1.1');

// Estado del usuario: ¿ya aceptó los términos? ¿ya vio la bienvenida?
// Se mira primero en este equipo y, si falta algo, en Firestore (terminos/{uid}).
async function terminosEstado(uid) {
  const est = {
    terminos: !!terminosLeerLocal(terminosClave(uid)),
    bienvenida: !!terminosLeerLocal(bienvenidaClave(uid)),
  };
  if (est.terminos && est.bienvenida) return est;
  try {
    const snap = await window.fbDB.collection('terminos').doc(uid).get();
    const d = snap.exists ? snap.data() : {};
    if (d.version === TERMINOS_VERSION) { est.terminos = true; terminosGuardarLocal(terminosClave(uid), '1'); }
    if (d.bienvenida === BIENVENIDA_VER) { est.bienvenida = true; terminosGuardarLocal(bienvenidaClave(uid), '1'); }
  } catch (e) {
    // Sin permiso en Firestore: se decide solo con lo guardado en este equipo.
    console.warn('Términos: no se pudo consultar Firestore', e);
  }
  return est;
}

function bienvenidaMarcarVista(uid) {
  terminosGuardarLocal(bienvenidaClave(uid), '1');
  try {
    window.fbDB.collection('terminos').doc(uid).set({ bienvenida: BIENVENIDA_VER }, { merge: true })
      .catch((e) => console.warn('Bienvenida: no se pudo guardar en Firestore', e));
  } catch (e) { /* sin Firestore */ }
}

// Correo al titular con el nombre de quien aceptó.
// Servicio principal: Web3Forms (si hay clave en TERMINOS_WEB3FORMS_CLAVE).
// Respaldo: FormSubmit (sin clave; la primera vez pide activar desde el correo).
// Además, toda aceptación queda en Firestore y se ve en el panel de Administración.
const TERMINOS_WEB3FORMS_CLAVE = '';

async function terminosEnviarAviso(nombre) {
  const asunto = 'Res Cogitans: ' + nombre + ' aceptó los Términos y Condiciones';
  if (TERMINOS_WEB3FORMS_CLAVE) {
    const r = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: TERMINOS_WEB3FORMS_CLAVE, subject: asunto, from_name: 'Res Cogitans',
        'Usuario': nombre, 'Plataforma': 'Desafíate',
        'Fecha': new Date().toLocaleString('es-CO'), 'Versión de los términos': TERMINOS_VERSION,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.success !== false) return;
    console.warn('Términos: Web3Forms no respondió bien, se intenta con FormSubmit', j);
  }
  const r = await fetch('https://formsubmit.co/ajax/' + TERMINOS_CORREO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      _subject: asunto,
      _template: 'table',
      _captcha: 'false',
      'Usuario': nombre,
      'Plataforma': 'Desafíate',
      'Fecha': new Date().toLocaleString('es-CO'),
      'Versión de los términos': TERMINOS_VERSION,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false || j.success === 'false') throw new Error(j.message || 'Envío fallido');
}

// Si el correo no salió (sin internet, servicio caído…), queda pendiente y se
// reintenta la próxima vez que esa persona entre.
function terminosAvisar(uid, nombre) {
  terminosGuardarLocal(terminosAvisoClave(uid), nombre);
  terminosEnviarAviso(nombre)
    .then(() => terminosBorrarLocal(terminosAvisoClave(uid)))
    .catch((e) => console.warn('Términos: el aviso por correo quedó pendiente', e));
}
function terminosReintentarAviso(uid) {
  const pendiente = terminosLeerLocal(terminosAvisoClave(uid));
  if (pendiente) terminosAvisar(uid, pendiente);
}

const TERMINOS_CSS = `
.rc-terminos-fondo{position:fixed;inset:0;z-index:100000;display:flex;padding:16px;overflow-y:auto;
  background:rgba(28,18,10,.64);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);
  animation:rc-terminos-in .35s ease both;}
.rc-terminos{margin:auto;width:min(560px,100%);background:#fbf5ea;color:#23180f;border-radius:18px;overflow:hidden;
  box-shadow:0 24px 60px rgba(20,10,2,.45),0 0 0 1px rgba(74,43,20,.12);font-family:'Outfit',system-ui,sans-serif;}
.rc-terminos-marca{background:#e9d3b0;border-bottom:1px solid rgba(74,43,20,.16);}
.rc-terminos-marca .rcl{position:relative;inset:auto;z-index:auto;padding:22px 18px 20px;background:transparent;}
.rc-terminos-marca .rcl__stage{width:min(100%,400px);gap:14px;}
.rc-terminos-marca .rcl__phrase{width:100%;font-size:clamp(16px,4.2vw,19px);}
.rc-terminos-marca .rcl__foot{display:none;}
.rc-terminos-cuerpo{padding:20px 22px 22px;}
.rc-terminos-cuerpo h2{margin:0 0 6px;font:600 21px/1.25 'EB Garamond',Georgia,serif;color:#4a2b14;}
.rc-terminos-cuerpo p{margin:0 0 14px;font-size:15px;line-height:1.55;color:#5a4636;}
.rc-terminos-check{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:12px;cursor:pointer;
  border:1.5px solid rgba(74,43,20,.25);background:#fff;font-size:15.5px;line-height:1.45;color:#23180f;
  transition:border-color .2s,background .2s;}
.rc-terminos-check:hover{border-color:#8a4b1c;}
.rc-terminos-check.is-on{border-color:#2f6b3a;background:#f1f8ef;}
.rc-terminos-check input{width:22px;height:22px;margin:0;flex:none;accent-color:#2f6b3a;cursor:pointer;}
.rc-terminos-leer{display:inline-block;margin:12px 2px 0;color:#8a4b1c;font-weight:500;font-size:15px;text-underline-offset:3px;}
.rc-terminos-botones{display:flex;flex-wrap:wrap-reverse;justify-content:flex-end;gap:10px;margin-top:20px;}
.rc-terminos-botones button{font:600 15px/1 'Outfit',system-ui,sans-serif;padding:13px 18px;border-radius:11px;cursor:pointer;}
.rc-terminos-no{background:transparent;color:#5a4636;border:1px solid rgba(74,43,20,.25);}
.rc-terminos-no:hover{color:#23180f;border-color:#5a4636;}
.rc-terminos-si{background:#2f6b3a;color:#fff;border:1px solid #2f6b3a;}
.rc-terminos-si:hover:not(:disabled){background:#27592f;}
.rc-terminos-si:disabled{opacity:.45;cursor:not-allowed;}
@media (max-width:420px){.rc-terminos-botones button{flex:1 1 100%;}}
@media (orientation:landscape) and (max-height:520px){.rc-terminos-marca .rcl__stage{width:100%;}}
@keyframes rc-terminos-in{from{opacity:0}to{opacity:1}}
`;

function TerminosVentana({ user, onAceptado }) {
  const marcaRef = React.useRef(null);
  const [marcado, setMarcado] = React.useState(false);
  const [guardando, setGuardando] = React.useState(false);

  // Marca y frase animadas en bucle, con el mismo cargador de la pantalla de inicio.
  React.useEffect(() => {
    if (!window.RCLoader || !marcaRef.current) return undefined;
    const anim = RCLoader.show({
      target: marcaRef.current, scene: 'none', theme: 'light', loop: true, hold: 2600,
      credit: '', caption: '', width: '400px', background: 'transparent',
    });
    return () => anim.destroy();
  }, []);

  const aceptar = async () => {
    if (!marcado || guardando) return;
    setGuardando(true);
    const actual = window.fbAuth && window.fbAuth.currentUser;
    // Desafíate guarda el nombre en Firestore (users/{uid}.name), no en el perfil de Firebase.
    const perfil = (window.QS && window.QS.currentUserData) || {};
    const nombre = (perfil.name || (actual && actual.displayName) || user.displayName || '').trim() || '(sin nombre registrado)';
    terminosGuardarLocal(terminosClave(user.uid), '1');
    try {
      await window.fbDB.collection('terminos').doc(user.uid)
        .set({ nombre, version: TERMINOS_VERSION, aceptado: Date.now() });
    } catch (e) {
      console.warn('Términos: no se pudo guardar en Firestore (queda en este equipo)', e);
    }
    terminosAvisar(user.uid, nombre);
    onAceptado();
  };

  return (
    <div className="rc-terminos-fondo" role="dialog" aria-modal="true" aria-labelledby="rc-terminos-titulo">
      <style>{TERMINOS_CSS}</style>
      <div className="rc-terminos">
        <div className="rc-terminos-marca" ref={marcaRef} />
        <div className="rc-terminos-cuerpo">
          <h2 id="rc-terminos-titulo">Antes de comenzar</h2>
          <p>Para usar las plataformas de Res Cogitans necesitas aceptar los Términos y Condiciones de uso.</p>
          <label className={'rc-terminos-check' + (marcado ? ' is-on' : '')}>
            <input type="checkbox" checked={marcado} autoFocus
              onChange={(e) => setMarcado(e.target.checked)} />
            <span>He leído y acepto los Términos y Condiciones de uso de Res Cogitans.</span>
          </label>
          <a className="rc-terminos-leer" href={TERMINOS_PAGINA} target="_blank" rel="noopener">
            Leer los Términos y Condiciones ↗
          </a>
          <div className="rc-terminos-botones">
            <button type="button" className="rc-terminos-no" onClick={() => AIP.signOut()}>
              No acepto · cerrar sesión
            </button>
            <button type="button" className="rc-terminos-si" disabled={!marcado || guardando} onClick={aceptar}>
              {guardando ? 'Guardando…' : 'Aceptar y continuar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Espera a que no haya pantalla de carga visible (para no animar por debajo de ella).
function esperarSinCarga(cb) {
  let t = 0;
  const mirar = () => {
    const c = window.RCLoader && RCLoader.current;
    if (c && !c.hidden) t = setTimeout(mirar, 250); else cb();
  };
  t = setTimeout(mirar, 80);
  return () => clearTimeout(t);
}

/* Escucha la sesión y decide qué mostrar, en este orden:
 *   1. la bienvenida a la BETA (una vez por usuario; también la ve el administrador);
 *   2. los Términos y Condiciones (a quien no los aceptó; el administrador no).
 * window.rcVerBienvenida() la repite cuando se quiera (manifiesto y panel de administración). */
function TerminosGate() {
  const [user, setUser] = React.useState(null);
  const [vista, setVista] = React.useState(null);   // null | 'bienvenida' | 'terminos'
  const pendTerminos = React.useRef(false);

  React.useEffect(() => AIP.onAuth((u) => setUser(u || null)), []);

  React.useEffect(() => {
    let vivo = true, cancelar = () => {};
    setVista(null);
    pendTerminos.current = false;
    if (!user) return undefined;
    const admin = AIP.esAdmin();
    if (!admin) terminosReintentarAviso(user.uid);
    terminosEstado(user.uid).then((est) => {
      if (!vivo) return;
      pendTerminos.current = !admin && !est.terminos;
      const primera = !est.bienvenida ? 'bienvenida' : (pendTerminos.current ? 'terminos' : null);
      if (primera) cancelar = esperarSinCarga(() => { if (vivo) setVista(primera); });
    });
    return () => { vivo = false; cancelar(); };
  }, [user]);

  React.useEffect(() => {
    window.rcVerBienvenida = () => setVista('bienvenida');
    return () => { delete window.rcVerBienvenida; };
  }, []);

  const finBienvenida = () => {
    if (user) bienvenidaMarcarVista(user.uid);
    setVista(pendTerminos.current && user ? 'terminos' : null);
  };

  if (vista === 'bienvenida' && window.BienvenidaBeta) return <BienvenidaBeta onDone={finBienvenida} />;
  if (vista === 'terminos' && user) {
    return <TerminosVentana user={user} onAceptado={() => { pendTerminos.current = false; setVista(null); }} />;
  }
  return null;
}

Object.assign(window, { TerminosGate, TERMINOS_VERSION });
