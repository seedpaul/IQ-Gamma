import { symbolToSvg, renderSymbolGrid } from "./symbols.js";
import { nowMs, clamp } from "../engine/utils.js";

export function renderItem({ mount, item, onSelectionChanged }){
  mount.innerHTML = "";
  const t0 = nowMs();

  let selectedIndex = null;
  let blockResult = null;
  let cleanupFn = null;

  const prompt = document.createElement("div");
  prompt.className = "itemPrompt";
  prompt.textContent = item.stem?.prompt ?? "Select an option.";
  mount.appendChild(prompt);

  const stim = document.createElement("div");
  mount.appendChild(stim);

  // -------- Nonverbal / visual stems --------

  if (item.stem.type === "analogy_panels"){
    stim.appendChild(canvasBox((c, ctx) => drawFourPanels(ctx, c, item.stem.panels), 840, 280));
  }

  if (item.stem.type === "matrix_3x3"){
    stim.appendChild(canvasBox((c, ctx) => drawMatrix3x3(ctx, c, item.stem.grid), 840, 380));
  }

  if (item.stem.type === "series_panels"){
    stim.appendChild(canvasBox((c, ctx) => drawSeries(ctx, c, item.stem.panels), 840, 220));
  }

  if (item.stem.type === "rotation_match" || item.stem.type === "mirror_match"){
    const grid = document.createElement("div");
    grid.className = "grid2";

    const left = document.createElement("div");
    left.innerHTML = `<div class="muted small">Target</div>${symbolToSvg(item.stem.target, 110)}`;

    const right = document.createElement("div");
    right.innerHTML = `<div class="muted small">${item.stem.type === "mirror_match" ? "Mirror match" : "Rotate match"}</div>`;

    grid.appendChild(left);
    grid.appendChild(right);
    stim.appendChild(grid);
  }

  // -------- Quantitative / verbal-low-load stems --------

  if (item.stem.type === "numeric_sequence"){
    const seq = item.stem.sequence.join("  •  ") + "  •  ?";
    stim.appendChild(textBox("Sequence", seq, 18));
  }

  if (item.stem.type === "ratio_compare"){
    const html = `
      <div class="muted small">Target</div>
      <div style="font-size:22px;margin-top:6px"><strong>${escapeHtml(item.stem.target)}</strong></div>
      <div class="muted small" style="margin-top:10px">Choose the closest option.</div>
    `;
    stim.appendChild(htmlBox(html));
  }

  if (item.stem.type === "logic_inference"){
    const html = `
      <div class="muted small">Premises</div>
      <div style="margin-top:6px">${escapeHtml(item.stem.premises)}</div>
      <div class="divider"></div>
      <div class="muted small">Conclusion</div>
      <div style="margin-top:6px"><strong>${escapeHtml(item.stem.conclusion)}</strong></div>
    `;
    stim.appendChild(htmlBox(html));
  }

  if (item.stem.type === "verbal_analogy"){
    const html = `
      <div class="muted small">Analogy</div>
      <div style="margin-top:8px;font-size:18px">
        <strong>${escapeHtml(item.stem.a1)}</strong> : <strong>${escapeHtml(item.stem.b1)}</strong>
        &nbsp; :: &nbsp;
        <strong>${escapeHtml(item.stem.a2)}</strong> : <strong>?</strong>
      </div>
      <div class="muted small" style="margin-top:10px">Choose the best completion.</div>
    `;
    stim.appendChild(htmlBox(html));
  }

  // -------- Block tasks --------

  if (item.stem.type === "n_back_block"){
    const block = renderNBackBlock(stim, item.stem, (result) => {
      blockResult = result;
      onSelectionChanged?.(true);
    });
    cleanupFn = block.cleanup;
  }

  if (item.stem.type === "symbol_search_block"){
    const block = renderSymbolSearchBlock(stim, item.stem, (result) => {
      blockResult = result;
      onSelectionChanged?.(true);
    });
    cleanupFn = block.cleanup;
  }

  if (item.stem.type === "coding_block"){
    const block = renderCodingBlock(stim, { ...item.stem, options: item.options }, (result) => {
      blockResult = result;
      onSelectionChanged?.(true);
    });
    cleanupFn = block.cleanup;
  }

  // -------- Options (MC only) --------

  const isBlock = ["n_back_block","symbol_search_block","coding_block"].includes(item.stem.type);

  if (!isBlock){
    const opts = document.createElement("div");
    opts.className = "options";

    item.options.forEach((opt, idx) => {
      const el = document.createElement("div");
      el.className = "option";
      el.dataset.index = String(idx);

      if (typeof opt === "object"){
        el.innerHTML = symbolToSvg(opt, 92);
      }else{
        el.textContent = String(opt);
      }

      el.addEventListener("click", () => {
        selectedIndex = idx;
        [...opts.querySelectorAll(".option")].forEach(x => x.classList.remove("selected"));
        el.classList.add("selected");
        onSelectionChanged?.(true);
      });

      opts.appendChild(el);
    });

    mount.appendChild(opts);
  }

  return {
    getResponse(){
      const rtMs = Math.max(0, nowMs() - t0);

      if (isBlock){
        if (!blockResult) return null;
        const x = scoreBlockToBinary(item, blockResult);
        return { x, rtMs, meta: { ...blockResult, criterion: blockCriterion(item) } };
      }

      if (selectedIndex === null) return null;
      const x = (selectedIndex === item.key) ? 1 : 0;
      return { x, rtMs, meta: { selectedIndex } };
    },
    cleanup(){
      cleanupFn?.();
    }
  };
}

