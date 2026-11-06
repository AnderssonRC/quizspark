/* Bienvenida a la BETA 1.1 — cuatro tarjetas en negro con letras café.
 *   1. Construye, Desarrolla, Transforma, y, APLICA (una palabra a la vez)
 *   2. Uniendo Manos, Corazón y mente…
 *   3. Bienvenido a la BETA 1.1 de este Taller Artesanal…
 *   4. Que la creatividad y pasión te acompañen + firma (firma-andersson.png)
 * Avanza sola; un clic, Enter o → pasa a la siguiente; «Saltar» o Esc la cierran.
 * La muestra TerminosGate (22-terminos.js) antes de los Términos y Condiciones,
 * y cualquiera puede repetirla con window.rcVerBienvenida().
 */

const BIENVENIDA_VERSION = 'beta-1.1';
const BIENVENIDA_DURACION = [7600, 8200, 7000, 0];   // ms por tarjeta (0 = espera «Comenzar»)

const BIENVENIDA_CSS = `
.bv{position:fixed;inset:0;z-index:100001;overflow:hidden;background:#060403;color:#c9a37f;cursor:pointer;
  font-family:'EB Garamond',Georgia,serif;-webkit-user-select:none;user-select:none;animation:bv-entra .9s ease both;}
.bv-luz{position:absolute;inset:-10%;pointer-events:none;
  background:radial-gradient(ellipse 60% 50% at 50% 52%,rgba(150,92,40,.20),rgba(80,45,18,.07) 45%,transparent 70%);
  animation:bv-respira 7s ease-in-out infinite;}
.bv-grano{position:absolute;inset:0;pointer-events:none;opacity:.07;mix-blend-mode:screen;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
.bv-vineta{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,0,0,.75));}
.bv-chispa{position:absolute;bottom:-12px;width:3px;height:3px;border-radius:50%;pointer-events:none;
  background:#e8b77a;box-shadow:0 0 8px 2px rgba(232,170,100,.55);opacity:0;animation:bv-chispa linear infinite;}

.bv-barras{position:absolute;top:calc(14px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);
  display:flex;gap:6px;width:min(420px,calc(100% - 140px));z-index:3;}
.bv-barra{flex:1;height:2px;border-radius:2px;background:rgba(201,163,127,.18);overflow:hidden;}
.bv-barra i{display:block;height:100%;width:100%;background:#c9a37f;transform-origin:left;transform:scaleX(0);}
.bv-barra.is-hecha i{transform:scaleX(1);}
.bv-barra.is-activa i{animation:bv-llena var(--dur) linear forwards;}
.bv-saltar{position:absolute;top:calc(6px + env(safe-area-inset-top,0px));right:12px;z-index:3;padding:10px 14px;border:0;background:none;cursor:pointer;
  color:rgba(201,163,127,.6);font:500 13px/1 'Outfit',system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;}
.bv-saltar:hover{color:#e9c9a0;}
@media (max-width:560px){.bv-barras{left:16px;transform:none;width:calc(100% - 130px);}}

.bv-tarjeta{position:absolute;inset:0;display:grid;place-items:center;padding:56px 22px;text-align:center;
  animation:bv-tarjeta 1s cubic-bezier(.2,.7,.2,1) both;}

/* Tarjeta 1 */
.bv-palabra{position:absolute;inset:0;display:grid;place-items:center;opacity:0;padding:0 12px;
  font-weight:500;font-size:clamp(54px,13vw,170px);line-height:1;letter-spacing:.02em;
  animation:bv-palabra 1.55s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d);}
.bv-tinta{background:linear-gradient(100deg,#6e4221 0%,#c9955f 30%,#f3d7a8 50%,#c9955f 70%,#6e4221 100%);background-size:260% 100%;
  -webkit-background-clip:text;background-clip:text;color:transparent;animation:bv-brillo 3.2s ease-in-out infinite;}
.bv-palabra.is-y{font-style:italic;font-size:clamp(40px,8vw,96px);animation-duration:.95s;}
.bv-palabra.is-final{animation:bv-final 1.6s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d);}
.bv-final{display:grid;justify-items:center;gap:clamp(10px,2vh,22px);}
.bv-final b{font-weight:600;letter-spacing:.16em;font-size:clamp(58px,14vw,184px);}
.bv-final svg{width:min(70vw,520px);height:14px;overflow:visible;}
.bv-final path{fill:none;stroke:#c9955f;stroke-width:1.5;stroke-linecap:round;stroke-dasharray:600;stroke-dashoffset:600;
  animation:bv-traza 1.4s cubic-bezier(.6,0,.2,1) forwards;animation-delay:calc(var(--d) + .7s);}

/* Tarjetas 2 a 4: frases palabra por palabra */
.bv-frase{margin:0;max-width:19em;font-weight:400;font-size:clamp(27px,4.6vw,56px);line-height:1.28;color:#b98d62;text-wrap:balance;}
.bv-frase span{display:inline-block;opacity:0;animation:bv-sube 1.1s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i) * 95ms + .35s);}
.bv-frase .is-clave{font-style:italic;font-weight:500;color:#f0cf9c;text-shadow:0 0 28px rgba(240,190,120,.35);}
.bv-suave{color:#8d6a4b;}

.bv-beta{display:grid;justify-items:center;gap:clamp(14px,2.6vh,26px);}
.bv-sello{position:relative;display:grid;place-items:center;width:clamp(150px,22vw,196px);aspect-ratio:1;opacity:0;
  animation:bv-sello 1.2s cubic-bezier(.2,.7,.2,1) .5s both;}
.bv-sello svg{position:absolute;inset:0;width:100%;height:100%;animation:bv-gira 30s linear infinite;}
.bv-sello text{font:600 9px 'Outfit',system-ui,sans-serif;letter-spacing:2.4px;fill:#a97c52;text-transform:uppercase;}
.bv-sello circle{fill:none;stroke:#7a5233;stroke-width:.7;}
.bv-sello b{font:600 clamp(22px,3.2vw,30px)/1 'EB Garamond',Georgia,serif;color:#f0cf9c;letter-spacing:.03em;white-space:nowrap;}
.bv-sello small{display:block;margin-top:4px;font:500 10px/1 'Outfit',system-ui,sans-serif;letter-spacing:.3em;color:#a97c52;}
.bv-nombre{font-weight:500;font-size:clamp(34px,6.4vw,78px);line-height:1.05;}

.bv-cierre{display:grid;justify-items:center;gap:clamp(18px,3.4vh,34px);}
.bv-cita{font-style:italic;}
.bv-att{display:grid;justify-items:center;gap:4px;opacity:0;animation:bv-sube 1.1s ease both 2.4s;
  font:400 clamp(17px,2.2vw,22px)/1.4 'EB Garamond',Georgia,serif;color:#a07b58;}
.bv-att strong{font-weight:500;color:#d7b083;font-size:1.12em;}
.bv-firma{width:clamp(190px,26vw,280px);height:auto;clip-path:inset(0 100% 0 0);filter:drop-shadow(0 0 14px rgba(214,174,128,.25));
  animation:bv-firma 2.2s cubic-bezier(.55,.1,.35,1) 3.1s forwards;}
.bv-comenzar{margin-top:6px;padding:14px 30px;border-radius:999px;cursor:pointer;opacity:0;
  border:1px solid rgba(214,174,128,.55);background:rgba(214,174,128,.08);color:#f0cf9c;
  font:500 15px/1 'Outfit',system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;
  animation:bv-sube 1s ease both 5.2s;transition:background .25s,border-color .25s;}
.bv-comenzar:hover{background:rgba(214,174,128,.18);border-color:#e9c9a0;}

@keyframes bv-entra{from{opacity:0}to{opacity:1}}
@keyframes bv-respira{0%,100%{opacity:.85;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}
@keyframes bv-chispa{0%{opacity:0;transform:translate(0,0)}12%{opacity:.85}80%{opacity:.4}100%{opacity:0;transform:translate(var(--dx),-108vh)}}
@keyframes bv-llena{to{transform:scaleX(1)}}
@keyframes bv-tarjeta{from{opacity:0;filter:blur(6px)}to{opacity:1;filter:none}}
@keyframes bv-palabra{0%{opacity:0;filter:blur(20px);letter-spacing:.4em;transform:scale(1.08)}
  32%{opacity:1;filter:blur(0);letter-spacing:.02em;transform:none}
  74%{opacity:1;filter:blur(0);transform:none}
  100%{opacity:0;filter:blur(12px);transform:translateY(-5%) scale(.96)}}
@keyframes bv-final{0%{opacity:0;filter:blur(22px);transform:scale(1.1)}55%{opacity:1;filter:blur(0);transform:none}100%{opacity:1;filter:none;transform:none}}
@keyframes bv-brillo{0%,100%{background-position:100% 0}50%{background-position:0 0}}
@keyframes bv-traza{to{stroke-dashoffset:0}}
@keyframes bv-sube{from{opacity:0;filter:blur(8px);transform:translateY(14px)}to{opacity:1;filter:none;transform:none}}
@keyframes bv-sello{from{opacity:0;transform:scale(.6) rotate(-25deg)}to{opacity:1;transform:none}}
@keyframes bv-gira{to{transform:rotate(360deg)}}
@keyframes bv-firma{to{clip-path:inset(0 0 0 0)}}
@media (prefers-reduced-motion:reduce){
  .bv *,.bv{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important;}
  .bv-palabra{display:none}.bv-palabra.is-final{display:grid;opacity:1}}
`;

