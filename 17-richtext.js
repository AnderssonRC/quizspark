/* global React */
// ============================================================
// QuizSpark — TEXTO CON FORMATO (enunciados y opciones, todos los modos)
// ------------------------------------------------------------
// El docente edita EN EL EDITOR viendo el texto tal cual se proyecta
// (negrita, color, centrado...) — una sola vista, sin marcas visibles.
//
// Internamente el texto se GUARDA con un marcado ligero (compatible con
// todo lo que ya existe: Firestore, importación, exportación a Excel):
//   **negrita**  *cursiva*  __subrayado__  ~~tachado~~  ==resaltado==
//   ++grande++   {rojo}texto{/}  (rojo, azul, verde, naranja, morado, rosa, amarillo)
//   Una línea que empieza con ">> " va centrada. Los saltos de línea se respetan.
//
// Para MOSTRARLO (celular, proyección, taller, sin celular) se interpreta a
// elementos de React — nunca innerHTML con datos de Firestore. El único
// HTML que se genera es el del cuadro de edición, construido aquí con el
// texto escapado (richToHtml), así que tampoco hay riesgo de inyección.
// ============================================================

const { useState: useStateRich, useEffect: useEffectRich, useRef: useRefRich } = React;

const RICH_COLORS = {
  rojo: "#ef4444", azul: "#3b82f6", verde: "#22c55e", naranja: "#f97316",
  morado: "#a855f7", rosa: "#ec4899", amarillo: "#facc15",
};
const RICH_COLOR_NAMES = Object.keys(RICH_COLORS);
const RICH_MARK_BG = "#fde68a";
const RICH_MARK_FG = "#1f1300";
const RICH_INLINE_RE = new RegExp(
  "\\*\\*(.+?)\\*\\*|__(.+?)__|==(.+?)==|\\+\\+(.+?)\\+\\+|~~(.+?)~~|" +
  "\\{(" + RICH_COLOR_NAMES.join("|") + ")\\}([\\s\\S]+?)\\{\\/\\}|\\*(.+?)\\*"
);
const RICH_HAS_RE = new RegExp(
  "\\*\\*|__|==|\\+\\+|~~|\\{(" + RICH_COLOR_NAMES.join("|") + ")\\}|^>>|\\n>>|\\*[^*\\n]+\\*", "m"
);

function richHasMarkup(s) { return RICH_HAS_RE.test(String(s ?? "")); }

// Quita las marcas: listas, exportaciones a Excel/CSV, atributos title, PDF.
function richToPlain(s) {
  return String(s ?? "")
    .replace(new RegExp("\\{(" + RICH_COLOR_NAMES.join("|") + ")\\}", "g"), "")
    .replace(/\{\/\}/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/==(.+?)==/g, "$1")
    .replace(/\+\+(.+?)\+\+/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^>>\s?/gm, "");
}