/* ----------------- Helpers ----------------- */

function canvasBox(drawFn, w, h){
  const wrap = document.createElement("div");
  wrap.className = "canvasWrap";
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  wrap.appendChild(c);
  const ctx = c.getContext("2d");
  drawFn(c, ctx);
  return wrap;
}

function htmlBox(innerHtml){
  const box = document.createElement("div");
  box.className = "callout";
  box.innerHTML = innerHtml;
  return box;
}

function textBox(label, text, fontSize=16){
  return htmlBox(`<div class="muted small">${escapeHtml(label)}</div><div style="font-size:${fontSize}px;margin-top:6px">${escapeHtml(text)}</div>`);
}

/* ----------------- Block scoring ----------------- */

function blockCriterion(item){
  const b = item.b ?? 0;
  return clamp(0.60 + 0.06 * b, 0.58, 0.86);
}

function scoreBlockToBinary(item, result){
  const criterion = blockCriterion(item);
  return (result.accuracy ?? 0) >= criterion ? 1 : 0;
}

/* ----------------- Blocks ----------------- */

function renderNBackBlock(mount, cfg, onDone){
  const state = { running:false, cancelled:false, index:0, trials:[], responses:[], lastStartMs:0 };

  const wrap = document.createElement("div");
  wrap.className = "callout";
  wrap.innerHTML = `
    <div class="muted small">N-back block</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
      <div class="badge">n = ${cfg.n}</div>
      <div class="badge">trials = ${cfg.length}</div>
      <div class="badge">stim = ${cfg.stimMs}ms</div>
      <div class="badge">gap = ${cfg.isiMs}ms</div>
    </div>
    <div class="divider"></div>
    <div id="nbArea"></div>
    <div class="divider"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn secondary" id="btnStartBlock">Start block</button>
      <button class="btn secondary" id="btnMatch" disabled>Match</button>
      <button class="btn secondary" id="btnNoMatch" disabled>No match</button>
      <span class="muted small" id="nbStatus">Not started.</span>
    </div>
  `;
  mount.appendChild(wrap);

  const area = wrap.querySelector("#nbArea");
  const btnStart = wrap.querySelector("#btnStartBlock");
  const btnM = wrap.querySelector("#btnMatch");
  const btnN = wrap.querySelector("#btnNoMatch");
  const status = wrap.querySelector("#nbStatus");

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "canvasWrap";
  const canvas = document.createElement("canvas");
  canvas.width = 560;
  canvas.height = 320;
  canvasWrap.appendChild(canvas);
  area.appendChild(canvasWrap);

  const ctx = canvas.getContext("2d");

  function genTrials(){
    const positions = [];
    for (let i = 0; i < cfg.length; i++){
      positions.push(Math.floor(Math.random() * 9));
    }
    const lureCount = Math.floor(cfg.length * (cfg.lureRate ?? 0.2));
    for (let k = 0; k < lureCount; k++){
      const i = Math.floor(Math.random() * (cfg.length - 3)) + 3;
      const lureType = Math.random() < 0.5 ? (cfg.n - 1) : (cfg.n + 1);
      if (lureType > 0 && i - lureType >= 0){
        positions[i] = positions[i - lureType];
      }
    }
    return positions.map((pos, i) => ({ i, pos, match: (i - cfg.n >= 0) ? (pos === positions[i - cfg.n]) : false }));
  }

  function drawPos(pos, show=true){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const pad = 50;
    const size = Math.min(canvas.width, canvas.height) - pad*2;
    const cell = size / 3;

    ctx.strokeStyle = "rgba(229,231,235,0.20)";
    ctx.lineWidth = 2;
    for (let r = 0; r < 3; r++){
      for (let c = 0; c < 3; c++){
        ctx.strokeRect(pad + c*cell, pad + r*cell, cell, cell);
      }
    }
    if (!show) return;

    const r = Math.floor(pos / 3);
    const c = pos % 3;

    ctx.fillStyle = "rgba(96,165,250,0.85)";
    ctx.beginPath();
    ctx.arc(pad + c*cell + cell/2, pad + r*cell + cell/2, cell*0.18, 0, Math.PI*2);
    ctx.fill();
  }

  function enableResponse(enabled){
    btnM.disabled = !enabled;
    btnN.disabled = !enabled;
  }

  function recordResponse(isMatch){
    if (!state.running) return;
    const trial = state.trials[state.index];
    const rtMs = Math.max(0, performance.now() - state.lastStartMs);
    state.responses.push({ i: trial.i, isMatch, correct: (isMatch === trial.match), rtMs });
    status.textContent = `Trial ${trial.i+1}/${cfg.length} recorded.`;
  }

  async function run(){
    state.running = true;
    state.cancelled = false;
    state.index = 0;
    state.trials = genTrials();
    state.responses = [];

    btnStart.disabled = true;
    enableResponse(true);
    status.textContent = "Running… respond on each trial.";

    for (state.index = 0; state.index < state.trials.length; state.index++){
      if (state.cancelled) break;

      const trial = state.trials[state.index];

      drawPos(trial.pos, true);
      state.lastStartMs = performance.now();

      await sleep(cfg.stimMs);
      drawPos(trial.pos, false);
      await sleep(cfg.isiMs);
    }

    state.running = false;
    enableResponse(false);
    btnStart.disabled = false;

    const acc = state.responses.length
      ? state.responses.filter(r => r.correct).length / state.responses.length
      : 0;

    const medianRt = median(state.responses.map(r => r.rtMs));
    status.textContent = `Done. Accuracy ${(acc*100).toFixed(1)}% • median RT ${(medianRt/1000).toFixed(2)}s`;

    onDone?.({ trials: state.trials.length, responded: state.responses.length, accuracy: acc, medianRtMs: medianRt });
  }

  btnStart.addEventListener("click", run);
  btnM.addEventListener("click", () => recordResponse(true));
  btnN.addEventListener("click", () => recordResponse(false));

  function onKey(e){
    if (!state.running) return;
    if (e.key === "ArrowLeft") recordResponse(true);
    if (e.key === "ArrowRight") recordResponse(false);
  }
  window.addEventListener("keydown", onKey);

  drawPos(0, false);

  return { cleanup(){ state.cancelled = true; window.removeEventListener("keydown", onKey); } };
}

