import React, { useState, useMemo, useRef } from "react";

const GREEN = "#19A49E";
const PURPLE = "#7B378B";
const GREY = "#575757";
const INK = "#1a1a1a";
const HORIZONS = ["Near-term", "Medium-term", "Structural"];

// ─── Prompt ───────────────────────────────────────────────────────────────────
// Chain-of-thought internally: reason through all four mechanisms, then
// surface final scores + one analytical paragraph with data where possible.
const buildPrompt = (name, ticker) => `
You are a senior equity analyst at a European quality-growth fund (benchmark: MSCI Europe).
Your task: assess "${name}" (${ticker || "n/a"}) on its structural exposure to AI.

Work through each of the four mechanisms privately, then return your conclusion.

MECHANISM REASONING (think through each before scoring):
1. REVENUE / TAM — Does AI structurally expand this company's addressable market, create new product lines, or accelerate pricing power? Or does it cannibalize existing revenue streams or enable cheaper substitutes?
2. MARGIN — Is AI a net cost-out story for this business (automation, efficiency), or will competitive dynamics force margin give-back? Who captures the value — the company or its customers?
3. MOAT — Does this company have proprietary data, distribution, or workflow embedding that becomes MORE defensible with AI? Or does AI commoditise its core offering and lower barriers to entry?
4. CAPEX / REINVESTMENT — Is the reinvestment burden to stay competitive manageable, or does AI require heavy capex that weighs on ROIC? Is it a net capex beneficiary (selling to the builders) or a net spender?

After reasoning privately, return ONLY this JSON — no markdown, no preamble:
{
  "off": <integer 1-5>,
  "thr": <integer 1-5>,
  "horizon": "<Near-term|Medium-term|Structural>",
  "paragraph": "<One analytical paragraph, 60-90 words, explaining the net winner/loser verdict. Be specific: name the dominant mechanism, cite at least 2 concrete data points or facts (revenue figures, market share, margins, customer concentration, product names). Write like a CFA charterholder, not a journalist. No hedging phrases like 'it remains to be seen'.>"
}

Scoring guide:
- off 5 = transformational AI tailwind (new TAM, structural moat deepening, major cost-out)
- off 1 = AI is irrelevant or negligible for the upside
- thr 5 = existential disruption risk (core product substituted, moat destroyed, margin structurally impaired)
- thr 1 = well insulated, AI poses no credible threat to the business model
`.trim();

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED_PORTFOLIO = [
  { name: "ASML", ticker: "ASML NA", weight: 4.8, off: 4, thr: 1, conf: 5, horizon: "Structural", paragraph: "ASML holds a monopoly on EUV lithography — every advanced AI chip requires its machines. The AI capex supercycle directly expands ASML's TAM: TSMC, Samsung, and Intel collectively guided $150bn+ in 2024 capex, with EUV density per wafer rising. No credible substitute exists at sub-3nm nodes. Margin is protected by a service and upgrade cycle. The only threat is a sustained capex correction, not structural disruption." },
  { name: "SAP", ticker: "SAP GY", weight: 3.9, off: 3, thr: 3, conf: 4, horizon: "Medium-term", paragraph: "SAP's AI co-pilot (Joule) embedded across S/4HANA creates genuine upsell opportunity — management guided €1bn+ incremental AI revenue by 2026. However, the structural threat is agent-based automation collapsing per-seat ERP pricing: if AI agents execute workflows autonomously, the per-user licence model faces compression. SAP's 27,000 enterprise customers and switching costs are the moat; the question is whether they monetise AI before it erodes the model." },
  { name: "RELX", ticker: "REL LN", weight: 3.6, off: 4, thr: 2, conf: 4, horizon: "Structural", paragraph: "RELX's proprietary legal, scientific, and risk datasets are structurally defensible AI assets. LexisNexis+ AI and Elsevier's ScienceDirect are workflow-embedded tools that become stickier with AI, not weaker. Risk Solutions (35% of revenue, ~30% EBIT margin) uses AI for real-time fraud detection — a market growing at 15%+ annually. The threat is narrow: AI-generated content could pressure academic publishing volumes, but this is a sub-15% revenue risk." },
  { name: "L'Oréal", ticker: "OR FP", weight: 2.7, off: 2, thr: 1, conf: 3, horizon: "Medium-term", paragraph: "L'Oréal is largely insulated from AI disruption — brand equity, distribution, and formulation R&D are not AI-substitutable at scale. AI is a tailwind in two areas: personalised beauty diagnostics (Modiface, 80m+ users) and manufacturing efficiency. Neither is material enough to move the needle on group revenue (€42bn in 2024) or EBIT margin (~20%). This is a story of AI as an incremental efficiency lever, not a structural re-rating catalyst." },
  { name: "Adyen", ticker: "ADYEN NA", weight: 2.0, off: 2, thr: 2, conf: 3, horizon: "Medium-term", paragraph: "Adyen's AI exposure is balanced. On offense, machine learning underpins its fraud prevention engine — a key differentiator vs. legacy processors — and AI optimises authorisation rates, directly driving net revenue (take rate). On threat, AI lowers the barrier for new payment infrastructure entrants and could compress processing margins industry-wide. Adyen's single-platform architecture and direct acquiring relationships remain the moat; AI is a tool, not a disruptor, at this stage." },
  { name: "Heineken", ticker: "HEIA NA", weight: 1.8, off: 1, thr: 1, conf: 4, horizon: "Medium-term", paragraph: "Heineken is a near-zero AI exposure name in either direction. Distribution scale, brand, and licensed brewing are not AI-disrupted. AI contributes marginally to yield optimisation and demand forecasting, but these are efficiency measures, not growth drivers. The business is structurally insulated: no digital product, no data moat at risk, no AI-driven TAM expansion. AI is noise relative to the core drivers of volume, pricing, and premium mix." },
  { name: "Wolters Kluwer", ticker: "WKL NA", weight: 3.1, off: 4, thr: 2, conf: 4, horizon: "Structural", paragraph: "Wolters Kluwer's compliance and tax workflows are high-value, regulation-dense, and deeply embedded — exactly the profile that benefits from AI augmentation rather than disruption. CCH Tagetik and UpToDate AI tools are already in market, and WKL's 94% recurring revenue base provides reinvestment stability. The risk is limited to AI-native startups targeting narrow verticals, but WKL's regulatory depth (covering 180+ jurisdictions) is a 10-year data moat that new entrants cannot replicate quickly." },
];

