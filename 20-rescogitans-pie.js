/* 20-rescogitans-pie.js — Pie de página Res Cogitans (licencia Creative Commons CC BY-NC-ND 4.0)
   y ventana del manifiesto con la marca animada. Sacado tal cual de js/ui.jsx de
   Presentaciones Interactivas. Necesita: React, rc-loader.js (RCLoader) y
   logo-a-cogitas.png en la raíz. Se monta <ResCogitasFooter /> en 07-app.js
   (panel) y en AuthShell de 00b-auth.js (ingreso, registro, cuenta en revisión).
   Es fijo abajo (~32 px): <RcPieEspacio /> deja ese espacio libre al final de la página. */

const RC_LICENCIA = {
  nombre: 'CC BY-NC-ND 4.0',
  url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
  iconos: ['cc', 'by', 'nc', 'nd'].map((n) => 'https://mirrors.creativecommons.org/presskit/icons/' + n + '.svg'),
};

function RcIconosLicencia({ claro }) {
  return (
    <span className={'rc-cc-iconos' + (claro ? ' is-claro' : '')} aria-hidden="true">
      {RC_LICENCIA.iconos.map((src) => <img key={src} src={src} alt="" />)}
    </span>
  );
}

const RC_MANIFIESTO_CSS = `
.rc-pie{position:fixed;left:0;right:0;bottom:0;z-index:80;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;
  column-gap:14px;row-gap:2px;padding:7px 14px calc(7px + env(safe-area-inset-bottom,0px));cursor:pointer;
  background:rgba(11,14,11,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  border-top:1px solid rgba(255,255,255,.08);color:#9AA396;font:600 12.5px/1.4 var(--font-display);}
.rc-pie strong{color:#C7D0C2;}
.rc-pie-info{color:#11F555;font-weight:800;margin-left:6px;}
.rc-pie-licencia{display:inline-flex;align-items:center;gap:6px;color:#9AA396;text-decoration:none;font-weight:500;}
.rc-pie-licencia:hover{color:#C7D0C2;}
.rc-pie-licencia:hover span:first-child{text-decoration:underline;text-underline-offset:2px;}
.rc-cc-iconos{display:inline-flex;gap:3px;}
.rc-cc-iconos img{width:14px;height:14px;display:block;filter:invert(.78);}
.rc-cc-iconos.is-claro img{width:20px;height:20px;filter:none;opacity:.8;}
@media (max-width:520px){.rc-pie{font-size:11.5px;column-gap:10px;}}

.rc-manif-fondo{position:fixed;inset:0;z-index:9998;display:flex;padding:16px;overflow-y:auto;
  background:rgba(14,9,5,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);animation:rc-manif-in .3s ease both;}
.rc-manif{position:relative;margin:auto;width:min(640px,100%);background:#fbf5ea;color:#23180f;border-radius:20px;overflow:hidden;
  box-shadow:0 30px 80px -24px rgba(0,0,0,.75),0 0 0 1px rgba(74,43,20,.14);animation:rc-manif-sube .4s cubic-bezier(.2,.7,.2,1) both;}
.rc-manif-marca{background:#e9d3b0;border-bottom:1px solid rgba(74,43,20,.16);}
.rc-manif-marca .rcl{position:relative;inset:auto;z-index:auto;padding:30px 22px 24px;background:transparent;}
.rc-manif-marca .rcl__stage{width:min(100%,430px);gap:16px;}
.rc-manif-marca .rcl__phrase{width:100%;font-size:clamp(16px,4.2vw,19px);}
.rc-manif-marca .rcl__foot{display:none;}
.rc-manif-cerrar{position:absolute;top:12px;right:12px;z-index:2;width:38px;height:38px;border-radius:999px;cursor:pointer;
  display:grid;place-items:center;border:1px solid rgba(74,43,20,.18);background:rgba(251,245,234,.85);color:#4a2b14;font:700 17px/1 system-ui,sans-serif;}
.rc-manif-cerrar:hover{background:#fff;}
.rc-manif-cuerpo{padding:26px 30px 22px;}
.rc-manif-eti{margin:0 0 10px;font:600 12px/1 'Outfit',system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#8a4b1c;}
.rc-manif-texto{margin:0;font:400 18px/1.62 'EB Garamond',Georgia,serif;color:#2b1d12;text-wrap:pretty;hyphens:auto;}
.rc-manif-texto strong{font-weight:600;color:#4a2b14;}
.rc-manif-firma{display:flex;align-items:center;justify-content:flex-end;gap:14px;margin-top:20px;}
.rc-manif-beta{margin-right:auto;padding:9px 14px;border-radius:999px;cursor:pointer;border:1px solid rgba(74,43,20,.25);
  background:#1a110a;color:#f0cf9c;font:500 12.5px/1 'Outfit',system-ui,sans-serif;letter-spacing:.06em;}
.rc-manif-beta:hover{background:#2b1d12;}
@media (max-width:520px){.rc-manif-firma{flex-wrap:wrap;}.rc-manif-beta{order:3;margin:6px 0 0;}}
.rc-manif-firma img{height:58px;width:auto;mix-blend-mode:multiply;opacity:.9;}
.rc-manif-firma p{margin:0;text-align:right;font:italic 500 17px/1.3 'EB Garamond',Georgia,serif;color:#4a2b14;}
.rc-manif-licencia{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:16px 30px 20px;
  border-top:1px solid rgba(74,43,20,.14);background:#f4ead9;font:400 13.5px/1.5 'Outfit',system-ui,sans-serif;color:#5a4636;}
.rc-manif-licencia p{margin:0;flex:1 1 260px;}
.rc-manif-licencia a{color:#8a4b1c;font-weight:600;text-underline-offset:3px;}
@media (max-width:520px){.rc-manif-marca .rcl{padding-top:56px;}.rc-manif-cuerpo{padding:22px 20px 18px;}.rc-manif-licencia{padding:14px 20px 18px;}.rc-manif-texto{font-size:17px;}}
@media (orientation:landscape) and (max-height:520px){.rc-manif-marca .rcl__stage{width:100%;}}
@keyframes rc-manif-in{from{opacity:0}to{opacity:1}}
@keyframes rc-manif-sube{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
`;

