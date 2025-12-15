
import { EapEstimator } from "./js/engine/eap.js";
import { CatSubtest } from "./js/engine/cat.js";
import { ExposureStore } from "./js/engine/exposure.js";
import { formatSeconds, safeJsonDownload, nowMs } from "./js/engine/utils.js";
import { buildReport } from "./js/engine/scoring.js";
import { renderItem } from "./js/render/itemRenderer.js";
import { SessionStore } from "./js/research/sessionStore.js";
import { FormManager } from "./js/research/forms.js";
import { ItemExclusionStore } from "./js/research/itemExclusions.js";
import { exportLongCsv } from "./js/research/exportCsv.js";
import { mhDif } from "./js/research/dif.js";
import { buildIrtPackage } from "./js/research/irtTemplates.js";
import { initIntegrityMonitors } from "./js/research/integrity.js";
import { downloadJson, downloadJsonl } from "./js/research/export.js";

const screens = {
  intro: document.getElementById("screenIntro"),
  welcome: document.getElementById("screenWelcome"),
  practice: document.getElementById("screenPractice"),
  test: document.getElementById("screenTest"),
  report: document.getElementById("screenReport")
};

const statusPill = document.getElementById("statusPill");
const ageInput = document.getElementById("ageInput");
const btnDeviceCheck = document.getElementById("btnDeviceCheck");
const deviceCheckResult = document.getElementById("deviceCheckResult");

const btnIntroStart = document.getElementById("btnIntroStart");
const btnStart = document.getElementById("btnStart");
const btnPractice = document.getElementById("btnPractice");
const btnPracticeBack = document.getElementById("btnPracticeBack");
const btnPracticeDone = document.getElementById("btnPracticeDone");
const practiceArea = document.getElementById("practiceArea");

const btnQuit = document.getElementById("btnQuit");
const btnSubmit = document.getElementById("btnSubmit");
const btnRestart = document.getElementById("btnRestart");
const btnExport = document.getElementById("btnExport");

const kickerDomain = document.getElementById("kickerDomain");
const testTitle = document.getElementById("testTitle");
const itemArea = document.getElementById("itemArea");
const itemCount = document.getElementById("itemCount");
const semReadout = document.getElementById("semReadout");
const timeReadout = document.getElementById("timeReadout");
const integrityNote = document.getElementById("integrityNote");
const reportArea = document.getElementById("reportArea");

const btnFullscreen = document.getElementById("btnFullscreen");
const btnExportSessions = document.getElementById("btnExportSessions");
const btnClearSessions = document.getElementById("btnClearSessions");
const btnExportLongCsv = document.getElementById("btnExportLongCsv");
const btnDifExplorer = document.getElementById("btnDifExplorer");
const btnExportIrtPackage = document.getElementById("btnExportIrtPackage");
const consentCheck = document.getElementById("consentCheck");
const sessionInfo = document.getElementById("sessionInfo");
const btnMenu = document.getElementById("btnMenu");
const btnMenuClose = document.getElementById("btnMenuClose");
const menuPanel = document.getElementById("menuPanel");

const participantIdInput = document.getElementById("participantId");
const groupAInput = document.getElementById("groupA");
const groupBInput = document.getElementById("groupB");
const groupCInput = document.getElementById("groupC");

const estimator = new EapEstimator({ gridMin: -4, gridMax: 4, step: 0.1 });
const exposure = new ExposureStore();
const sessions = new SessionStore();
const exclusions = new ItemExclusionStore();

let activeSessionId = null;
let controller = null;
let itembank = null;
let formsMeta = null;

boot();

async function boot(){
  setStatus("Loading...");

  const [ib, fm] = await Promise.all([
    fetch("./js/data/itembank.json").then(r => r.json()),
    fetch("./js/data/forms.json").then(r => r.json()).catch(() => null)
  ]);
  itembank = ib;
  formsMeta = fm;

  setStatus("Ready");

  wireUi();
  updateSessionInfo();
  showIntro();
}

