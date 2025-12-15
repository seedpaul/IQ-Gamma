import { safeTextDownload } from "../engine/utils.js";

// Mantel–Haenszel DIF helper used by the DIF explorer UI.
// Returns per-item alpha/delta plus counts so the UI can flag candidates without changing scoring.
export function mhDif({ rows, strata=10, refFilter, focalFilter }){
  const ref = rows.filter(refFilter ?? (() => false));
  const foc = rows.filter(focalFilter ?? (() => false));
  const totalRef = ref.length;
  const totalFoc = foc.length;
  if (totalRef === 0 || totalFoc === 0){
    return { note: "Insufficient ref/focal data", items: [] };
  }

  // Build quantile cuts on pooled score proxy
  const scores = rows.map(r => Number(r.scoreProxy ?? 0));
  const sortedScores = [...scores].sort((a,b)=>a-b);
  const cuts = [];
  for (let i = 1; i < strata; i++){
    const p = i / strata;
    cuts.push(sortedScores[Math.floor(p * (sortedScores.length - 1))] ?? 0);
  }
  const stratumOf = (s) => {
    let k = 0;
    for (const c of cuts) if (s > c) k++;
    return k; // 0..strata-1
  };

  // itemId -> { strata: [{A,B,C,D}], nRef, nFoc }
  const stats = new Map();
  const ensure = (id) => {
    if (!stats.has(id)){
      stats.set(id, {
        strata: Array.from({ length: strata }, () => ({ A:0,B:0,C:0,D:0 })),
        nRef: 0,
        nFoc: 0
      });
    }
    return stats.get(id);
  };

  for (const r of ref){
    const s = stratumOf(Number(r.scoreProxy ?? 0));
    const st = ensure(r.itemId);
    if (r.x === 1){ st.strata[s].A++; } else { st.strata[s].B++; }
    st.nRef++;
  }
  for (const r of foc){
    const s = stratumOf(Number(r.scoreProxy ?? 0));
    const st = ensure(r.itemId);
    if (r.x === 1){ st.strata[s].C++; } else { st.strata[s].D++; }
    st.nFoc++;
  }

  const items = [];
  for (const [itemId, st] of stats.entries()){
    let num = 0;
    let den = 0;
    for (const t of st.strata){
      const A = t.A, B = t.B, C = t.C, D = t.D;
      const N = A + B + C + D;
      if (N <= 0) continue;
      num += (A * D) / Math.max(1, N);
      den += (B * C) / Math.max(1, N);
    }
    if (num <= 0 || den <= 0) continue;
    const alpha = num / den;
    const delta = -2.35 * Math.log(alpha);
    const flag = Math.abs(delta) >= 1.5 ? "L" : (Math.abs(delta) >= 1.0 ? "M" : "");
    items.push({
      itemId,
      alphaMH: alpha,
      deltaMH: delta,
      flag,
      nRef: st.nRef,
      nFocal: st.nFoc
    });
  }

  items.sort((a,b) => Math.abs(b.deltaMH) - Math.abs(a.deltaMH));
  const note = `Ref n=${totalRef}, Focal n=${totalFoc}, strata=${strata}`;
  return { note, items };
}

// Legacy full-report exporter (kept for compatibility; not used in the current UI).
export function runDIFReport({ sessionsState, groupKey="language" }){
  const sessions = Object.values(sessionsState?.sessions ?? {}).filter(s => s?.completed);

  const person = [];
  for (const s of sessions){
    const meta = s.meta ?? {};
    const g = (meta[groupKey] ?? "").toString().trim().toLowerCase();
    if (!g) continue;

    const evts = (s.events ?? []).filter(e => e.type === "ITEM_RESPONSE");
    const scored = evts.filter(e => typeof e.payload?.x === "number");

    const total = scored.reduce((sum, e) => sum + (e.payload.x ? 1 : 0), 0);
    person.push({ sessionId: s.id, group: g, total, evts: scored });
  }

  if (person.length < 60){
    alert("Not enough completed sessions with this group tag for DIF screening (need ~60+).");
    return;
  }

  const counts = new Map();
  for (const p of person) counts.set(p.group, (counts.get(p.group) ?? 0) + 1);
  const top = [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2);
  if (top.length < 2){
    alert("Need at least two groups with data.");
    return;
  }
  const ref = top[0][0];
  const foc = top[1][0];

  const refP = person.filter(p => p.group === ref);
  const focP = person.filter(p => p.group === foc);

  const totals = person.map(p => p.total);
  const sorted = [...totals].sort((a,b)=>a-b);
  const q = (p) => sorted[Math.floor(p*(sorted.length-1))];
  const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
  function stratum(t){
    let s = 0;
    for (const c of cuts) if (t > c) s++;
    return s; // 0..4
  }

  const itemStats = new Map(); // itemId -> { strata: [ {A,B,C,D} ] }
  function ensure(itemId){
    if (!itemStats.has(itemId)){
      itemStats.set(itemId, { strata: Array.from({length:5}, () => ({ A:0,B:0,C:0,D:0 })) });
    }
    return itemStats.get(itemId);
  }

  function addGroup(ps, isRef){
    for (const p of ps){
      const sidx = stratum(p.total);
      for (const e of p.evts){
        const id = e.payload.itemId;
        const x = e.payload.x ? 1 : 0;
        const st = ensure(id).strata[sidx];
        if (isRef){
          if (x) st.A++; else st.B++;
        }else{
          if (x) st.C++; else st.D++;
        }
      }
    }
  }

  addGroup(refP, true);
  addGroup(focP, false);

  const rows = [];
  for (const [itemId, st] of itemStats.entries()){
    let num = 0, den = 0;
    for (const t of st.strata){
      const A=t.A, B=t.B, C=t.C, D=t.D;
      const N = A+B+C+D;
      if (N <= 0) continue;
      const num_t = (A*D)/N;
      const den_t = (B*C)/N;
      num += num_t;
      den += den_t;
    }
    if (den <= 0 || num <= 0) continue;

    const alpha = num / den; // common odds ratio
    const delta = -2.35 * Math.log(alpha); // ETS delta-MH
    const flag = Math.abs(delta) >= 1.5 ? "FLAG" : "";

    rows.push({ itemId, alpha: alpha.toFixed(4), deltaMH: delta.toFixed(3), flag });
  }

  rows.sort((a,b) => Math.abs(parseFloat(b.deltaMH)) - Math.abs(parseFloat(a.deltaMH)));

  const header = ["itemId","alpha","deltaMH","flag"];
  const csv = [header.join(",")].concat(rows.map(r => header.map(k => csvEscape(r[k])).join(","))).join("\n");
  safeTextDownload(`dif_screen_${groupKey}_${ref}_vs_${foc}.csv`, csv, "text/csv");

  alert(`DIF screen exported. Reference group: ${ref} (n=${refP.length}), Focal group: ${foc} (n=${focP.length}).`);
}

function csvEscape(x){
  const s = String(x ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
  return s;
}

function median(arr){
  if (!arr.length) return 0;
  const a = [...arr].sort((x,y)=>x-y);
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m]) / 2;
}
