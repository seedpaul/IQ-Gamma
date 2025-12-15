import { normalCdf } from "./utils.js";

/**
 * Demo age adjustments:
 * These are NOT real norms. Replace with empirically fitted continuous norming curves.
 * We apply small domain-specific adjustments to approximate typical lifespan patterns.
 */
export function ageAdjustTheta(domain, theta, ageYears){
  const age = Math.max(6, Math.min(90, Number(ageYears) || 25));

  // Center at 25 years.
  const t = age - 25;

  // Very light adjustments to demonstrate the mechanism only.
  // Gs declines earlier; Gwm mild; Gc rises then plateaus; Gf/Gv mild; Gq mild.
  const adjByDomain = {
    "Gs": -0.010 * t,
    "Gwm": -0.006 * t,
    "Gc":  0.006 * t - 0.00012 * t * t,
    "Gf": -0.004 * t,
    "Gv": -0.004 * t,
    "Gq": -0.003 * t
  };

  const adj = adjByDomain[domain] ?? 0;
  return theta - adj;
}

export function thetaToIndex(theta){
  return 100 + 15 * theta;
}

export function thetaToScaled(theta){
  return 10 + 3 * theta;
}

export function thetaToPercentile(theta){
  return normalCdf(theta) * 100;
}

export function ci95(theta, sem){
  const z = 1.96;
  return { lo: theta - z * sem, hi: theta + z * sem };
}