// Chispas de taller que suben despacio (posiciones fijas, sin azar en cada render).
const BV_CHISPAS = Array.from({ length: 16 }, (_, i) => ({
  left: ((i * 37 + 11) % 100) + '%',
  dx: (((i * 53) % 60) - 30) + 'px',
  dur: (11 + ((i * 7) % 9)) + 's',
  delay: (-((i * 1.7) % 14)).toFixed(1) + 's',
  size: 2 + (i % 3),
}));

function bvPalabras(texto, claves, desde) {
  let i = desde || 0;
  return texto.split(' ').map((w, k) => {
    const limpio = w.replace(/[.,…]/g, '').toLowerCase();
    const clave = claves && claves.includes(limpio);
    return (
      <React.Fragment key={k}>
        <span className={clave ? 'is-clave' : ''} style={{ '--i': i++ }}>{w}</span>{' '}
      </React.Fragment>
    );
  });
}

function BienvenidaBeta({ onDone }) {
  const [paso, setPaso] = React.useState(0);
  const terminar = React.useCallback(() => onDone && onDone(), [onDone]);
  const siguiente = React.useCallback(() => {
    setPaso((p) => (p < BIENVENIDA_DURACION.length - 1 ? p + 1 : p));
  }, []);

  // Avance automático de cada tarjeta.
  React.useEffect(() => {
    const ms = BIENVENIDA_DURACION[paso];
    if (!ms) return undefined;
    const t = setTimeout(siguiente, ms);
    return () => clearTimeout(t);
  }, [paso, siguiente]);

  // Teclado: → / Enter / Espacio avanzan; Esc salta.
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') terminar();
      else if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (paso === BIENVENIDA_DURACION.length - 1) terminar(); else siguiente();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [paso, siguiente, terminar]);

  // La letra EB Garamond la trae el cargador; por si no estuviera, se pide aquí.
  React.useEffect(() => {
    if (document.getElementById('rcl-fonts') || document.getElementById('bv-fuente')) return;
    const l = document.createElement('link');
    l.id = 'bv-fuente'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap';
    document.head.appendChild(l);
  }, []);

  const palabras1 = ['Construye,', 'Desarrolla,', 'Transforma,'];

  let tarjeta;
  if (paso === 0) {
    tarjeta = (
      <div className="bv-tarjeta" key="t1" aria-label="Construye, Desarrolla, Transforma, y, APLICA">
        {palabras1.map((w, i) => (
          <div key={w} className="bv-palabra" style={{ '--d': (0.5 + i * 1.45) + 's' }}>
            <span className="bv-tinta">{w}</span>
          </div>
        ))}
        <div className="bv-palabra is-y" style={{ '--d': '4.85s' }}><span className="bv-tinta">y,</span></div>
        <div className="bv-palabra is-final" style={{ '--d': '5.6s' }}>
          <div className="bv-final">
            <b className="bv-tinta">APLICA</b>
            <svg viewBox="0 0 520 14" preserveAspectRatio="none" aria-hidden="true">
              <path d="M4 9 C 120 2, 240 13, 330 6 S 470 4, 516 8" />
            </svg>
          </div>
        </div>
      </div>
    );
  } else if (paso === 1) {
    tarjeta = (
      <div className="bv-tarjeta" key="t2">
        <p className="bv-frase">
          {bvPalabras('Uniendo Manos, Corazón y mente para tejer pequeñas artesanías que se vuelven grandes Aprendizajes con nuevas formas de ver, pensar y sentir el mundo…',
            ['manos', 'corazón', 'mente', 'aprendizajes'])}
        </p>
      </div>
    );
  } else if (paso === 2) {
    tarjeta = (
      <div className="bv-tarjeta" key="t3">
        <div className="bv-beta">
          <p className="bv-frase bv-suave">{bvPalabras('Bienvenido a la')}</p>
          <div className="bv-sello" aria-label="BETA 1.1">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <defs><path id="bv-aro" d="M60 60 m-47 0 a47 47 0 1 1 94 0 a47 47 0 1 1 -94 0" /></defs>
              <circle cx="60" cy="60" r="56" /><circle cx="60" cy="60" r="38" />
              <text><textPath href="#bv-aro" textLength="292" lengthAdjust="spacing">Taller artesanal · Res Cogitans ·</textPath></text>
            </svg>
            <div><b>BETA 1.1</b><small>2026</small></div>
          </div>
          <p className="bv-frase bv-suave">{bvPalabras('de este Taller Artesanal llamado', null, 3)}</p>
          <p className="bv-frase bv-nombre"><span style={{ '--i': 9 }} className="bv-tinta">Desafíate…</span></p>
        </div>
      </div>
    );
  } else {
    tarjeta = (
      <div className="bv-tarjeta" key="t4">
        <div className="bv-cierre">
          <p className="bv-frase bv-cita">{bvPalabras('Que la creatividad y pasión te acompañen.', ['creatividad', 'pasión'])}</p>
          <div className="bv-att">
            <span>Att: Un Docente Artesano,</span>
            <strong>Andersson Cortés</strong>
          </div>
          <img className="bv-firma" src="firma-andersson.png" alt="Firma de Andersson Cortés" />
          <button type="button" className="bv-comenzar" onClick={(e) => { e.stopPropagation(); terminar(); }}>
            Comenzar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bv" role="dialog" aria-modal="true" aria-label="Bienvenida a la BETA 1.1"
      onClick={() => { if (paso < BIENVENIDA_DURACION.length - 1) siguiente(); }}>
      <style>{BIENVENIDA_CSS}</style>
      <div className="bv-luz" />
      {BV_CHISPAS.map((c, i) => (
        <span key={i} className="bv-chispa" style={{
          left: c.left, width: c.size, height: c.size, '--dx': c.dx,
          animationDuration: c.dur, animationDelay: c.delay,
        }} />
      ))}
      <div className="bv-grano" />
      <div className="bv-vineta" />

      <div className="bv-barras" aria-hidden="true">
        {BIENVENIDA_DURACION.map((ms, i) => (
          <div key={i} className={'bv-barra' + (i < paso ? ' is-hecha' : '') + (i === paso ? ' is-activa' : '')}
            style={{ '--dur': (ms || 5200) + 'ms' }}><i key={paso === i ? 'a' + paso : 'b'} /></div>
        ))}
      </div>
      <button type="button" className="bv-saltar" onClick={(e) => { e.stopPropagation(); terminar(); }}>Saltar ›</button>

      {tarjeta}
    </div>
  );
}

Object.assign(window, { BienvenidaBeta, BIENVENIDA_VERSION });