function renderSymbolSearchBlock(mount, cfg, onDone){
  const state = { running:false, cancelled:false, index:0, responses:[], lastStartMs:0, current:null };

  const wrap = document.createElement("div");
  wrap.className = "callout";
  wrap.innerHTML = `
    <div class="muted small">Symbol search block</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
      <div class="badge">trials = ${cfg.length}</div>
      <div class="badge">set = ${cfg.setSize}</div>
      <div class="badge">time/trial = ${cfg.trialMs}ms</div>
    </div>
    <div class="divider"></div>
    <div id="ssArea"></div>
    <div class="divider"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button class="btn secondary" id="btnStartSS">Start block</button>
      <button class="btn secondary" id="btnPresent" disabled>Present</button>
      <button class="btn secondary" id="btnAbsent" disabled>Absent</button>
      <span class="muted small" id="ssStatus">Not started.</span>
    </div>
  `;
  mount.appendChild(wrap);

  const area = wrap.querySelector("#ssArea");
  const btnStart = wrap.querySelector("#btnStartSS");
  const btnP = wrap.querySelector("#btnPresent");
  const btnA = wrap.querySelector("#btnAbsent");
  const status = wrap.querySelector("#ssStatus");

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "canvasWrap";
  const canvas = document.createElement("canvas");
  canvas.width = 760;
  canvas.height = 260;
  canvasWrap.appendChild(canvas);
  area.appendChild(canvasWrap);

  const ctx = canvas.getContext("2d");

  function genTrial(){
    const alphabet = ["●","■","▲","◆","✚","✖","✶","⬟","⬣","⬢"];
    const target = alphabet[Math.floor(Math.random() * alphabet.length)];
    const set = [];
    for (let i = 0; i < cfg.setSize; i++){
      set.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
    }
    const present = Math.random() < 0.5;
    if (present){
      set[Math.floor(Math.random() * set.length)] = target;
    }else{
      for (let i = 0; i < set.length; i++){
        if (set[i] === target){
          set[i] = alphabet[(alphabet.indexOf(target)+1) % alphabet.length];
        }
      }
    }
    return { target, set, present };
  }

  function drawTrial(trial, fade=false){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(20, 30, 160, 200);

    ctx.fillStyle = "rgba(229,231,235,0.92)";
    ctx.font = "72px system-ui, Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = fade ? 0.18 : 1;
    ctx.fillText(trial.target, 100, 130);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(210, 30, canvas.width - 230, 200);

    ctx.font = "56px system-ui, Segoe UI, Arial";
    const gap = (canvas.width - 260) / cfg.setSize;
    for (let i = 0; i < trial.set.length; i++){
      const x = 240 + i * gap + gap/2;
      ctx.fillText(trial.set[i], x, 130);
    }
  }

  function enableResponse(enabled){
    btnP.disabled = !enabled;
    btnA.disabled = !enabled;
  }

  function recordResponse(present){
    if (!state.running || !state.current) return;
    const rtMs = Math.max(0, performance.now() - state.lastStartMs);
    state.responses.push({ i: state.index, present, correct: (present === state.current.present), rtMs });
    status.textContent = `Trial ${state.index+1}/${cfg.length} recorded.`;
  }

  async function run(){
    state.running = true;
    state.cancelled = false;
    state.index = 0;
    state.responses = [];

    btnStart.disabled = true;
    enableResponse(true);
    status.textContent = "Running… respond on each trial.";

    for (state.index = 0; state.index < cfg.length; state.index++){
      if (state.cancelled) break;

      const trial = genTrial();
      state.current = trial;
      drawTrial(trial, false);
      state.lastStartMs = performance.now();

      await sleep(cfg.trialMs);
      drawTrial(trial, true);
      await sleep(120);
    }

    state.running = false;
    enableResponse(false);
    btnStart.disabled = false;

    const acc = state.responses.length
      ? state.responses.filter(r => r.correct).length / state.responses.length
      : 0;

    const medianRt = median(state.responses.map(r => r.rtMs));
    status.textContent = `Done. Accuracy ${(acc*100).toFixed(1)}% • median RT ${(medianRt/1000).toFixed(2)}s`;

    onDone?.({ trials: cfg.length, responded: state.responses.length, accuracy: acc, medianRtMs: medianRt });
  }

  btnStart.addEventListener("click", run);
  btnP.addEventListener("click", () => recordResponse(true));
  btnA.addEventListener("click", () => recordResponse(false));

  function onKey(e){
    if (!state.running) return;
    if (e.key === "ArrowLeft") recordResponse(true);
    if (e.key === "ArrowRight") recordResponse(false);
  }
  window.addEventListener("keydown", onKey);

  drawTrial({ target:"●", set:Array(cfg.setSize).fill("■"), present:false }, true);

  return { cleanup(){ state.cancelled = true; window.removeEventListener("keydown", onKey); } };
}