function ResCogitasManifiesto({ onCerrar }) {
  const marcaRef = React.useRef(null);

  // Marca y frase animadas en bucle (mismo cargador de la pantalla de inicio).
  React.useEffect(() => {
    if (!window.RCLoader || !marcaRef.current) return undefined;
    const anim = RCLoader.show({
      target: marcaRef.current, scene: 'none', theme: 'light', loop: true, hold: 3000,
      credit: '', caption: '', width: '430px', background: 'transparent',
    });
    return () => anim.destroy();
  }, []);

  return (
    <div className="rc-manif-fondo" onClick={onCerrar}>
      <div className="rc-manif" role="dialog" aria-modal="true" aria-label="Res Cogitans"
        onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rc-manif-cerrar" onClick={onCerrar} title="Cerrar" aria-label="Cerrar">✕</button>
        <div className="rc-manif-marca" ref={marcaRef} />

        <div className="rc-manif-cuerpo">
          <p className="rc-manif-eti">El proyecto</p>
          <p className="rc-manif-texto">
            <strong>Res Cogitans</strong> es un proyecto que busca reivindicar el arte creador de los docentes,
            pues son Artesanos en su enseñar. Por esa razón, y sin descanso, se busca crear herramientas
            digitales, físicas y epistémicas que permitan al docente reivindicarse en su hacer social y político,
            mostrándose como un sabedor que une intelecto y materialidad (producción real), además de estar
            autorizado a ejercer bajo su razón intelectual y sus años de experiencia, cualquier tipo de
            transformación y decisión. Esto revindica al docente como experto de la enseñanza, pues nadie más
            que él sabe el complejo Arte de Educar.
          </p>
          <div className="rc-manif-firma">
            {window.rcVerBienvenida && (
              <button type="button" className="rc-manif-beta"
                onClick={() => { onCerrar(); setTimeout(() => window.rcVerBienvenida && window.rcVerBienvenida(), 60); }}>
                ▶ Ver la bienvenida BETA 1.1
              </button>
            )}
            <p>Att: Mg. Andersson Cortés y Res Cogitans</p>
            <img src="logo-a-cogitas.png" alt="" />
          </div>
        </div>

        <div className="rc-manif-licencia">
          <RcIconosLicencia claro />
          <p>
            Esta obra está bajo la licencia{' '}
            <a href={RC_LICENCIA.url} target="_blank" rel="noopener license">{RC_LICENCIA.nombre}</a>
            {' '}(Atribución · No comercial · Sin obras derivadas).{' '}
            <a href="terminos.html" target="_blank" rel="noopener">Términos y Condiciones</a>
          </p>
        </div>
      </div>
    </div>
  );
}

function ResCogitasFooter() {
  const [abierto, setAbierto] = React.useState(false);

  // Bloquear scroll del fondo cuando la ventana está abierta.
  React.useEffect(() => {
    if (!abierto) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e) => { if (e.key === 'Escape') setAbierto(false); };
    window.addEventListener('keydown', onEsc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onEsc); };
  }, [abierto]);

  return (
    <React.Fragment>
      <style>{RC_MANIFIESTO_CSS}</style>
      {/* Pie de página fijo */}
      <footer className="rc-pie" onClick={() => setAbierto(true)} title="Conoce Res Cogitans">
        <span>Creado por <strong>Andersson Cortes</strong> y <strong>Res Cogitans</strong><span className="rc-pie-info">ⓘ</span></span>
        <a className="rc-pie-licencia" href={RC_LICENCIA.url} target="_blank" rel="noopener license"
          onClick={(e) => e.stopPropagation()} title="Licencia Creative Commons Atribución-NoComercial-SinDerivadas 4.0">
          <span>Licencia {RC_LICENCIA.nombre}</span>
          <RcIconosLicencia />
        </a>
      </footer>

      {abierto && <ResCogitasManifiesto onCerrar={() => setAbierto(false)} />}
    </React.Fragment>
  );
}

// Espacio vacío del alto del pie fijo, para que no tape los últimos botones de la página.
function RcPieEspacio() {
  return <div aria-hidden="true" style={{ height: 'calc(44px + env(safe-area-inset-bottom, 0px))', flex: 'none' }} />;
}

Object.assign(window, { ResCogitasFooter, RcPieEspacio });