// ---------- Mostrar (React, sin innerHTML) ----------
function richInline(text, keyBase) {
  const out = [];
  let rest = String(text);
  let k = 0;
  while (rest) {
    const m = RICH_INLINE_RE.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = keyBase + "-" + (k++);
    if (m[1] != null)      out.push(<strong key={key}>{richInline(m[1], key)}</strong>);
    else if (m[2] != null) out.push(<u key={key}>{richInline(m[2], key)}</u>);
    else if (m[3] != null) out.push(<mark key={key} style={{ background: RICH_MARK_BG, color: RICH_MARK_FG, padding: "0 .22em", borderRadius: 4 }}>{richInline(m[3], key)}</mark>);
    else if (m[4] != null) out.push(<span key={key} style={{ fontSize: "1.35em", lineHeight: 1.2 }}>{richInline(m[4], key)}</span>);
    else if (m[5] != null) out.push(<s key={key} style={{ opacity: .8 }}>{richInline(m[5], key)}</s>);
    else if (m[6] != null) out.push(<span key={key} style={{ color: RICH_COLORS[m[6]] }}>{richInline(m[7], key)}</span>);
    else if (m[8] != null) out.push(<em key={key}>{richInline(m[8], key)}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

// <RichText text="..." /> — sirve dentro de h1/h2/button/span.
function RichText({ text, style }) {
  const s = String(text ?? "");
  if (!s.includes("\n") && !richHasMarkup(s)) return s;   // texto plano: idéntico a antes
  const lines = s.split("\n");
  return (
    <span style={{ display: "block", ...style }}>
      {lines.map((ln, i) => {
        const center = ln.startsWith(">>");
        const body = center ? ln.slice(2).replace(/^\s/, "") : ln;
        return (
          <span key={i} style={{ display: "block", textAlign: center ? "center" : undefined }}>
            {body === "" ? " " : richInline(body, "l" + i)}
          </span>
        );
      })}
    </span>
  );
}

// ---------- Marcado → HTML del cuadro de edición (texto escapado) ----------
function richEsc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function richInlineHtml(text) {
  let out = "";
  let rest = String(text);
  while (rest) {
    const m = RICH_INLINE_RE.exec(rest);
    if (!m) { out += richEsc(rest); break; }
    if (m.index > 0) out += richEsc(rest.slice(0, m.index));
    if (m[1] != null)      out += "<b>" + richInlineHtml(m[1]) + "</b>";
    else if (m[2] != null) out += "<u>" + richInlineHtml(m[2]) + "</u>";
    else if (m[3] != null) out += `<span style="background-color:${RICH_MARK_BG};color:${RICH_MARK_FG};border-radius:4px;padding:0 .22em">` + richInlineHtml(m[3]) + "</span>";
    else if (m[4] != null) out += `<span style="font-size:1.35em">` + richInlineHtml(m[4]) + "</span>";
    else if (m[5] != null) out += "<s>" + richInlineHtml(m[5]) + "</s>";
    else if (m[6] != null) out += `<font color="${RICH_COLORS[m[6]]}">` + richInlineHtml(m[7]) + "</font>";
    else if (m[8] != null) out += "<i>" + richInlineHtml(m[8]) + "</i>";
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
function richToHtml(markup) {
  const s = String(markup ?? "");
  if (!s) return "";
  return s.split("\n").map(ln => {
    const center = ln.startsWith(">>");
    const body = center ? ln.slice(2).replace(/^\s/, "") : ln;
    const inner = body === "" ? "<br>" : richInlineHtml(body);
    return center ? `<div style="text-align:center">${inner}</div>` : `<div>${inner}</div>`;
  }).join("");
}

// ---------- HTML del cuadro de edición → marcado ----------
function richParseColor(c) {
  if (!c) return null;
  let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1]; if (h.length === 3) h = h.split("").map(x => x + x).join("");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}
// Nombre de la paleta más cercano al color, o null si no se parece a ninguno
// (así el color base del editor —blanco/negro— no se guarda como marca).
function richNearestColorName(c) {
  const rgb = richParseColor(c);
  if (!rgb) return null;
  let best = null, bestD = Infinity;
  RICH_COLOR_NAMES.forEach(name => {
    const p = richParseColor(RICH_COLORS[name]);
    const d = Math.hypot(rgb[0] - p[0], rgb[1] - p[1], rgb[2] - p[2]);
    if (d < bestD) { bestD = d; best = name; }
  });
  return bestD <= 110 ? best : null;
}
function richIsTransparent(bg) {
  return !bg || bg === "transparent" || /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(bg) || bg === "initial" || bg === "inherit";
}
const RICH_BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "PRE", "SECTION", "ARTICLE", "TABLE", "TR"]);

function richSerializeInline(node, ctx) {
  if (node.nodeType === 3) return node.nodeValue.replace(/ /g, " ");
  if (node.nodeType !== 1) return "";
  const tag = node.tagName;
  if (tag === "BR") return "\n";
  const st = node.style || {};
  const next = { ...ctx };
  const wraps = [];
  // Cada atributo se marca UNA sola vez aunque el HTML lo anide dos veces.
  const fw = st.fontWeight;
  if (!ctx.bold && (tag === "B" || tag === "STRONG" || fw === "bold" || fw === "bolder" || (+fw >= 600))) { next.bold = true; wraps.push(["**", "**"]); }
  if (!ctx.italic && (tag === "I" || tag === "EM" || st.fontStyle === "italic")) { next.italic = true; wraps.push(["*", "*"]); }
  if (!ctx.underline && (tag === "U" || /underline/.test(st.textDecoration || st.textDecorationLine || ""))) { next.underline = true; wraps.push(["__", "__"]); }
  if (!ctx.strike && (tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(st.textDecoration || st.textDecorationLine || ""))) { next.strike = true; wraps.push(["~~", "~~"]); }
  if (!ctx.mark && (tag === "MARK" || !richIsTransparent(st.backgroundColor))) { next.mark = true; wraps.push(["==", "=="]); }
  const fontSize = tag === "FONT" ? +(node.getAttribute("size") || 0) : 0;
  if (!ctx.big && (fontSize >= 4 || (st.fontSize && st.fontSize !== "inherit" && !/^(1em|100%|medium)$/.test(st.fontSize)))) { next.big = true; wraps.push(["++", "++"]); }
  const colorName = richNearestColorName(tag === "FONT" ? (node.getAttribute("color") || st.color) : st.color);
  if (!ctx.mark && !next.mark && colorName && ctx.color !== colorName) { next.color = colorName; wraps.push(["{" + colorName + "}", "{/}"]); }

  let inner = "";
  node.childNodes.forEach(ch => { inner += richSerializeInline(ch, next); });
  if (inner.trim() === "") return inner;  // no envolver espacios vacíos
  // Las marcas no pueden cruzar saltos de línea: se aplican tramo a tramo.
  const applyWraps = (seg) => {
    if (seg.trim() === "") return seg;
    const lead = seg.match(/^\s*/)[0], trail = seg.match(/\s*$/)[0];
    let core = seg.slice(lead.length, seg.length - trail.length);
    for (let i = wraps.length - 1; i >= 0; i--) core = wraps[i][0] + core + wraps[i][1];
    return lead + core + trail;
  };
  return inner.split("\n").map(applyWraps).join("\n");
}

function richWalkBlock(container, lines) {
  let cur = "";
  let has = false;
  const kids = Array.from(container.childNodes);
  kids.forEach((child, idx) => {
    const isEl = child.nodeType === 1;
    if (isEl && RICH_BLOCK_TAGS.has(child.tagName)) {
      if (has) { lines.push(cur); cur = ""; has = false; }
      const center = child.style && child.style.textAlign === "center";
      const sub = [];
      richWalkBlock(child, sub);
      if (!sub.length) sub.push("");
      sub.forEach(l => lines.push(center && !l.startsWith(">>") ? ">> " + l : l));
      return;
    }
    if (isEl && child.tagName === "BR") {
      // <br> final de un bloque con contenido: relleno del navegador, no es salto.
      if (idx === kids.length - 1 && has) return;
      lines.push(cur); cur = ""; has = false;
      return;
    }
    cur += richSerializeInline(child, {});
    has = true;
  });
  if (has) lines.push(cur);
}
function htmlToRich(root) {
  const lines = [];
  richWalkBlock(root, lines);
  // Un tramo en línea puede traer "\n" (br dentro de un <b>...): se expande.
  const flat = [];
  lines.forEach(l => l.split("\n").forEach(x => flat.push(x)));
  while (flat.length && flat[flat.length - 1].trim() === "") flat.pop();
  return flat.join("\n");
}

// ---------- Cuadro de edición WYSIWYG ----------
// Props: value (marcado), onChange(marcado), placeholder, style, singleLine,
//        debounce (ms), onFocusField(el) para la barra de formato.
function RichEditable({ value, onChange, placeholder, style, singleLine = false, debounce = 250, onFocusField, className }) {
  const ref = useRefRich(null);
  const lastRef = useRefRich(null);        // último marcado que este cuadro emitió o recibió
  const timerRef = useRefRich(null);
  const onChangeRef = useRefRich(onChange);
  onChangeRef.current = onChange;
  const [empty, setEmpty] = useStateRich(!String(value ?? "").trim());

  // Sembrar el contenido cuando el valor cambia DESDE AFUERA (otra pregunta,
  // importación...). Mientras se escribe, el valor que llega es el propio.
  useEffectRich(() => {
    const el = ref.current;
    if (!el) return;
    const v = String(value ?? "");
    if (v === lastRef.current) return;
    lastRef.current = v;
    el.innerHTML = richToHtml(v);
    setEmpty(!v.trim());
  }, [value]);

  useEffectRich(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const emit = (immediate) => {
    const el = ref.current;
    if (!el) return;
    const md = htmlToRich(el);
    setEmpty(!md.trim());
    if (md === lastRef.current) return;
    lastRef.current = md;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (immediate || !debounce) onChangeRef.current(md);
    else timerRef.current = setTimeout(() => { timerRef.current = null; onChangeRef.current(md); }, debounce);
  };

  return (
    <div style={{ position: "relative", ...(style && style.flex != null ? { flex: style.flex, minWidth: 0 } : { width: "100%" }) }}>
      <div
        ref={ref}
        className={className}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={() => emit(false)}
        onBlur={() => emit(true)}
        onFocus={e => onFocusField && onFocusField(e.currentTarget)}
        onKeyDown={e => {
          if (singleLine && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        }}
        onPaste={e => {
          // Solo texto plano: nada de HTML pegado desde Word o la web.
          e.preventDefault();
          const t = (e.clipboardData || window.clipboardData).getData("text/plain");
          document.execCommand("insertText", false, singleLine ? t.replace(/\s*\n+\s*/g, " ") : t);
        }}
        style={{
          outline: "none", whiteSpace: "pre-wrap", wordBreak: "break-word", overflowWrap: "anywhere",
          cursor: "text", ...style, flex: undefined,
        }}
      />
      {empty && placeholder && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, pointerEvents: "none", opacity: .5,
          padding: style && style.padding != null ? style.padding : 0,
          fontSize: style && style.fontSize, fontWeight: style && style.fontWeight, fontFamily: style && style.fontFamily,
          color: style && style.color, lineHeight: style && style.lineHeight,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>{placeholder}</div>
      )}
    </div>
  );
}

// ---------- Barra de formato (actúa sobre el cuadro con foco) ----------
const RICH_EMOJIS = ["🔥", "⭐", "✅", "❌", "💡", "🎯", "⚡", "🧠", "📚", "📌", "👉", "❓", "🤔", "🎉", "💪", "🌎", "🧪", "📐", "🎨", "⏳"];

function RichFormatToolbar({ targetRef }) {
  const [pop, setPop] = useStateRich(null); // "colors" | "emoji" | "help" | "nofocus" | null

  const exec = (cmd, arg) => { try { document.execCommand(cmd, false, arg); } catch (e) { /* comando no soportado */ } };
  const apply = (kind, arg) => {
    const el = targetRef && targetRef.current && targetRef.current.el;
    if (!el || !document.body.contains(el)) { setPop("nofocus"); return; }
    el.focus();
    if (kind === "bold") exec("bold");
    else if (kind === "italic") exec("italic");
    else if (kind === "underline") exec("underline");
    else if (kind === "strike") exec("strikeThrough");
    else if (kind === "mark") { exec("hiliteColor", RICH_MARK_BG); exec("foreColor", RICH_MARK_FG); }
    else if (kind === "big") exec("fontSize", "5");
    else if (kind === "color") exec("foreColor", RICH_COLORS[arg]);
    else if (kind === "emoji") exec("insertText", arg);
    else if (kind === "center") {
      let on = false;
      try { on = document.queryCommandState("justifyCenter"); } catch (e) { /* no-op */ }
      exec(on ? "justifyLeft" : "justifyCenter");
    } else if (kind === "clear") { exec("removeFormat"); exec("justifyLeft"); }
    el.dispatchEvent(new Event("input", { bubbles: true }));  // que el cuadro guarde el cambio
    if (kind !== "emoji" && kind !== "color") setPop(null);
  };

  const B = ({ label, kind, arg, title, style }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={() => apply(kind, arg)} style={{
      minWidth: 30, height: 30, padding: "0 8px", borderRadius: 8, cursor: "pointer",
      background: "var(--ink-50)", border: "1px solid var(--ink-200)", color: "var(--ink-900)",
      fontSize: 14, fontWeight: 700, lineHeight: 1, ...style,
    }}>{label}</button>
  );
  const toggle = (id, label, title) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={() => setPop(p => p === id ? null : id)} style={{
      minWidth: 30, height: 30, padding: "0 8px", borderRadius: 8, cursor: "pointer",
      background: pop === id ? "var(--violet-600)" : "var(--ink-50)",
      border: "1px solid " + (pop === id ? "var(--violet-600)" : "var(--ink-200)"),
      color: pop === id ? "#fff" : "var(--ink-900)", fontSize: 14, fontWeight: 700, lineHeight: 1,
    }}>{label}</button>
  );

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-500)", letterSpacing: ".05em", marginRight: 4 }}>FORMATO</span>
        <B label="B" kind="bold" title="Negrita" style={{ fontWeight: 900 }} />
        <B label="I" kind="italic" title="Cursiva" style={{ fontStyle: "italic", fontFamily: "Georgia, serif" }} />
        <B label="U" kind="underline" title="Subrayado" style={{ textDecoration: "underline" }} />
        <B label="S" kind="strike" title="Tachado" style={{ textDecoration: "line-through" }} />
        <B label={<span style={{ background: RICH_MARK_BG, color: RICH_MARK_FG, padding: "0 5px", borderRadius: 4 }}>ab</span>} kind="mark" title="Resaltado" />
        <B label="A+" kind="big" title="Más grande" style={{ fontSize: 12 }} />
        <B label="≡" kind="center" title="Centrar / descentrar esta línea" style={{ fontSize: 16 }} />
        {toggle("colors", "🎨", "Color del texto")}
        {toggle("emoji", "😀", "Insertar emoji")}
        <B label="✕" kind="clear" title="Quitar formato" style={{ fontSize: 12, color: "var(--ink-500)" }} />
        {toggle("help", "?", "Ayuda")}
      </div>

      {pop === "nofocus" && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#92400e", background: "#fef3c7", padding: "6px 10px", borderRadius: 8 }}>
          Haz clic primero en el enunciado o en una opción, selecciona el texto y luego elige el formato.
        </div>
      )}
      {pop === "colors" && (
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {RICH_COLOR_NAMES.map(c => (
            <button key={c} type="button" title={c} onMouseDown={e => e.preventDefault()} onClick={() => apply("color", c)} style={{
              width: 26, height: 26, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,.35)",
              background: RICH_COLORS[c], cursor: "pointer",
            }} />
          ))}
        </div>
      )}
      {pop === "emoji" && (
        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
          {RICH_EMOJIS.map(e => (
            <button key={e} type="button" onMouseDown={ev => ev.preventDefault()} onClick={() => apply("emoji", e)} style={{
              width: 32, height: 32, borderRadius: 8, border: "1px solid var(--ink-200)", background: "var(--ink-50)", fontSize: 18, cursor: "pointer",
            }}>{e}</button>
          ))}
        </div>
      )}
      {pop === "help" && (
        <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.6, color: "var(--ink-700)", background: "var(--violet-50)", border: "1px solid var(--violet-200)", padding: "8px 12px", borderRadius: 8 }}>
          Selecciona un trozo del enunciado o de una opción y pulsa un botón: lo que ves en el cuadro es exactamente
          lo que verán los estudiantes en el celular y en la proyección. <b>≡</b> centra la línea donde está el cursor;
          <b> ✕</b> quita el formato de lo seleccionado. Enter crea una línea nueva en el enunciado.
        </div>
      )}
    </div>
  );
}

window.RichText = RichText;
window.richToPlain = richToPlain;
window.richHasMarkup = richHasMarkup;
window.richToHtml = richToHtml;
window.htmlToRich = htmlToRich;
window.RichEditable = RichEditable;
window.RichFormatToolbar = RichFormatToolbar;
