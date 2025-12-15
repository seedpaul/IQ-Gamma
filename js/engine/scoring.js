import { ageAdjustTheta, thetaToIndex, thetaToPercentile, ci95 } from "./norms.js";
import { clamp } from "./utils.js";

/**
 * g aggregation:
 * In production, weights MUST come from a validated hierarchical factor model.
 * Here we provide a reasonable default with mild weighting toward Gf/Gq/Gwm for g.
 */
export function computeG(domainThetas){
  const w = {
    "Gf": 0.22,
    "Gv": 0.16,
    "Gq": 0.18,
    "Gwm": 0.18,
    "Gs": 0.12,
    "Gc": 0.14
  };

  let num = 0;
  let den = 0;
  for (const [k,v] of Object.entries(domainThetas)){
    if (Number.isFinite(v)){
      const wk = w[k] ?? 0;
      num += wk * v;
      den += wk;
    }
  }
  if (den <= 0) return 0;
  return num / den;
}

export function buildReport({ ageYears, subtestSummaries, integrity }){
  // Age-adjusted thetas
  const domain = {};
  const domainSem = {};

  for (const s of subtestSummaries){
    domain[s.domain] = ageAdjustTheta(s.domain, s.theta, ageYears);
    domainSem[s.domain] = s.sem; // SEM in theta metric; in real norms may require transformation
  }

  const gTheta = computeG(domain);

  // Convert to indices (demo)
  const indices = {};
  const percentiles = {};
  const ci = {};

  for (const d of Object.keys(domain)){
    const t = domain[d];
    const sem = domainSem[d];
    indices[d] = thetaToIndex(t);
    percentiles[d] = thetaToPercentile(t);
    ci[d] = ci95(thetaToIndex(t), 15 * sem); // approximate scaling of SEM
  }

  const fsiq = thetaToIndex(gTheta);
  const fsiqSem = Math.sqrt(Object.values(domainSem).reduce((s,x)=>s+x*x,0) / Math.max(1,Object.values(domainSem).length)) * 0.75;
  const fsiqCi = ci95(fsiq, 15 * fsiqSem);

  return {
    meta: {
      schema: "chc-cat-report-v1",
      generatedAt: new Date().toISOString(),
      ageYears: Number(ageYears) || null
    },
    results: {
      fsiq: round1(fsiq),
      fsiqPercentile: round1(thetaToPercentile(gTheta)),
      fsiqCI95: { lo: round1(fsiqCi.lo), hi: round1(fsiqCi.hi) },
      domainIndices: mapRound1(indices),
      domainPercentiles: mapRound1(percentiles),
      domainCI95: mapRound1Ci(ci)
    },
    thetas: {
      g: round3(gTheta),
      domains: mapRound3(domain),
      sem: mapRound3(domainSem)
    },
    integrity
  };
}

function round1(x){ return Number.isFinite(x) ? Math.round(x*10)/10 : null; }
function round3(x){ return Number.isFinite(x) ? Math.round(x*1000)/1000 : null; }

function mapRound1(obj){
  const o = {};
  for (const [k,v] of Object.entries(obj)) o[k] = round1(v);
  return o;
}
function mapRound3(obj){
  const o = {};
  for (const [k,v] of Object.entries(obj)) o[k] = round3(v);
  return o;
}
function mapRound1Ci(obj){
  const o = {};
  for (const [k,v] of Object.entries(obj)){
    o[k] = { lo: round1(v.lo), hi: round1(v.hi) };
  }
  return o;
}
