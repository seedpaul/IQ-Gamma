import { safeTextDownload } from "../engine/utils.js";

// Simple Mantel–Haenszel DIF screening on dichotomous items.
// This is an exploratory screen; final DIF should be done in full IRT models (multiple-group, MIMIC, etc.)

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

export function runDIFReport({ sessionsState, groupKey="language" }){
  const sessions = Object.values(sessionsState?.sessions ?? {}).filter(s => s?.completed);

  // Build per-session total score proxy from non-block dichotomous items
  const person = [];
  for (const s of sessions){
    const meta = s.meta ?? {};
    const g = (meta[groupKey] ?? "").toString().trim().toLowerCase();
    if (!g) continue;

    const evts = (s.events ?? []).filter(e => e.type === "ITEM_RESPONSE");
    const scored = evts.filter(e => {
      const dom = e.payload?.domain;
      // allow all domains; block tasks are already mapped to x
      return typeof e.payload?.x === "number";
    });

    const total = scored.reduce((sum, e) => sum + (e.payload.x ? 1 : 0), 0);
    person.push({ sessionId: s.id, group: g, total, evts: scored });
  }

  if (person.length < 60){
    alert("Not enough completed sessions with this group tag for DIF screening (need ~60+).");
    return;
  }

  // Identify two largest groups
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

  // Define score strata (5 bins by total)
  const totals = person.map(p => p.total);
  const sorted = [...totals].sort((a,b)=>a-b);
  const q = (p) => sorted[Math.floor(p*(sorted.length-1))];
  const cuts = [q(0.2), q(0.4), q(0.6), q(0.8)];
  function stratum(t){
    let s = 0;
    for (const c of cuts) if (t > c) s++;
    return s; // 0..4
  }

  // Collect item responses by stratum and group
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

  // MH common odds ratio and ETS delta-MH transform
  const rows = [];
  for (const [itemId, st] of itemStats.entries()){
    let num = 0, den = 0;
    let wsum = 0;
    for (const t of st.strata){
      const A=t.A, B=t.B, C=t.C, D=t.D;
      const N = A+B+C+D;
      if (N <= 0) continue;
      const num_t = (A*D)/N;
      const den_t = (B*C)/N;
      num += num_t;
      den += den_t;
      // weight proxy
      wsum += (A+B) * (C+D) / N;
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