function renderCodingBlock(mount, cfg, onDone){
  const state = { running:false, cancelled:false, index:0, responses:[], lastStartMs:0, current:null };

  const wrap = document.createElement("div");
  wrap.className = "callout";
  wrap.innerHTML = `
    <div class="muted small">Coding block</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
      <div class="badge">trials = ${cfg.length}</div>
      <div class="badge">time/trial = ${cfg.trialMs}ms</div>
    </div>
    <div class="divider"></div>
    <div id="cdArea"></div>
    <div class="divider"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <button class="btn secondary" id="btnStartCD">Start block</button>
      <span class="muted small" id="cdStatus">Not started.</span>
    </div>
  `;
  mount.appendChild(wrap);

  const area = wrap.querySelector("#cdArea");
  const btnStart = wrap.querySelector("#btnStartCD");
  const status = wrap.querySelector("#cdStatus");

  const key = document.createElement("div");
  key.className = "callout";
  key.style.marginTop = "10px";

  const entries = Object.entries(cfg.keymap);
  key.innerHTML = `
    <div class="muted small">Key</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
      ${entries.map(([k,sym]) => `<div class="badge">${escapeHtml(k)} → ${escapeHtml(sym)}</div>`).join("")}
    </div>
  `;
  area.appendChild(key);

  const canvasWrap = document.createElement("div");
  canvasWrap.className = "canvasWrap";
  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = 200;
  canvasWrap.appendChild(canvas);
  area.appendChild(canvasWrap);

  const ctx = canvas.getContext("2d");

  const opts = document.createElement("div");
  opts.className = "options";
  opts.style.marginTop = "12px";
  area.appendChild(opts);

  let selected = null;
  function drawTarget(sym, fade=false){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fillRect(20, 30, canvas.width-40, 140);
    ctx.fillStyle = "rgba(229,231,235,0.92)";
    ctx.font = "90px system-ui, Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = fade ? 0.20 : 1;
    ctx.fillText(sym, canvas.width/2, 100);
    ctx.globalAlpha = 1;
  }

  function genTrial(){
    const digits = Object.keys(cfg.keymap);
    const d = digits[Math.floor(Math.random()*digits.length)];
    return { digit: d, symbol: cfg.keymap[d] };
  }

  function enableOptions(enabled){
    [...opts.querySelectorAll(".option")].forEach(x => x.style.pointerEvents = enabled ? "auto" : "none");
  }

  function recordResponse(symbol){
    if (!state.running || !state.current) return;
    const rtMs = Math.max(0, performance.now() - state.lastStartMs);
    const correct = (symbol === state.current.symbol);
    state.responses.push({ i: state.index, symbol, correct, rtMs });
    status.textContent = `Trial ${state.index+1}/${cfg.length} recorded.`;
  }

  function buildOptions(){
    opts.innerHTML = "";
    cfg.options.forEach((sym) => {
      const el = document.createElement("div");
      el.className = "option";
      el.textContent = sym;
      el.addEventListener("click", () => {
        selected = sym;
        [...opts.querySelectorAll(".option")].forEach(x => x.classList.remove("selected"));
        el.classList.add("selected");
        recordResponse(sym);
      });
      opts.appendChild(el);
    });
  }

  async function run(){
    state.running = true;
    state.cancelled = false;
    state.index = 0;
    state.responses = [];

    btnStart.disabled = true;
    enableOptions(true);
    status.textContent = "Running… click the matching symbol.";

    for (state.index = 0; state.index < cfg.length; state.index++){
      if (state.cancelled) break;
      selected = null;
      [...opts.querySelectorAll(".option")].forEach(x => x.classList.remove("selected"));

      const trial = genTrial();
      state.current = trial;
      drawTarget(trial.symbol, false);
      state.lastStartMs = performance.now();

      await sleep(cfg.trialMs);
      drawTarget(trial.symbol, true);
      await sleep(120);
    }

    state.running = false;
    enableOptions(false);
    btnStart.disabled = false;

    const acc = state.responses.length
      ? state.responses.filter(r => r.correct).length / state.responses.length
      : 0;

    const medianRt = median(state.responses.map(r => r.rtMs));
    status.textContent = `Done. Accuracy ${(acc*100).toFixed(1)}% • median RT ${(medianRt/1000).toFixed(2)}s`;

    onDone?.({ trials: cfg.length, responded: state.responses.length, accuracy: acc, medianRtMs: medianRt });
  }

  buildOptions();
  enableOptions(false);
  drawTarget("●", true);

  btnStart.addEventListener("click", run);

  return { cleanup(){ state.cancelled = true; } };
}