function wireUi(){
  btnIntroStart?.addEventListener("click", showWelcome);
  btnDeviceCheck.addEventListener("click", runTimingCheck);
  btnPractice.addEventListener("click", showPractice);
  btnPracticeBack.addEventListener("click", showWelcome);
  btnPracticeDone.addEventListener("click", showWelcome);

  btnStart.addEventListener("click", startAssessment);
  btnQuit.addEventListener("click", () => {
    controller?.abort("User quit");
    showWelcome();
  });
  btnSubmit.addEventListener("click", () => controller?.submit());
  btnRestart.addEventListener("click", () => {
    controller?.abort("Restart");
    controller = null;
    showWelcome();
  });
  btnExport.addEventListener("click", exportReportAndSession);

  btnFullscreen.addEventListener("click", async () => {
    try{ await document.documentElement.requestFullscreen?.(); }catch{}
  });
  btnExportSessions.addEventListener("click", () => {
    const all = sessions.exportAll();
    downloadJson("chc-cat-sessions.json", all);
  });
  btnExportLongCsv.addEventListener("click", () => {
    const all = sessions.exportAll();
    exportLongCsv({ sessionsState: all, filename: "chc-cat-long.csv" });
  });
  btnExportIrtPackage.addEventListener("click", () => {
    const all = sessions.exportAll();
    const pkg = buildIrtPackage({ sessionsState: all, itembank, formsMeta });
    for (const f of pkg.files){
      const blob = new Blob([f.content], { type: f.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
  });
  btnDifExplorer.addEventListener("click", () => {
    showScreen("report");
    setStatus("DIF explorer");
    renderDifExplorer();
  });
  btnClearSessions.addEventListener("click", () => {
    sessions.clear();
    exclusions.clear?.();
    updateSessionInfo();
  });
  btnMenu?.addEventListener("click", () => menuPanel?.classList.toggle("hidden"));
  btnMenuClose?.addEventListener("click", () => menuPanel?.classList.add("hidden"));
}

function setStatus(text){
  statusPill.textContent = text;
}

function showScreen(name){
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name]?.classList.remove("hidden");
}

function showIntro(){
  showScreen("intro");
  setStatus("Welcome");
}

function showWelcome(){
  showScreen("welcome");
  setStatus("Ready");
}

function showPractice(){
  showScreen("practice");
  setStatus("Practice");
  renderPractice();
}

function updateSessionInfo(){
  const recent = sessions.list({ limit: 1 })[0];
  if (!recent){
    sessionInfo.textContent = "No saved sessions in this browser.";
    return;
  }
  sessionInfo.textContent = `Last session: ${recent.id} ? ${recent.completed ? "completed" : "incomplete"} ? ${recent.createdAt}`;
}

function renderPractice(){
  practiceArea.innerHTML = "";
  const p = document.createElement("div");
  p.className = "callout";
  p.innerHTML = `
    <strong>How practice works</strong>
    <p class="muted">
      Tap/click an option to select it, then submit.
      Some blocks (working memory and speed) run as short timed trials and then unlock submit.
      Use ArrowLeft/ArrowRight for block responses.
    </p>
  `;
  practiceArea.appendChild(p);

  const item1 = {
    id: "PRACTICE-1",
    domain: "Practice",
    family: "mc",
    model: "2PL",
    a: 1, b: 0,
    stem: { type: "numeric_sequence", prompt: "Practice: choose the next value.", sequence: [2, 4, 6, 8] },
    options: [10, 12, 9, 14],
    key: 0
  };

  const item2 = {
    id: "PRACTICE-2",
    domain: "Practice",
    family: "block",
    model: "2PL",
    a: 1, b: 0,
    stem: { type: "symbol_search_block", prompt: "Practice block: respond present/absent.", length: 6, setSize: 4, trialMs: 1400 },
    options: ["Present", "Absent"],
    key: null
  };

  const list = [item1, item2];
  let idx = 0;

  const holder = document.createElement("div");
  practiceArea.appendChild(holder);

  const actions = document.createElement("div");
  actions.className = "actions";
  actions.innerHTML = `<button class="btn secondary" id="prevP">Prev</button><button class="btn primary" id="nextP" disabled>Next</button>`;
  practiceArea.appendChild(actions);

  const prev = actions.querySelector("#prevP");
  const next = actions.querySelector("#nextP");

  let currentRenderer = null;

  function draw(){
    holder.innerHTML = "";
    next.disabled = true;
    currentRenderer?.cleanup?.();

    currentRenderer = renderItem({
      mount: holder,
      item: list[idx],
      onSelectionChanged: () => { next.disabled = false; }
    });
  }

  prev.addEventListener("click", () => { if (idx > 0){ idx--; draw(); } });
  next.addEventListener("click", () => { if (idx < list.length - 1){ idx++; draw(); } else { showWelcome(); } });

  draw();
}

async function runTimingCheck(){
  deviceCheckResult.textContent = "Running...";
  setStatus("Timing check");

  const samples = [];
  let last = performance.now();
  for (let i = 0; i < 60; i++){
    await new Promise(requestAnimationFrame);
    const t = performance.now();
    samples.push(t - last);
    last = t;
  }

  samples.sort((a,b)=>a-b);
  const p50 = samples[Math.floor(samples.length * 0.50)];
  const p90 = samples[Math.floor(samples.length * 0.90)];
  const worst = samples[samples.length - 1];

  deviceCheckResult.textContent = `Frame interval median ${p50.toFixed(2)}ms, p90 ${p90.toFixed(2)}ms, worst ${worst.toFixed(2)}ms.`;
  setStatus("Ready");
}

function getSelectedMode(){
  const el = document.querySelector('input[name="mode"]:checked');
  return el ? el.value : "standard";
}

function startAssessment(){
  if (!itembank){
    alert("Item bank not loaded yet.");
    return;
  }

  const mode = getSelectedMode();
  const ageYears = Number(ageInput.value || 25);

  if ((mode === "fieldtest" || mode === "norming") && !consentCheck.checked){
    alert("Consent is required for Field-test / Norming modes.");
    return;
  }

  const participantId = (participantIdInput?.value ?? "").trim();
  const groupA = (groupAInput?.value ?? "").trim();
  const groupB = (groupBInput?.value ?? "").trim();
  const groupC = (groupCInput?.value ?? "").trim();

  activeSessionId = sessions.createSession({
    mode,
    ageYears,
    participantId: participantId || null,
    groupA: groupA || null,
    groupB: groupB || null,
    groupC: groupC || null,
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screen: { w: window.screen.width, h: window.screen.height, dpr: window.devicePixelRatio },
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deviceType: (window.matchMedia("(max-width: 820px)").matches ? "mobile" : "desktop")
  });

  const seed = participantId || activeSessionId;
  const fm = new FormManager(formsMeta);
  const formId = fm.assignForm(seed) ?? "A";
  const sess = sessions.get(activeSessionId);
  if (sess){ sess.meta.formId = formId; }
  sessions.appendEvent(activeSessionId, { type: "FORM_ASSIGNED", payload: { formId } });

  controller = new AssessmentController({
    itembank,
    estimator,
    exposure,
    ageYears,
    mode,
    sessions,
    sessionId: activeSessionId,
    formId,
    formManager: fm,
    exclusions
  });

  controller.start();
}

function exportReportAndSession(){
  if (!controller?.finalReport) return;
  safeJsonDownload("chc-cat-report.json", controller.finalReport);
  if (activeSessionId){
    const s = sessions.exportSession(activeSessionId);
    safeJsonDownload(`chc-cat-session-${activeSessionId}.json`, s);
  }
}

class AssessmentController{
  constructor({ itembank, estimator, exposure, ageYears, mode, sessions, sessionId, formId, formManager, exclusions }){
    this.itembank = itembank;
    this.estimator = estimator;
    this.exposure = exposure;
    this.ageYears = ageYears;
    this.mode = mode ?? "standard";
    this.sessions = sessions;
    this.sessionId = sessionId;
    this.formId = formId;
    this.formManager = formManager;
    this.exclusions = exclusions;

    this.integrityMon = initIntegrityMonitors({ store: this.sessions, sessionId: this.sessionId });
    this.integrity = this.integrityMon.integrity;

    this.domains = ["Gf","Gv","Gq","Gwm","Gs","Gc"];

    this.sessions?.appendEvent(this.sessionId, { type: "ITEMBANK_FILTER", payload: { formId: this.formId } });
    this.subtests = {};
    this.domainIndex = 0;

    this.currentSubtest = null;
    this.currentItem = null;
    this.currentRenderer = null;

    this.startedMs = 0;
    this.timerHandle = null;
    this.finalReport = null;
  }

  start(){
    this.startedMs = nowMs();
    this._buildSubtests();
    this.domainIndex = 0;

    showScreen("test");
    setStatus("Testing");
    integrityNote.textContent = "";
    this._startTimer();
    this._startDomain(this.domains[this.domainIndex]);
  }

  abort(reason){
    this._stopTimer();
    this.integrityMon?.stop?.();
    this.sessions?.appendEvent(this.sessionId, { type: "ABORT", payload: { reason } });
    setStatus("Ready");
  }

  _buildSubtests(){
    const itemsByDomain = {};
    for (const d of this.itembank.domains){
      itemsByDomain[d] = this.itembank.items.filter(it => it.domain === d);
    }

    const config = makeCatConfig();
    const excludedIds = Array.from(this.exclusions?.getExcludedIds?.() ?? []);

    for (const d of this.domains){
      const st = new CatSubtest({
        domain: d,
        items: itemsByDomain[d],
        estimator: this.estimator,
        exposureStore: this.exposure,
        config,
        allowedItemIds: this.formManager?.getAllowedItemIds(this.formId, d) ?? null,
        excludedItemIds: excludedIds,
        anchorItemIds: this.formManager?.getAnchorIds(this.formId, d) ?? [],
        anchorPolicy: {
          targetProp: config.anchorTargetProp?.[d] ?? 0.22,
          minAnchors: config.anchorMin?.[d] ?? 2,
          maxAnchors: config.anchorMax?.[d] ?? 6,
          avoidFirstTwo: !!(config.anchorAvoidFirstTwo?.[d] ?? true)
        },
        anchorMiniBlockN: config.anchorMiniBlockN?.[d] ?? 0
      });
      st.start();
      this.subtests[d] = st;
    }
  }

  _startDomain(domain){
    this.currentSubtest = this.subtests[domain];
    this.currentItem = null;

    this._renderNextItem();
  }

  _renderNextItem(){
    btnSubmit.disabled = true;

    this.currentRenderer?.cleanup?.();
    itemArea.innerHTML = "";

    const item = this.currentSubtest.pickNextItem();
    if (!item){
      this._finishDomain();
      return;
    }

    this.currentItem = item;

    kickerDomain.textContent = `${item.domain} ? ${domainLabel(item.domain)}`;
    testTitle.textContent = familyLabel(item.domain, item.family);

    itemCount.textContent = String(this.currentSubtest.responses.length + 1);
    semReadout.textContent = this.currentSubtest.responses.length ? this.currentSubtest.sem.toFixed(3) : "?";

    this.currentRenderer = renderItem({
      mount: itemArea,
      item,
      onSelectionChanged: () => {
        btnSubmit.disabled = false;
      }
    });
  }

  submit(){
    const r = this.currentRenderer?.getResponse();
    if (!r) return;

    if (!["n_back_block","symbol_search_block","coding_block"].includes(this.currentItem.stem.type)){
      this.integrityMon.addRapidGuess(r.rtMs);
      if ((this.integrity.rapidGuessingCount ?? 0) >= 3){
        integrityNote.textContent = "Integrity note: rapid responding detected. Scores may be less interpretable.";
      }
    }

    const est = this.currentSubtest.recordResponse({
      item: this.currentItem,
      x: r.x,
      rtMs: r.rtMs,
      meta: r.meta
    });

    const anchorFlag = this.currentSubtest.isAnchor(this.currentItem.id);

    this.sessions?.appendEvent(this.sessionId, {
      type: "ITEM_RESPONSE",
      payload: {
        domain: this.currentItem.domain,
        family: this.currentItem.family,
        itemId: this.currentItem.id,
        anchor: anchorFlag,
        model: this.currentItem.model,
        a: this.currentItem.a,
        b: this.currentItem.b,
        c: this.currentItem.c ?? null,
        x: r.x,
        rtMs: r.rtMs,
        thetaAfter: this.currentSubtest.theta,
        semAfter: this.currentSubtest.sem,
        meta: r.meta
      }
    });

    semReadout.textContent = this.currentSubtest.sem.toFixed(3);

    if (this.currentSubtest.shouldStop()){
      this._finishDomain();
      return;
    }

    this._renderNextItem();
  }

  _finishDomain(){
    this.currentRenderer?.cleanup?.();
    this.currentRenderer = null;

    this.domainIndex += 1;
    if (this.domainIndex >= this.domains.length){
      this._finishAll();
      return;
    }

    this._flashDomainComplete(this.domains[this.domainIndex - 1], () => {
      this._startDomain(this.domains[this.domainIndex]);
    });
  }

  _finishAll(){
    this._stopTimer();
    this.integrityMon?.stop?.();

    const summaries = this.domains.map(d => this.subtests[d].summary());

    this.sessions?.appendEvent(this.sessionId, { type: "SUBTEST_SUMMARIES", payload: { summaries } });

    this.finalReport = buildReport({
      ageYears: this.ageYears,
      subtestSummaries: summaries,
      integrity: this.integrity
    });

    this.sessions?.appendEvent(this.sessionId, { type: "FINAL_REPORT", payload: this.finalReport });
    this.sessions?.markCompleted(this.sessionId);
    updateSessionInfo();

    if (this.mode === "fieldtest"){
      showScreen("report");
      setStatus("Complete");

      const sess = this.sessions?.exportSession(this.sessionId);
      reportArea.innerHTML = `
        <div class="callout">
          <strong>Session complete (Field-test mode)</strong>
          <p class="muted">
            Scores are intentionally hidden in Field-test mode. Use the export controls to download the session data for calibration/norming.
          </p>
          <div class="divider"></div>
          <div class="actions" style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn primary" id="btnExportSessionJson">Export session (JSON)</button>
            <button class="btn secondary" id="btnExportSessionJsonl">Export events (JSONL)</button>
          </div>
        </div>
      `;

      const btnJ = document.getElementById("btnExportSessionJson");
      const btnL = document.getElementById("btnExportSessionJsonl");

      btnJ?.addEventListener("click", () => {
        downloadJson(`chc-cat-session-${this.sessionId}.json`, sess);
      });

      btnL?.addEventListener("click", () => {
        downloadJsonl(`chc-cat-events-${this.sessionId}.jsonl`, sess?.events ?? []);
      });

      return;
    }

    showScreen("report");
    setStatus("Report");
    renderReport(this.finalReport);
  }

  _flashDomainComplete(domain, onContinue){
    itemArea.innerHTML = "";
    btnSubmit.disabled = true;

    const box = document.createElement("div");
    box.className = "callout";
    const st = this.subtests[domain];
    box.innerHTML = `
      <strong>${domain} complete</strong>
      <p class="muted">Items: ${st.responses.length} ? ? = ${st.theta.toFixed(3)} ? SEM = ${st.sem.toFixed(3)}</p>
      <div class="actions">
        <button class="btn primary" id="btnContinue">Continue</button>
      </div>
    `;
    itemArea.appendChild(box);

    box.querySelector("#btnContinue").addEventListener("click", onContinue);
  }

  _startTimer(){
    this._stopTimer();
    this.timerHandle = setInterval(() => {
      const sec = (nowMs() - this.startedMs) / 1000;
      timeReadout.textContent = formatSeconds(sec);
    }, 100);
  }

  _stopTimer(){
    if (this.timerHandle){
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}

function renderReport(report){
  const r = report.results;

  const domRows = Object.entries(r.domainIndices).map(([d, idx]) => {
    const p = r.domainPercentiles[d];
    const ci = r.domainCI95[d];
    return `
      <tr>
        <td><strong>${d}</strong> <span class="muted small">${domainLabel(d)}</span></td>
        <td>${idx.toFixed(1)}</td>
        <td>${p.toFixed(1)}%</td>
        <td>${ci.lo.toFixed(1)} ? ${ci.hi.toFixed(1)}</td>
      </tr>
    `;
  }).join("");

  const badge = integrityBadge(report.integrity);

  reportArea.innerHTML = `
    <div class="reportGrid">
      <div class="callout">
        <div class="muted small">Full Scale (demo)</div>
        <div style="font-size:44px;font-weight:900;margin-top:4px">${r.fsiq.toFixed(1)}</div>
        <div class="muted">Percentile: ${r.fsiqPercentile.toFixed(1)}% ? 95% CI: ${r.fsiqCI95.lo.toFixed(1)} ? ${r.fsiqCI95.hi.toFixed(1)}</div>
        <div class="divider"></div>
        <div class="muted small">Interpretability</div>
        <div style="margin-top:8px">${badge}</div>
        <div class="muted small" style="margin-top:10px">${escapeHtml(report.integrity.note ?? "")}</div>
      </div>

      <div class="callout">
        <div class="muted small">Session</div>
        <div style="margin-top:8px">
          <div class="badge">Age: ${report.meta.ageYears ?? "-"}</div>
          <div class="badge">Generated: ${escapeHtml(report.meta.generatedAt)}</div>
        </div>
        <div class="divider"></div>
        <div class="muted small">Integrity flags</div>
        <div style="margin-top:8px">${renderFlags(report.integrity)}</div>
      </div>
    </div>

    <div class="divider"></div>

    <table class="table">
      <thead>
        <tr>
          <th>Index</th>
          <th>Score</th>
          <th>Percentile</th>
          <th>95% CI</th>
        </tr>
      </thead>
      <tbody>
        ${domRows}
      </tbody>
    </table>

    <div class="divider"></div>

    <div class="callout">
      <strong>Next steps to make this defensible</strong>
      <ul class="bullets">
        <li>Expand item banks (~250?400+ per domain) and run full IRT calibration.</li>
        <li>Collect large-scale norms (N ? 50,000) with stratified sampling and continuous norming.</li>
        <li>Run DIF analyses across language/device/SES proxies and remove biased items.</li>
        <li>Validate against external criteria and assess test?retest reliability.</li>
      </ul>
    </div>
  `;
}

function renderFlags(integrity){
  const flags = integrity.flags ?? [];
  if (!flags.length){
    return `<span class="badge good">No flags</span>`;
  }
  const items = flags.slice(0,8).map(f => `<div class="badge warn">${escapeHtml(f.type)}</div>`).join(" ");
  return items;
}

function integrityBadge(integrity){
  const flags = integrity.flags ?? [];
  const v = integrity.visibilityChanges ?? 0;
  const rg = integrity.rapidGuessingCount ?? 0;

  if (flags.length === 0){
    return `<span class="badge good">Good</span>`;
  }
  if (v >= 3 || rg >= 5){
    return `<span class="badge bad">Low</span>`;
  }
  return `<span class="badge warn">Moderate</span>`;
}

function domainLabel(d){
  const map = {
    "Gf": "Fluid Reasoning",
    "Gc": "Crystallized (Controlled Verbal) Reasoning",
    "Gv": "Visual-Spatial Processing",
    "Gq": "Quantitative Reasoning",
    "Gwm": "Working Memory",
    "Gs": "Processing Speed"
  };
  return map[d] ?? d;
}

function familyLabel(domain, family){
  const map = {
    "Gf": {
      "rule_induction": "Rule Induction (Analogy Panels)",
      "matrix_reasoning": "Matrix Reasoning",
      "series_completion": "Series Completion"
    },
    "Gv": {
      "mental_rotation": "Mental Rotation",
      "mirror_discrimination": "Mirror Discrimination"
    },
    "Gq": {
      "number_pattern": "Number Pattern Induction",
      "ratio_reasoning": "Ratio / Proportion Reasoning"
    },
    "Gc": {
      "logical_inference": "Logical Inference",
      "controlled_analogy": "Controlled Analogy"
    },
    "Gwm": {
      "n_back_block": "N-back Working Memory Block"
    },
    "Gs": {
      "symbol_search_block": "Symbol Search Speed Block",
      "coding_block": "Coding Speed Block"
    }
  };
  return map[domain]?.[family] ?? `${domain} ? ${family}`;
}

function makeCatConfig(){
  return {
    semThreshold: {
      "Gf": 0.30,
      "Gv": 0.30,
      "Gq": 0.30,
      "Gc": 0.38,
      "Gwm": 0.42,
      "Gs": 0.42
    },
    minItems: { "Gf": 10, "Gv": 10, "Gq": 10, "Gc": 10, "Gwm": 8, "Gs": 8 },
    maxItems: { "Gf": 18, "Gv": 18, "Gq": 18, "Gc": 18, "Gwm": 12, "Gs": 12 },
    maxExposurePerItem: 50,
    topK: 5,
    anchorMiniBlockN: { "Gf": 3, "Gv": 3, "Gq": 3, "Gc": 3, "Gwm": 2, "Gs": 2 },
    anchorTargetProp: { "Gf": 0.22, "Gv": 0.22, "Gq": 0.22, "Gc": 0.22, "Gwm": 0.18, "Gs": 0.18 },
    anchorMin: { "Gf": 2, "Gv": 2, "Gq": 2, "Gc": 2, "Gwm": 1, "Gs": 1 },
    anchorMax: { "Gf": 6, "Gv": 6, "Gq": 6, "Gc": 6, "Gwm": 4, "Gs": 4 },
    anchorAvoidFirstTwo: { "Gf": true, "Gv": true, "Gq": true, "Gc": true, "Gwm": false, "Gs": false },
    familyTargets: {
      "Gf": { "matrix_reasoning": 0.55, "series_completion": 0.45 },
      "Gv": { "mental_rotation": 0.60, "mirror_discrimination": 0.40 },
      "Gq": { "number_pattern": 0.60, "ratio_reasoning": 0.40 },
      "Gc": { "logical_inference": 0.55, "controlled_analogy": 0.45 },
      "Gwm": { "n_back_block": 1.0 },
      "Gs": { "symbol_search_block": 0.60, "coding_block": 0.40 }
    }
  };
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function renderDifExplorer(){
  const state = sessions.exportAll();
  const sess = Object.values(state.sessions ?? {}).filter(s => s.completed);

  if (!sess.length){
    reportArea.innerHTML = `<div class="callout"><strong>No completed sessions.</strong><p class="muted">Run a few field-test/norming sessions first, then export and analyze DIF.</p></div>`;
    return;
  }

  const rows = [];
  for (const s of sess){
    const meta = s.meta ?? {};
    const personId = meta.participantId ?? s.id;
    const responses = (s.events ?? []).filter(e => e.type === "ITEM_RESPONSE").map(e => e.payload);
    const byDomain = {};
    for (const r of responses){
      byDomain[r.domain] = byDomain[r.domain] ?? { sum: 0, n: 0 };
      byDomain[r.domain].sum += (r.x === 1 ? 1 : 0);
      byDomain[r.domain].n += 1;
    }
    for (const r of responses){
      const scoreProxy = byDomain[r.domain]?.sum ?? 0;
      rows.push({
        sessionId: s.id,
        personId,
        domain: r.domain,
        itemId: r.itemId,
        x: r.x,
        scoreProxy,
        groupA: meta.groupA ?? "",
        groupB: meta.groupB ?? "",
        groupC: meta.groupC ?? ""
      });
    }
  }

  const groups = inferGroupLevels(sess);
  reportArea.innerHTML = `
    <div class="callout">
      <strong>DIF explorer (MH screening)</strong>
      <p class="muted">
        Computes Mantel?Haenszel DIF deltas within each domain using local completed sessions. This is a screening tool only.
      </p>
      <div class="divider"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">
        <div>
          <div class="muted small">Grouping variable</div>
          <select id="difVar" class="input">
            <option value="groupA">Group A</option>
            <option value="groupB">Group B</option>
            <option value="groupC">Group C</option>
          </select>
        </div>
        <div>
          <div class="muted small">Reference level</div>
          <select id="difRef" class="input"></select>
        </div>
        <div>
          <div class="muted small">Focal level</div>
          <select id="difFocal" class="input"></select>
        </div>
        <div>
          <div class="muted small">Domain</div>
          <select id="difDomain" class="input">
            <option>Gf</option><option>Gv</option><option>Gq</option><option>Gc</option><option>Gwm</option><option>Gs</option>
          </select>
        </div>
        <button class="btn primary" id="btnRunDif">Run DIF</button>
        <button class="btn secondary" id="btnExportLong">Export long CSV</button>
      </div>
      <div class="divider"></div>
      <div id="difOut"></div>
    </div>
  `;

  const selVar = document.getElementById("difVar");
  const selRef = document.getElementById("difRef");
  const selFocal = document.getElementById("difFocal");
  const selDomain = document.getElementById("difDomain");
  const out = document.getElementById("difOut");
  const btn = document.getElementById("btnRunDif");
  const btnExp = document.getElementById("btnExportLong");

  function fillLevels(){
    const v = selVar.value;
    const levels = groups[v] ?? [];
    selRef.innerHTML = levels.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
    selFocal.innerHTML = levels.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
    if (levels.length >= 2){
      selRef.value = levels[0];
      selFocal.value = levels[1];
    }
  }

  selVar.addEventListener("change", fillLevels);
  fillLevels();

  btnExp.addEventListener("click", () => {
    exportLongCsv({ sessionsState: state, filename: "chc-cat-long.csv" });
  });

  btn.addEventListener("click", () => {
    const v = selVar.value;
    const refLevel = selRef.value;
    const focalLevel = selFocal.value;
    const domain = selDomain.value;

    const domainRows = rows.filter(r => r.domain === domain && (r[v] ?? "") !== "");
    const res = mhDif({
      rows: domainRows,
      strata: 10,
      refFilter: r => r[v] === refLevel,
      focalFilter: r => r[v] === focalLevel
    });

    const top = res.items.slice(0, 30);
    out.innerHTML = `
      <div class="muted small">${escapeHtml(res.note)} ? N(ref)=${top[0]?.nRef ?? 0} ? N(focal)=${top[0]?.nFocal ?? 0}</div>
      <div class="divider"></div>
      <div style="overflow:auto">
        <table class="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>?MH</th>
              <th>?MH</th>
              <th>Flag</th>
              <th>Ref N</th>
              <th>Focal N</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${top.map(r => `
              <tr>
                <td>${escapeHtml(r.itemId)}</td>
                <td>${r.deltaMH.toFixed(3)}</td>
                <td>${r.alphaMH.toFixed(3)}</td>
                <td>${escapeHtml(r.flag)}</td>
                <td>${r.nRef}</td>
                <td>${r.nFocal}</td>
                <td>
                  <button class="btn secondary btnTiny" data-excl="${escapeHtml(r.itemId)}">Exclude locally</button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <div class="muted small" style="margin-top:10px">
        Excluding items here only affects this browser (local exclusion store). For real DIF decisions, confirm with larger samples + logistic regression DIF / IRT DIF.
      </div>
    `;

    out.querySelectorAll("[data-excl]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-excl");
        exclusions.exclude(id, `MH_${v}:${refLevel}_vs_${focalLevel}`);
        btn.textContent = "Excluded";
        btn.disabled = true;
      });
    });
  });
}

function inferGroupLevels(sessionsList){
  const levels = { groupA: new Set(), groupB: new Set(), groupC: new Set() };
  for (const s of sessionsList){
    const m = s.meta ?? {};
    if (m.groupA) levels.groupA.add(m.groupA);
    if (m.groupB) levels.groupB.add(m.groupB);
    if (m.groupC) levels.groupC.add(m.groupC);
  }
  return {
    groupA: [...levels.groupA].sort(),
    groupB: [...levels.groupB].sort(),
    groupC: [...levels.groupC].sort()
  };
}