const SEED_BENCHMARK = [
  { name: "ASML",           ticker: "ASML NA",   weight: 1.8 },
  { name: "SAP",            ticker: "SAP GY",    weight: 2.1 },
  { name: "RELX",           ticker: "REL LN",    weight: 1.2 },
  { name: "L'Oréal",        ticker: "OR FP",     weight: 1.5 },
  { name: "Adyen",          ticker: "ADYEN NA",  weight: 0.4 },
  { name: "Heineken",       ticker: "HEIA NA",   weight: 0.5 },
  { name: "Wolters Kluwer", ticker: "WKL NA",    weight: 0.8 },
  { name: "Novo Nordisk",   ticker: "NOVOB DC",  weight: 4.2 },
  { name: "LVMH",           ticker: "MC FP",     weight: 2.8 },
  { name: "Nestlé",         ticker: "NESN SW",   weight: 2.3 },
];

const blankH = () => ({ name: "", ticker: "", weight: 0, off: 0, thr: 0, conf: 3, horizon: "Medium-term", paragraph: "" });
const blankB = () => ({ name: "", ticker: "", weight: 0 });
const net = (h) => (h.off || 0) - (h.thr || 0);

const quadrant = (h) => {
  const o = (h.off || 0) >= 3, t = (h.thr || 0) >= 3;
  if (o && !t) return { name: "Clear Winner",  color: GREEN };
  if (o && t)  return { name: "Contested",     color: PURPLE };
  if (!o && t) return { name: "Disrupted",     color: "#C0392B" };
  return             { name: "Insulated",      color: GREY };
};

function bmkWeight(h, benchmark) {
  const b = benchmark.find(b =>
    (h.ticker && b.ticker && h.ticker.trim().toLowerCase() === b.ticker.trim().toLowerCase()) ||
    (h.name   && b.name   && h.name.trim().toLowerCase()   === b.name.trim().toLowerCase())
  );
  return b ? (Number(b.weight) || 0) : 0;
}