/* ----------------- Canvas drawings ----------------- */

function drawFourPanels(ctx, canvas, panels){
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const pad = 18;
  const cellW = (w - pad*3) / 2;
  const cellH = (h - pad*3) / 2;

  const coords = [
    [pad, pad],
    [pad*2 + cellW, pad],
    [pad, pad*2 + cellH],
    [pad*2 + cellW, pad*2 + cellH]
  ];

  ctx.strokeStyle = "rgba(229,231,235,0.18)";
  ctx.lineWidth = 2;

  for (let i = 0; i < 4; i++){
    const [x,y] = coords[i];
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(x,y,cellW,cellH);
    ctx.strokeRect(x,y,cellW,cellH);

    const sym = panels[i];
    if (sym){
      drawSymbolInCell(ctx, sym, x, y, cellW, cellH);
    }else{
      drawMissing(ctx, x, y, cellW, cellH);
    }
  }

  drawArrow(ctx, pad + cellW*0.88, pad + cellH/2, pad*2 + cellW + cellW*0.12, pad + cellH/2);
  drawArrow(ctx, pad + cellW*0.88, pad*2 + cellH + cellH/2, pad*2 + cellW + cellW*0.12, pad*2 + cellH + cellH/2);
}

function drawMatrix3x3(ctx, canvas, grid){
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const pad = 16;
  const cellW = (w - pad*4) / 3;
  const cellH = (h - pad*4) / 3;

  ctx.strokeStyle = "rgba(229,231,235,0.18)";
  ctx.lineWidth = 2;

  for (let r = 0; r < 3; r++){
    for (let c = 0; c < 3; c++){
      const x = pad + c*(cellW+pad);
      const y = pad + r*(cellH+pad);

      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(x,y,cellW,cellH);
      ctx.strokeRect(x,y,cellW,cellH);

      const sym = grid[r][c];
      if (sym){
        drawSymbolInCell(ctx, sym, x, y, cellW, cellH);
      }else{
        drawMissing(ctx, x, y, cellW, cellH);
      }
    }
  }
}

