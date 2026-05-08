/* global React, I, MOCK_QUIZ, MOCK_RESULTS, tileColor, tileShape */
// ============================================================
// QuizSpark — Results dashboard with Sheets/Excel export
// ============================================================
const { useState: useStateR } = React;

function ResultsDashboard({ onBack }) {
  const [tab, setTab] = useStateR("ranking"); // ranking | byQuestion | individual | sheets
  const [showExport, setShowExport] = useStateR(false);
  const quiz = MOCK_QUIZ;
  const results = MOCK_RESULTS;

  return (
    <div style={{ minHeight: "100vh", background: "var(--ink-50)" }}>
      {/* Sub header */}
      <div style={{
        background: "var(--white)", borderBottom: "1px solid var(--ink-200)",
        padding: "20px 32px",
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <button onClick={onBack} style={{
                display: "flex", alignItems: "center", gap: 6, color: "var(--ink-500)",
                fontWeight: 600, fontSize: 13, marginBottom: 8,
              }}>
                <I.back size={14}/> Volver al panel
              </button>
              <h1 style={{ fontSize: 28 }}>{quiz.title}</h1>
              <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 13, color: "var(--ink-500)" }}>
                <span>📅 6 may 2026 · 14:32</span>
                <span>👥 {results.length} participantes</span>
                <span>📝 {quiz.questions.length} preguntas</span>
                <span>⏱️ Duración 8:14</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="qs-btn qs-btn--ghost qs-btn--sm">
                <I.share size={14}/> Compartir
              </button>
              <button onClick={() => setShowExport(true)} className="qs-btn qs-btn--success">
                <I.download size={16}/> Exportar
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {[
              { id: "ranking",    label: "Ranking final",      icon: "trophy" },
              { id: "byQuestion", label: "Análisis por pregunta", icon: "bar" },
              { id: "individual", label: "Respuestas individuales", icon: "list" },
              { id: "sheets",     label: "Hoja de Google Sheets", icon: "sheets" },
            ].map(t => {
              const Tico = I[t.icon];
              const sel = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)} style={{
                  padding: "10px 14px", display: "flex", alignItems: "center", gap: 6,
                  borderRadius: "12px 12px 0 0", fontWeight: 700, fontSize: 13,
                  background: sel ? "var(--ink-50)" : "transparent",
                  color: sel ? "var(--violet-700)" : "var(--ink-500)",
                  borderBottom: sel ? "3px solid var(--violet-600)" : "3px solid transparent",
                  marginBottom: -1,
                }}>
                  <Tico size={16}/> {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: 32 }}>
        {tab === "ranking"    && <RankingTab results={results}/>}
        {tab === "byQuestion" && <ByQuestionTab quiz={quiz} results={results}/>}
        {tab === "individual" && <IndividualTab quiz={quiz} results={results}/>}
        {tab === "sheets"     && <SheetsTab quiz={quiz} results={results}/>}
      </div>

      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  );
}