function parseCSV(text) {
  const rows = text.trim().split(/\r?\n/).map(l => l.split(",").map(c => c.trim()));
  const hdr  = rows[0].map(c => c.toLowerCase());
  const fi   = keys => hdr.findIndex(c => keys.some(k => c.includes(k)));
  const ni   = fi(["name","company","holding"]);
  const ti   = fi(["ticker","isin","code","bbg"]);
  const wi   = fi(["weight","wt","%","pos"]);
  return rows.slice(1).filter(r => r[ni]).map(r => ({
    name:   (r[ni] || "").trim(),
    ticker: ti >= 0 ? (r[ti] || "").trim() : "",
    weight: parseFloat(wi >= 0 ? r[wi] : 0) || 0,
  }));
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [holdings,   setHoldings]   = useState(SEED_PORTFOLIO);
  const [benchmark,  setBenchmark]  = useState(SEED_BENCHMARK);
  const [sel,        setSel]        = useState(0);
  const [busy,       setBusy]       = useState(false);
  const [busyIdx,    setBusyIdx]    = useState(null);
  const [llmErr,     setLlmErr]     = useState("");
  const [tab,        setTab]        = useState("portfolio");
  const [bmkSel,     setBmkSel]     = useState(0);
  const [apiKey,     setApiKey]     = useState(process.env.REACT_APP_OPENAI_KEY || "");
  const [showKey,    setShowKey]    = useState(false);
  const pfRef  = useRef(null);
  const bmkRef = useRef(null);

  const updH = (i, f, v) => setHoldings(hs => hs.map((h, j) => j === i ? { ...h, [f]: v } : h));
  const updB = (i, f, v) => setBenchmark(bs => bs.map((b, j) => j === i ? { ...b, [f]: v } : b));

  // ─── Aggregates ─────────────────────────────────────────────────────────────
  const agg = useMemo(() => {
    const tw       = holdings.reduce((s, h) => s + (Number(h.weight) || 0), 0) || 1;
    const pfNet    = holdings.reduce((s, h) => s + (Number(h.weight) || 0) * net(h), 0) / tw;
    const bmkTw    = benchmark.reduce((s, b) => s + (Number(b.weight) || 0), 0) || 1;
    const bmkNet   = benchmark.reduce((s, b) => {
      const match = holdings.find(h =>
        (h.ticker && b.ticker && h.ticker.trim().toLowerCase() === b.ticker.trim().toLowerCase()) ||
        (h.name   && b.name   && h.name.trim().toLowerCase()   === b.name.trim().toLowerCase())
      );
      return s + (Number(b.weight) || 0) * (match ? net(match) : 0);
    }, 0) / bmkTw;
    const activeNet    = pfNet - bmkNet;
    const winnerW      = holdings.filter(h => net(h) >  0).reduce((s, h) => s + Number(h.weight || 0), 0);
    const loserW       = holdings.filter(h => net(h) <  0).reduce((s, h) => s + Number(h.weight || 0), 0);
    const contestedW   = holdings.filter(h => (h.off||0) >= 3 && (h.thr||0) >= 3).reduce((s, h) => s + Number(h.weight || 0), 0);
    const crowdedW     = holdings.filter(h => quadrant(h).name === "Clear Winner").reduce((s, h) => s + Number(h.weight || 0), 0);
    const activeWinnerW = holdings.filter(h => net(h) > 0).reduce((s, h) => s + (Number(h.weight || 0) - bmkWeight(h, benchmark)), 0);
    return { tw, pfNet, bmkNet, activeNet, winnerW, loserW, contestedW, crowdedW, activeWinnerW };
  }, [holdings, benchmark]);

  // ─── LLM scoring (GPT-5.4) ──────────────────────────────────────────────────
  async function scoreOne(i) {
    if (!apiKey) { setLlmErr("Paste your OpenAI API key in the field above first."); return; }
    const h = holdings[i];
    if (!h.name) return;
    setBusy(true); setBusyIdx(i); setLlmErr("");
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-5.4",
          max_tokens: 600,
          temperature: 0.3,
          messages: [{ role: "user", content: buildPrompt(h.name, h.ticker) }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const text  = data.choices?.[0]?.message?.content || "";
      const match = text.replace(/```json|```/g, "").trim().match(/\{[\s\S]*\}/);
      const p     = JSON.parse(match ? match[0] : text.trim());
      setHoldings(hs => hs.map((x, j) => j !== i ? x : {
        ...x,
        off:       Math.max(1, Math.min(5, p.off       ?? x.off)),
        thr:       Math.max(1, Math.min(5, p.thr       ?? x.thr)),
        horizon:   p.horizon   || x.horizon,
        paragraph: p.paragraph || x.paragraph,
      }));
    } catch (e) {
      setLlmErr(`Scoring failed: ${e.message}`);
    } finally {
      setBusy(false); setBusyIdx(null);
    }
  }

  async function scoreAll() {
    for (let i = 0; i < holdings.length; i++) {
      if (holdings[i].name) await scoreOne(i);
    }
  }

  // ─── CSV ─────────────────────────────────────────────────────────────────────
  function importCSV(e, target) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const rows = parseCSV(String(r.result));
      if (!rows.length) return;
      if (target === "portfolio") { setHoldings(rows.map(r2 => ({ ...blankH(), ...r2 }))); setSel(0); }
      else                        { setBenchmark(rows); setBmkSel(0); }
    };
    r.readAsText(f);
  }

  function exportCSV() {
    const hdr  = ["Name","Ticker","Portfolio Wt %","Benchmark Wt %","Active Wt %","Offense","Threat","Net","Active AI Contribution","Quadrant","Confidence","Horizon","Paragraph"];
    const lines = holdings.map(h => {
      const bw = bmkWeight(h, benchmark);
      const aw = (Number(h.weight) || 0) - bw;
      return [h.name, h.ticker, Number(h.weight).toFixed(2), bw.toFixed(2), aw.toFixed(2),
              h.off, h.thr, net(h), (aw * net(h)).toFixed(3), quadrant(h).name, h.conf, h.horizon,
              `"${(h.paragraph||"").replace(/"/g,"''")}"`].join(",");
    });
    const blob = new Blob([[hdr.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a"); a.href = url; a.download = "ai_exposure_scores.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Map ──────────────────────────────────────────────────────────────────────
  const W = 400, H = 400, PAD = 42;
  const sx  = o => PAD + ((o - 0.5) / 5) * (W - 2 * PAD);
  const sy  = t => H - PAD - ((t - 0.5) / 5) * (H - 2 * PAD);
  const rad = w => 5 + Math.sqrt(Math.max(w, 0)) * 3.6;

  const cur   = holdings[sel] || blankH();
  const curQ  = quadrant(cur);
  const curBW = bmkWeight(cur, benchmark);
  const curAW = (Number(cur.weight) || 0) - curBW;

  return (
    <div style={{ fontFamily: "'Georgia',serif", color: INK, background: "#faf9f7", minHeight: "100vh" }}>
      <style>{`
        *{box-sizing:border-box}
        .mono{font-family:'Courier New',monospace}
        .btn{cursor:pointer;border:none;border-radius:6px;font-family:inherit;font-size:13px;padding:9px 14px;transition:.15s}
        .btn:hover{filter:brightness(1.08)}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .pill{font-family:'Courier New',monospace;font-size:11px;letter-spacing:.5px;padding:3px 9px;border-radius:20px;display:inline-block}
        input,select,textarea{font-family:inherit;font-size:13px}
        .seg{display:flex;gap:4px}
        .seg button{width:34px;height:34px;border-radius:6px;border:1px solid #ddd;background:#fff;cursor:pointer;font-family:'Courier New',monospace;font-size:13px}
        tr.row{cursor:pointer}
        tr.row:hover td{background:#f0efed}
        .tab{cursor:pointer;padding:7px 16px;border-radius:6px 6px 0 0;font-size:13px;border:1px solid #e5e3df;border-bottom:none;background:#f0efed}
        .tab.active{background:#fff;font-weight:700}
        .spinner{display:inline-block;width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;margin-right:6px;vertical-align:middle}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* Header */}
      <div style={{ background: INK, color: "#fff", padding: "22px 32px 18px" }}>
        <div style={{ fontFamily: "'Courier New',monospace", fontSize: 10, letterSpacing: 3, color: GREEN, marginBottom: 5 }}>PORTFOLIO INTELLIGENCE · MSCI EUROPE</div>
        <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>AI Winner / Loser Exposure Monitor</div>
        <div style={{ fontSize: 13, color: "#b8b8b8", marginTop: 6, maxWidth: 680 }}>
          Two-axis framework — <span style={{ color: GREEN }}>Offense</span> vs <span style={{ color: "#E08585" }}>Threat</span> — scored by GPT-5.4 across four mechanisms: Revenue · Margin · Moat · Capex.
        </div>
      </div>

      {/* API key bar */}
      <div style={{ background: "#1e1e1e", padding: "10px 32px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #333" }}>
        <span style={{ fontFamily: "'Courier New',monospace", fontSize: 11, color: "#888" }}>OpenAI API key:</span>
        <input
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="sk-proj-..."
          style={{ flex: 1, maxWidth: 420, padding: "5px 10px", borderRadius: 5, border: "1px solid #444", background: "#111", color: "#eee", fontFamily: "Courier New", fontSize: 12 }}
        />
        <button onClick={() => setShowKey(s => !s)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 12 }}>{showKey ? "hide" : "show"}</button>
        <span style={{ fontSize: 11, color: "#555" }}>Key stays in your browser only — never sent anywhere except OpenAI.</span>
      </div>

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 1, background: "#e5e3df" }}>
        {[
          { l: "Portfolio net AI", v: agg.pfNet.toFixed(2),    s: "wt-avg offense − threat",    c: agg.pfNet    >= 0 ? GREEN : "#C0392B" },
          { l: "Benchmark net AI", v: agg.bmkNet.toFixed(2),   s: "MSCI Europe scored names",   c: GREY },
          { l: "Active AI exp",    v: (agg.activeNet >= 0 ? "+" : "") + agg.activeNet.toFixed(2), s: "portfolio minus benchmark", c: agg.activeNet >= 0 ? GREEN : "#C0392B" },
          { l: "Active winner OW", v: (agg.activeWinnerW >= 0 ? "+" : "") + agg.activeWinnerW.toFixed(1) + "%", s: "net-positive vs bmk", c: agg.activeWinnerW >= 0 ? GREEN : "#C0392B" },
          { l: "Contested wt",     v: agg.contestedW.toFixed(1) + "%", s: "high offense & threat", c: PURPLE },
          { l: "Crowded enabler",  v: agg.crowdedW.toFixed(1)  + "%", s: "consensus AI longs",    c: GREY },
        ].map((k, i) => (
          <div key={i} style={{ background: "#faf9f7", padding: "12px 14px" }}>
            <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, letterSpacing: 1, color: GREY, textTransform: "uppercase" }}>{k.l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.c, marginTop: 2 }}>{k.v}</div>
            <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 440px", gap: 0 }}>

        {/* LEFT */}
        <div style={{ padding: "18px 24px", borderRight: "1px solid #e5e3df" }}>
          <div style={{ display: "flex", gap: 0, marginBottom: -1, position: "relative", zIndex: 1 }}>
            <div className={`tab ${tab === "portfolio" ? "active" : ""}`} onClick={() => setTab("portfolio")}>Portfolio ({holdings.length})</div>
            <div className={`tab ${tab === "benchmark" ? "active" : ""}`} onClick={() => setTab("benchmark")}>Benchmark ({benchmark.length})</div>
          </div>
          <div style={{ background: "#fff", border: "1px solid #e5e3df", borderRadius: "0 6px 6px 6px", padding: "14px", marginBottom: 14 }}>
            {tab === "portfolio" && (
              <>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
                  <button className="btn" style={{ background: PURPLE, color: "#fff" }} onClick={scoreAll} disabled={busy}>
                    {busy ? <><span className="spinner"/>Scoring…</> : "⚡ GPT-5.4 score all"}
                  </button>
                  <button className="btn" style={{ background: "#fff", border: "1px solid #ddd" }} onClick={() => { setHoldings(hs => [...hs, blankH()]); setSel(holdings.length); }}>+ Add</button>
                  <button className="btn" style={{ background: "#fff", border: "1px solid #ddd" }} onClick={() => pfRef.current?.click()}>📂 Import CSV</button>
                  <button className="btn" style={{ background: GREEN, color: "#fff" }} onClick={exportCSV}>↓ Export</button>
                  <input ref={pfRef} type="file" accept=".csv" onChange={e => importCSV(e, "portfolio")} style={{ display: "none" }} />
                </div>
                {llmErr && <div style={{ background: "#fdecea", color: "#C0392B", padding: 8, borderRadius: 6, fontSize: 12, marginBottom: 8 }}>{llmErr}</div>}
                <HoldingsTable holdings={holdings} benchmark={benchmark} sel={sel} setSel={setSel}
                  onScore={scoreOne} busyIdx={busyIdx}
                  onDelete={i => { setHoldings(hs => hs.filter((_, j) => j !== i)); setSel(0); }} />
              </>
            )}
            {tab === "benchmark" && (
              <>
                <div style={{ display: "flex", gap: 7, marginBottom: 10 }}>
                  <button className="btn" style={{ background: "#fff", border: "1px solid #ddd" }} onClick={() => { setBenchmark(bs => [...bs, blankB()]); setBmkSel(benchmark.length); }}>+ Add</button>
                  <button className="btn" style={{ background: "#fff", border: "1px solid #ddd" }} onClick={() => bmkRef.current?.click()}>📂 Import CSV</button>
                  <input ref={bmkRef} type="file" accept=".csv" onChange={e => importCSV(e, "benchmark")} style={{ display: "none" }} />
                </div>
                <div style={{ fontSize: 12, color: GREY, marginBottom: 8 }}>MSCI Europe constituent weights. Match portfolio tickers exactly for active exposure to calculate.</div>
                <BmkTable benchmark={benchmark} sel={bmkSel} setSel={setBmkSel} updB={updB}
                  onDelete={i => { setBenchmark(bs => bs.filter((_, j) => j !== i)); setBmkSel(0); }} />
              </>
            )}
          </div>

          {/* Map */}
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Exposure map</div>
          <div style={{ fontSize: 11, color: GREY, marginBottom: 8 }}>Bubble area = portfolio weight. Click to inspect.</div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, background: "#fff", border: "1px solid #e5e3df", borderRadius: 8, display: "block" }}>
            <rect x={W/2} y={PAD}   width={W/2-PAD} height={H/2-PAD} fill={GREEN}    opacity={.05}/>
            <rect x={W/2} y={H/2}   width={W/2-PAD} height={H/2-PAD} fill={PURPLE}   opacity={.05}/>
            <rect x={PAD} y={H/2}   width={W/2-PAD} height={H/2-PAD} fill="#C0392B"  opacity={.05}/>
            <rect x={PAD} y={PAD}   width={W/2-PAD} height={H/2-PAD} fill={GREY}     opacity={.05}/>
            <line x1={PAD} y1={H/2} x2={W-PAD} y2={H/2} stroke="#ddd"/>
            <line x1={W/2} y1={PAD} x2={W/2} y2={H-PAD} stroke="#ddd"/>
            <text x={W-PAD} y={PAD-10} fontSize="9" fill={GREEN}    textAnchor="end"    fontFamily="Courier New">CLEAR WINNER</text>
            <text x={W-PAD} y={H-PAD+18} fontSize="9" fill={PURPLE} textAnchor="end"    fontFamily="Courier New">CONTESTED</text>
            <text x={PAD}   y={H-PAD+18} fontSize="9" fill="#C0392B" fontFamily="Courier New">DISRUPTED</text>
            <text x={PAD}   y={PAD-10}   fontSize="9" fill={GREY}    fontFamily="Courier New">INSULATED</text>
            <text x={W/2}   y={H-4}      fontSize="9" fill={INK}     textAnchor="middle" fontFamily="Courier New">OFFENSE →</text>
            <text x={11}    y={H/2}      fontSize="9" fill={INK}     textAnchor="middle" fontFamily="Courier New" transform={`rotate(-90 11 ${H/2})`}>THREAT →</text>
            {holdings.filter(h => h.off && h.thr).map((h, i) => {
              const idx = holdings.indexOf(h); const q = quadrant(h);
              return (
                <g key={i} onClick={() => setSel(idx)} style={{ cursor: "pointer" }}>
                  <circle cx={sx(h.off)} cy={sy(h.thr)} r={rad(h.weight)} fill={q.color}
                    opacity={idx === sel ? .85 : .4} stroke={idx === sel ? INK : "none"} strokeWidth={2}/>
                  <text x={sx(h.off)} y={sy(h.thr) - rad(h.weight) - 3} fontSize="8" textAnchor="middle" fill={INK}>{h.name}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* RIGHT — Inspector */}
        <div style={{ padding: "18px 22px", background: "#fff" }}>
          <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, letterSpacing: 2, color: GREY, marginBottom: 5 }}>INSPECTOR</div>
          <input value={cur.name} onChange={e => updH(sel, "name", e.target.value)} placeholder="Company name"
            style={{ fontSize: 19, fontWeight: 700, border: "none", borderBottom: "2px solid #eee", width: "100%", padding: "3px 0", fontFamily: "Georgia,serif" }}/>

          <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
            <input value={cur.ticker} onChange={e => updH(sel, "ticker", e.target.value)} placeholder="Ticker"
              style={{ flex: 1, padding: 7, border: "1px solid #ddd", borderRadius: 6 }} className="mono"/>
          </div>

          {/* Weight row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7, marginTop: 8 }}>
            <div>
              <Lbl>Portfolio wt %</Lbl>
              <input type="number" step="0.1" value={cur.weight} onChange={e => updH(sel, "weight", parseFloat(e.target.value)||0)}
                style={{ width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 6 }} className="mono"/>
            </div>
            <div>
              <Lbl>Benchmark wt %</Lbl>
              <div style={{ padding: "7px 10px", border: "1px solid #eee", borderRadius: 6, background: "#f8f8f8", fontFamily: "Courier New", color: GREY }}>{curBW.toFixed(2)}</div>
            </div>
            <div>
              <Lbl>Active wt %</Lbl>
              <div style={{ padding: "7px 10px", border: "1px solid #eee", borderRadius: 6, background: "#f8f8f8", fontFamily: "Courier New", fontWeight: 700,
                color: curAW > 0 ? GREEN : curAW < 0 ? "#C0392B" : GREY }}>
                {curAW >= 0 ? "+" : ""}{curAW.toFixed(2)}
              </div>
            </div>
          </div>

          <button className="btn" style={{ background: PURPLE, color: "#fff", width: "100%", marginTop: 10 }} onClick={() => scoreOne(sel)} disabled={busy}>
            {busyIdx === sel ? <><span className="spinner"/>Scoring {cur.name}…</> : `⚡ GPT-5.4 score: ${cur.name || "this name"}`}
          </button>

          <div style={{ marginTop: 14 }}>
            <ScoreRow label="Offense" hint="AI as tailwind" color={GREEN}      value={cur.off} onChange={v => updH(sel, "off", v)}/>
            <ScoreRow label="Threat"  hint="AI as disruptor" color="#C0392B" value={cur.thr} onChange={v => updH(sel, "thr", v)}/>
          </div>

          {/* Verdict strip */}
          <div style={{ background: curQ.color+"12", borderLeft: "4px solid "+curQ.color, padding: "9px 12px", borderRadius: 6, margin: "10px 0", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span className="pill" style={{ background: curQ.color, color: "#fff" }}>{curQ.name}</span>
            <span style={{ fontWeight: 700, color: net(cur) > 0 ? GREEN : net(cur) < 0 ? "#C0392B" : GREY }}>Net {net(cur)>0?"+":""}{net(cur)}</span>
            <span style={{ fontSize: 11, color: GREY }}>
              AI contribution: <b style={{ color: curAW*net(cur) >= 0 ? GREEN : "#C0392B" }}>{(curAW*net(cur)>=0?"+":"")}{(curAW*net(cur)).toFixed(2)}</b>
            </span>
          </div>

          {/* Analytical paragraph */}
          <Lbl>Analyst thesis</Lbl>
          <textarea value={cur.paragraph} onChange={e => updH(sel, "paragraph", e.target.value)} rows={6}
            placeholder="GPT-5.4 will write an analytical paragraph here — dominant mechanism, concrete data points, winner/loser verdict. Edit freely."
            style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 6, fontSize: 12, lineHeight: 1.65, resize: "vertical", fontFamily: "Georgia,serif", color: INK }}/>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1 }}>
              <Lbl>Horizon</Lbl>
              <select value={cur.horizon} onChange={e => updH(sel, "horizon", e.target.value)}
                style={{ width: "100%", padding: 7, border: "1px solid #ddd", borderRadius: 6 }}>
                {HORIZONS.map(h => <option key={h}>{h}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>Conviction (1–5)</Lbl>
              <div className="seg">
                {[1,2,3,4,5].map(n => (
                  <button key={n} onClick={() => updH(sel, "conf", n)}
                    style={{ background: cur.conf===n?INK:"#fff", color: cur.conf===n?"#fff":INK }}>{n}</button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, padding: 10, background: "#f8f8f8", borderRadius: 6, fontSize: 11, color: GREY, lineHeight: 1.65 }}>
            <b>How scores are built:</b> GPT-5.4 reasons through Revenue, Margin, Moat, and Capex privately before committing to final Offense/Threat scores and the paragraph above. Override any score with the buttons — your judgment takes precedence.
          </div>

          {holdings.length > 1 &&
            <button onClick={() => { setHoldings(hs => hs.filter((_,j)=>j!==sel)); setSel(0); }}
              style={{ marginTop: 14, background: "none", border: "none", color: "#C0392B", cursor: "pointer", fontSize: 12 }}>Delete this holding</button>}
        </div>
      </div>

      <div style={{ padding: "10px 32px", fontSize: 11, color: "#aaa", borderTop: "1px solid #e5e3df" }}>
        GPT-5.4 scores are a first pass — override with analyst judgment. Not investment advice.
        Active AI contribution = active weight × net score. Key lives in your browser only.
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function HoldingsTable({ holdings, benchmark, sel, setSel, onScore, busyIdx, onDelete }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid "+INK }}>
            {["Name","Pf%","Bk%","Act%","Off","Thr","Net","Quadrant",""].map((h,i) => (
              <th key={i} style={{ padding: "5px 5px", textAlign: i>=1&&i<=7?"center":"left", whiteSpace:"nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => {
            const q  = quadrant(h);
            const bw = bmkWeight(h, benchmark);
            const aw = (Number(h.weight)||0) - bw;
            const bg = i === sel ? "#f0efed" : "transparent";
            return (
              <tr key={i} className="row" onClick={() => setSel(i)}>
                <td style={{ padding:"5px 5px", background:bg }}>
                  <div style={{ fontWeight:600 }}>{h.name||<span style={{color:"#bbb"}}>—</span>}</div>
                  <div className="mono" style={{ fontSize:10, color:GREY }}>{h.ticker}</div>
                </td>
                {[
                  { v: Number(h.weight).toFixed(1), c: INK },
                  { v: bw.toFixed(1), c: GREY },
                  { v: (aw>=0?"+":"")+aw.toFixed(1), c: aw>0?GREEN:aw<0?"#C0392B":GREY },
                  { v: h.off||"·", c: GREEN },
                  { v: h.thr||"·", c: "#C0392B" },
                  { v: (net(h)>0?"+":"")+net(h), c: net(h)>0?GREEN:net(h)<0?"#C0392B":GREY },
                ].map((cell, ci) => (
                  <td key={ci} style={{ padding:"5px 5px", textAlign:"center", background:bg, fontWeight:700, color:cell.c }} className="mono">{cell.v}</td>
                ))}
                <td style={{ padding:"5px 5px", background:bg }}>
                  <span className="pill" style={{ background:q.color+"22", color:q.color, fontSize:10 }}>{q.name}</span>
                </td>
                <td style={{ padding:"5px 5px", background:bg, whiteSpace:"nowrap" }}>
                  <button onClick={e=>{e.stopPropagation();onScore(i);}} disabled={!!busyIdx}
                    title="Score with GPT-5.4" style={{ border:"none",background:"none",cursor:"pointer",color:PURPLE,fontSize:13,opacity:busyIdx===i?0.5:1 }}>
                    {busyIdx===i?"…":"⚡"}
                  </button>
                  <button onClick={e=>{e.stopPropagation();onDelete(i);}}
                    style={{ border:"none",background:"none",cursor:"pointer",color:"#ccc",fontSize:13 }}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BmkTable({ benchmark, sel, setSel, updB, onDelete }) {
  return (
    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
      <thead>
        <tr style={{ borderBottom:"2px solid "+INK }}>
          <th style={{ padding:"5px", textAlign:"left" }}>Name</th>
          <th style={{ padding:"5px", textAlign:"left" }}>Ticker</th>
          <th style={{ padding:"5px", textAlign:"right" }}>Wt %</th>
          <th/>
        </tr>
      </thead>
      <tbody>
        {benchmark.map((b, i) => (
          <tr key={i} className="row" onClick={() => setSel(i)}>
            <td style={{ padding:"5px", background:i===sel?"#f0efed":"transparent" }}>
              <input value={b.name} onChange={e=>{e.stopPropagation();updB(i,"name",e.target.value);}}
                onClick={e=>e.stopPropagation()}
                style={{ border:"none",background:"transparent",width:"100%",fontWeight:600,fontFamily:"Georgia,serif" }}/>
            </td>
            <td style={{ padding:"5px", background:i===sel?"#f0efed":"transparent" }}>
              <input value={b.ticker} onChange={e=>{e.stopPropagation();updB(i,"ticker",e.target.value);}}
                onClick={e=>e.stopPropagation()}
                style={{ border:"none",background:"transparent",width:"100%",fontFamily:"Courier New",fontSize:11 }}/>
            </td>
            <td style={{ padding:"5px", background:i===sel?"#f0efed":"transparent", textAlign:"right" }}>
              <input type="number" step="0.1" value={b.weight} onChange={e=>{e.stopPropagation();updB(i,"weight",parseFloat(e.target.value)||0);}}
                onClick={e=>e.stopPropagation()}
                style={{ border:"none",background:"transparent",width:55,textAlign:"right",fontFamily:"Courier New" }}/>
            </td>
            <td style={{ padding:"5px", background:i===sel?"#f0efed":"transparent" }}>
              <button onClick={e=>{e.stopPropagation();onDelete(i);}} style={{ border:"none",background:"none",cursor:"pointer",color:"#ccc" }}>✕</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScoreRow({ label, hint, color, value, onChange }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
        <span style={{ fontWeight:700, color }}>{label}</span>
        <span style={{ fontSize:10, color:"#999" }}>{hint}</span>
      </div>
      <div className="seg" style={{ marginTop:4 }}>
        {[1,2,3,4,5].map(n => (
          <button key={n} onClick={()=>onChange(n)}
            style={{ flex:1, background:value===n?color:"#fff", color:value===n?"#fff":INK, borderColor:value===n?color:"#ddd", fontWeight:700 }}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function Lbl({ children }) {
  return <div style={{ fontFamily:"'Courier New',monospace", fontSize:9, letterSpacing:1, color:GREY, textTransform:"uppercase", marginBottom:4 }}>{children}</div>;
}