function drawSeries(ctx, canvas, panels){
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0,0,w,h);

  const pad = 14;
  const n = panels.length + 1; // include missing
  const cellW = (w - pad*(n+1)) / n;
  const cellH = h - pad*2;

  ctx.strokeStyle = "rgba(229,231,235,0.18)";
  ctx.lineWidth = 2;

  for (let i = 0; i < n; i++){
    const x = pad + i*(cellW+pad);
    const y = pad;

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fillRect(x,y,cellW,cellH);
    ctx.strokeRect(x,y,cellW,cellH);

    if (i < panels.length){
      drawSymbolInCell(ctx, panels[i], x, y, cellW, cellH);
    }else{
      drawMissing(ctx, x, y, cellW, cellH);
    }

    if (i < n-1){
      drawArrow(ctx, x + cellW*0.92, y + cellH/2, x + cellW + pad*0.58, y + cellH/2);
    }
  }
}

function drawMissing(ctx, x, y, w, h){
  ctx.fillStyle = "rgba(96,165,250,0.25)";
  ctx.font = "52px system-ui, Segoe UI, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", x + w/2, y + h/2);
}

function drawSymbolInCell(ctx, sym, x, y, w, h){
  const c = document.createElement("canvas");
  c.width = 200; c.height = 200;
  renderSymbolGrid(c, [sym], 1);
  const size = Math.min(w,h) * 0.82;
  ctx.drawImage(c, x + w/2 - size/2, y + h/2 - size/2, size, size);
}

function drawArrow(ctx, x1,y1,x2,y2){
  const head = 10;
  const ang = Math.atan2(y2-y1,x2-x1);

  ctx.save();
  ctx.strokeStyle = "rgba(96,165,250,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1,y1);
  ctx.lineTo(x2,y2);
  ctx.stroke();

  ctx.fillStyle = "rgba(96,165,250,0.55)";
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2 - head*Math.cos(ang - Math.PI/6), y2 - head*Math.sin(ang - Math.PI/6));
  ctx.lineTo(x2 - head*Math.cos(ang + Math.PI/6), y2 - head*Math.sin(ang + Math.PI/6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/* ----------------- Utils ----------------- */

function sleep(ms){ return new Promise(res => setTimeout(res, ms)); }

function median(arr){
  if (!arr.length) return 0;
  const a = [...arr].sort((x,y)=>x-y);
  const mid = Math.floor(a.length/2);
  return a.length % 2 ? a[mid] : (a[mid-1]+a[mid]) / 2;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