// ----- TAB: RANKING -----
function RankingTab({ results }) {
  // KPI cards
  const totalScore = results.reduce((s, r) => s + r.score, 0);
  const avgCorrect = (results.reduce((s, r) => s + r.correctCount, 0) / results.length).toFixed(1);
  const totalQuestions = MOCK_QUIZ.questions.length;
  const accuracy = ((avgCorrect / totalQuestions) * 100).toFixed(0) + "%";

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Promedio aciertos", value: `${avgCorrect}/${totalQuestions}`, c: "var(--emerald-500)", icon: "check" },
          { label: "Tasa de aciertos",  value: accuracy, c: "var(--violet-500)", icon: "star" },
          { label: "Mejor puntaje",     value: results[0].score.toLocaleString("es"), c: "var(--amber-500)", icon: "trophy" },
          { label: "Tiempo promedio",   value: "12.3 s", c: "var(--sky-500)", icon: "clock" },
        ].map(s => {
          const Ico = I[s.icon];
          return (
            <div key={s.label} className="qs-card" style={{ padding: 18, display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.c,
                display: "grid", placeItems: "center" }}><Ico size={20} stroke="#fff"/></div>
              <div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)" }}>{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top 3 podium card */}
      <div className="qs-card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 style={{ fontSize: 16, marginBottom: 16 }}>🏆 Top 3</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {results.slice(0, 3).map((p, i) => (
            <div key={p.id} style={{
              padding: 18, borderRadius: 16, display: "flex", gap: 12, alignItems: "center",
              background: i === 0 ? "linear-gradient(135deg, var(--amber-300), #FFEED9)" :
                          i === 1 ? "linear-gradient(135deg, #E5E7EB, #F8F9FA)" :
                                    "linear-gradient(135deg, #FBC089, #FFE9D6)",
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: "#fff",
                display: "grid", placeItems: "center", fontSize: 22, fontWeight: 800,
                fontFamily: "var(--font-display)", color: "var(--ink-900)",
                boxShadow: "0 3px 0 rgba(0,0,0,.1)",
              }}>{i + 1}</div>
              <div style={{ fontSize: 36 }}>{p.avatar}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-700)" }}>{p.correctCount}/{MOCK_QUIZ.questions.length} aciertos</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-display)" }}>
                {p.score.toLocaleString("es")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full table */}
      <div className="qs-card" style={{ overflow: "hidden" }}>
        <div style={{
          padding: "14px 20px", display: "grid",
          gridTemplateColumns: "60px 1fr 100px 100px 100px 100px",
          fontSize: 11, fontWeight: 800, color: "var(--ink-500)",
          background: "var(--ink-50)", borderBottom: "1px solid var(--ink-200)",
          letterSpacing: ".05em",
        }}>
          <div>POS</div>
          <div>PARTICIPANTE</div>
          <div style={{ textAlign: "center" }}>ACIERTOS</div>
          <div style={{ textAlign: "center" }}>% CORRECTAS</div>
          <div style={{ textAlign: "center" }}>TIEMPO PROM.</div>
          <div style={{ textAlign: "right" }}>PUNTAJE</div>
        </div>
        {results.map((p, i) => {
          const avgTime = (p.answers.reduce((s, a) => s + a.time, 0) / p.answers.length).toFixed(1);
          const correctPct = Math.round((p.correctCount / MOCK_QUIZ.questions.length) * 100);
          return (
            <div key={p.id} style={{
              padding: "12px 20px", display: "grid",
              gridTemplateColumns: "60px 1fr 100px 100px 100px 100px",
              borderBottom: "1px solid var(--ink-100)", alignItems: "center",
              background: i % 2 ? "var(--ink-50)" : "transparent",
            }}>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 28, height: 28, borderRadius: 8,
                background: i < 3 ? ["var(--amber-400)", "var(--ink-300)", "#D97706"][i] : "var(--ink-100)",
                color: i < 3 ? "#fff" : "var(--ink-700)", fontWeight: 800, fontSize: 13,
              }}>{i + 1}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>{p.avatar}</span>
                <span style={{ fontWeight: 700 }}>{p.name}</span>
              </div>
              <div style={{ textAlign: "center", fontWeight: 700, color: "var(--emerald-600)" }}>
                {p.correctCount}/{MOCK_QUIZ.questions.length}
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: correctPct >= 75 ? "#D1FAE5" : correctPct >= 50 ? "#FEF3C7" : "#FEE2E2",
                  color: correctPct >= 75 ? "#065F46" : correctPct >= 50 ? "#92400E" : "#991B1B",
                }}>{correctPct}%</div>
              </div>
              <div style={{ textAlign: "center", fontSize: 13, color: "var(--ink-500)" }}>{avgTime} s</div>
              <div style={{ textAlign: "right", fontWeight: 800, fontFamily: "var(--font-display)",
                color: "var(--violet-700)", fontSize: 16 }}>
                {p.score.toLocaleString("es")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----- TAB: BY QUESTION -----
function ByQuestionTab({ quiz, results }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {quiz.questions.map((q, qi) => {
        const correctCount = results.filter(r => r.answers[qi]?.correct).length;
        const accuracy = Math.round((correctCount / results.length) * 100);
        const avgTime = (results.reduce((s, r) => s + r.answers[qi].time, 0) / results.length).toFixed(1);
        // Distribution for non-text
        let dist = null;
        if (q.type !== "text") {
          dist = q.options.map((o, i) => {
            const correctBase = o.correct ? 0.55 : 0.15;
            const count = Math.round(results.length * (correctBase + ((i + qi) % 3) * 0.05));
            return { ...o, count, pct: Math.round((count / results.length) * 100) };
          });
        }
        return (
          <div key={q.id} className="qs-card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: "var(--violet-600)",
                  color: "#fff", display: "grid", placeItems: "center", fontWeight: 800,
                  flexShrink: 0,
                }}>{qi + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-900)", marginBottom: 4 }}>{q.text}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)", display: "flex", gap: 12 }}>
                    <span>⏱️ {avgTime}s prom.</span>
                    <span>👥 {results.length} respuestas</span>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "center", minWidth: 120 }}>
                <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700 }}>ACIERTOS</div>
                <div style={{
                  fontSize: 28, fontWeight: 800, fontFamily: "var(--font-display)",
                  color: accuracy >= 75 ? "var(--emerald-500)" : accuracy >= 50 ? "var(--amber-500)" : "var(--red-500)",
                }}>{accuracy}%</div>
                <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{correctCount} de {results.length}</div>
              </div>
            </div>

            {dist ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                {dist.map((o, i) => (
                  <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, background: tileColor(i),
                      color: "#fff", display: "grid", placeItems: "center", fontSize: 14,
                      flexShrink: 0,
                    }}>{tileShape(i)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: o.correct ? "var(--emerald-600)" : "var(--ink-700)",
                        }}>
                          {o.text} {o.correct && <I.check size={12} stroke="var(--emerald-600)" sw={3} style={{ display: "inline" }}/>}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-500)" }}>
                          {o.count} ({o.pct}%)
                        </span>
                      </div>
                      <div style={{
                        height: 8, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden",
                      }}>
                        <div style={{
                          width: `${o.pct}%`, height: "100%",
                          background: o.correct ? "var(--emerald-500)" : tileColor(i),
                          opacity: o.correct ? 1 : 0.6,
                        }}/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: 10, padding: 14, background: "var(--ink-50)", borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: "var(--ink-500)", fontWeight: 700, marginBottom: 6 }}>
                  RESPUESTAS DE TEXTO MÁS COMUNES
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { text: "colón", c: 7 },
                    { text: "colones", c: 4 },
                    { text: "peso", c: 1 },
                  ].map(r => (
                    <span key={r.text} style={{
                      padding: "6px 12px", background: "#fff", borderRadius: 999,
                      fontSize: 13, fontWeight: 600, display: "flex", gap: 6, alignItems: "center",
                      border: "1px solid var(--ink-200)",
                    }}>
                      "{r.text}" <span style={{ color: "var(--ink-500)", fontSize: 11 }}>×{r.c}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ----- TAB: INDIVIDUAL -----
function IndividualTab({ quiz, results }) {
  const [selectedId, setSelectedId] = useStateR(results[0].id);
  const sel = results.find(r => r.id === selectedId);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
      {/* Left list */}
      <div className="qs-card" style={{ padding: 12, maxHeight: 700, overflowY: "auto" }}>
        {results.map(p => {
          const sel2 = p.id === selectedId;
          return (
            <button key={p.id} onClick={() => setSelectedId(p.id)} style={{
              width: "100%", padding: 10, borderRadius: 10, display: "flex",
              alignItems: "center", gap: 10, marginBottom: 4, textAlign: "left",
              background: sel2 ? "var(--violet-100)" : "transparent",
              border: sel2 ? "2px solid var(--violet-400)" : "2px solid transparent",
            }}>
              <span style={{ fontSize: 26 }}>{p.avatar}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-500)" }}>
                  {p.correctCount}/{quiz.questions.length} · {p.score.toLocaleString("es")} pts
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {/* Right detail */}
      <div className="qs-card" style={{ padding: 24 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 20, alignItems: "center" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: "var(--violet-100)",
            display: "grid", placeItems: "center", fontSize: 38,
          }}>{sel.avatar}</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22 }}>{sel.name}</h2>
            <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
              Posición #{results.indexOf(sel) + 1} · participó el 6 may 2026
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700 }}>PUNTAJE</div>
            <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--violet-700)" }}>
              {sel.score.toLocaleString("es")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {quiz.questions.map((q, qi) => {
            const ans = sel.answers[qi];
            return (
              <div key={q.id} style={{
                padding: 14, borderRadius: 12, background: "var(--ink-50)",
                display: "flex", gap: 12, alignItems: "center",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: ans.correct ? "var(--emerald-500)" : "var(--red-500)",
                  display: "grid", placeItems: "center",
                }}>{ans.correct ? <I.check size={18} stroke="#fff" sw={3}/> : <I.x size={18} stroke="#fff" sw={3}/>}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 700 }}>P{qi + 1}</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{q.text}</div>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", textAlign: "right" }}>
                  <div>{ans.time}s</div>
                  <div style={{ fontWeight: 700, color: ans.correct ? "var(--emerald-600)" : "var(--ink-400)" }}>
                    {ans.correct ? `+${Math.round(800 + (1 - ans.time / 20) * 400)}` : "0"} pts
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ----- TAB: SHEETS -----
function SheetsTab({ quiz, results }) {
  return (
    <div className="qs-card" style={{ overflow: "hidden" }}>
      {/* Sheets header */}
      <div style={{
        padding: "14px 20px", background: "linear-gradient(180deg, #f1f3f4, #e8eaed)",
        borderBottom: "1px solid #d2d5db", display: "flex", alignItems: "center", gap: 12,
      }}>
        <I.sheets size={28} stroke="var(--emerald-600)"/>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#202124" }}>
            Respuestas — Cultura general (Latam)
          </div>
          <div style={{ fontSize: 11, color: "#5f6368" }}>
            ☁ Conectado · última actualización hace 2 min · sincronizando en tiempo real
          </div>
        </div>
        <div style={{
          padding: "4px 10px", background: "#E6F4EA", color: "#137333", fontSize: 11,
          borderRadius: 4, fontWeight: 700, display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ width: 6, height: 6, background: "#137333", borderRadius: "50%" }}/>
          EN VIVO
        </div>
        <button className="qs-btn qs-btn--ghost qs-btn--sm">
          <I.share size={14}/> Abrir en Sheets
        </button>
      </div>

      {/* Spreadsheet */}
      <div style={{ overflowX: "auto", background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f8f9fa" }}>
              {["", "A", "B", "C", "D", "E", "F", "G", "H"].map((c, i) => (
                <th key={i} style={{
                  padding: "6px 10px", borderBottom: "1px solid #d2d5db",
                  borderRight: "1px solid #e8eaed", color: "#5f6368", fontWeight: 500,
                  fontSize: 11, textAlign: "center", minWidth: i === 0 ? 36 : 110,
                  background: "#f1f3f4",
                }}>{c}</th>
              ))}
            </tr>
            <tr style={{ background: "#fff" }}>
              <td style={cellStyleHead}></td>
              <td style={cellStyleHead}>Marca de tiempo</td>
              <td style={cellStyleHead}>Participante</td>
              <td style={cellStyleHead}>P1: Capital de Perú</td>
              <td style={cellStyleHead}>P2: Amazonas Argentina</td>
              <td style={cellStyleHead}>P3: Países frontera Brasil</td>
              <td style={cellStyleHead}>P4: Moneda Costa Rica</td>
              <td style={cellStyleHead}>Aciertos</td>
              <td style={cellStyleHead}>Puntaje</td>
            </tr>
          </thead>
          <tbody>
            {results.map((p, i) => {
              const ts = `2026-05-06 14:${(32 + Math.floor(i / 3)).toString().padStart(2, "0")}:${((i * 7) % 60).toString().padStart(2, "0")}`;
              const fakeText = (qi) => {
                if (qi === 0) return p.answers[0].correct ? "Lima" : "Quito";
                if (qi === 1) return p.answers[1].correct ? "Falso" : "Verdadero";
                if (qi === 2) return p.answers[2].correct ? "Colombia, Perú, Uruguay" : "Colombia, Chile";
                if (qi === 3) return p.answers[3].correct ? "colón" : "peso";
              };
              return (
                <tr key={p.id} style={{ background: i === 0 ? "#fef9e6" : "#fff" }}>
                  <td style={{ ...cellStyleHead, background: "#f1f3f4" }}>{i + 2}</td>
                  <td style={cellStyle}>{ts}</td>
                  <td style={{ ...cellStyle, fontWeight: 600 }}>
                    {p.avatar} {p.name}
                  </td>
                  {[0, 1, 2, 3].map(qi => (
                    <td key={qi} style={{
                      ...cellStyle,
                      color: p.answers[qi].correct ? "#137333" : "#c5221f",
                    }}>{fakeText(qi)}</td>
                  ))}
                  <td style={{ ...cellStyle, textAlign: "center", fontWeight: 600 }}>{p.correctCount}/4</td>
                  <td style={{ ...cellStyle, textAlign: "right", fontWeight: 600 }}>{p.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 16, background: "var(--ink-50)", borderTop: "1px solid var(--ink-200)",
        display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "var(--ink-500)" }}>
          📋 Cada respuesta se añade automáticamente. Comparte el link de la hoja con tu equipo o exporta como Excel.
        </span>
        <button className="qs-btn qs-btn--ghost qs-btn--sm" style={{ marginLeft: "auto" }}>
          <I.copy size={14}/> Copiar link
        </button>
        <button className="qs-btn qs-btn--success qs-btn--sm">
          <I.excel size={14}/> Descargar .xlsx
        </button>
      </div>
    </div>
  );
}

const cellStyle = {
  padding: "8px 10px",
  borderBottom: "1px solid #f0f1f3",
  borderRight: "1px solid #e8eaed",
  color: "#202124",
  whiteSpace: "nowrap",
};
const cellStyleHead = {
  ...cellStyle,
  background: "#f8f9fa",
  fontWeight: 600,
  textAlign: "center",
  color: "#5f6368",
};

// ----- EXPORT MODAL -----
function ExportModal({ onClose }) {
  const [done, setDone] = useStateR(false);
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(20,16,43,.5)", zIndex: 100,
      display: "grid", placeItems: "center", padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="qs-card" style={{ padding: 28, maxWidth: 480, width: "100%" }}>
        <h2 style={{ marginBottom: 6 }}>Exportar resultados</h2>
        <p style={{ color: "var(--ink-500)", marginBottom: 20, fontSize: 14 }}>
          Elige cómo quieres llevarte los datos.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <ExportOption icon="sheets" title="Google Sheets (en vivo)"
            desc="Hoja conectada, se actualiza en cada sesión" badge="✓ Conectado"
            badgeColor="var(--emerald-500)" onClick={() => setDone("sheets")}/>
          <ExportOption icon="excel" title="Descargar Excel (.xlsx)"
            desc="Archivo con todas las respuestas y un resumen"
            onClick={() => setDone("excel")}/>
          <ExportOption icon="download" title="CSV plano"
            desc="Compatible con cualquier hoja de cálculo"
            onClick={() => setDone("csv")}/>
        </div>
        {done && (
          <div style={{
            padding: 12, background: "#D1FAE5", color: "#065F46", borderRadius: 12,
            display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600,
          }}>
            <I.check size={18} stroke="var(--emerald-600)" sw={3}/>
            {done === "sheets" ? "Abriendo Google Sheets..." :
             done === "excel"  ? "Descargando resultados.xlsx..." :
                                 "Descargando resultados.csv..."}
          </div>
        )}
        <button onClick={onClose} className="qs-btn qs-btn--ghost" style={{ width: "100%", marginTop: 12 }}>Cerrar</button>
      </div>
    </div>
  );
}

function ExportOption({ icon, title, desc, badge, badgeColor, onClick }) {
  const Ico = I[icon];
  return (
    <button onClick={onClick} style={{
      padding: 14, borderRadius: 14, background: "var(--ink-50)",
      border: "2px solid transparent", display: "flex", alignItems: "center", gap: 12,
      textAlign: "left", transition: "border-color .15s",
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = "var(--violet-400)"}
    onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, background: "var(--white)",
        display: "grid", placeItems: "center",
      }}>
        <Ico size={22} stroke="var(--violet-600)"/>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
          {title}
          {badge && <span style={{
            fontSize: 10, fontWeight: 800, color: "#fff", background: badgeColor,
            padding: "2px 8px", borderRadius: 999,
          }}>{badge}</span>}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{desc}</div>
      </div>
      <I.arrowR size={18} stroke="var(--ink-400)"/>
    </button>
  );
}

Object.assign(window, { ResultsDashboard });
