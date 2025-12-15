import { clamp } from "./utils.js";

export function p2pl(theta, a, b){
  const z = a * (theta - b);
  return 1 / (1 + Math.exp(-z));
}

export function p3pl(theta, a, b, c){
  const p = p2pl(theta, a, b);
  return c + (1 - c) * p;
}

export function fisher2pl(theta, a, b){
  const p = p2pl(theta, a, b);
  return a * a * p * (1 - p);
}

export function fisher3pl(theta, a, b, c){
  const p = p3pl(theta, a, b, c);
  const q = 1 - p;
  // Approximate information for 3PL (ignoring c uncertainty; standard operational approximation)
  const pStar = p2pl(theta, a, b);
  const num = (a * (1 - c) * pStar * (1 - pStar));
  const dp = num;
  return (dp * dp) / Math.max(1e-9, p * q);
}

export function logLikelihoodItem(theta, item, correct01){
  const a = item.a;
  const b = item.b;
  const c = item.model === "3PL" ? (item.c ?? 0) : 0;

  const p = item.model === "3PL"
    ? p3pl(theta, a, b, c)
    : p2pl(theta, a, b);

  const pClamped = clamp(p, 1e-9, 1 - 1e-9);
  return correct01 ? Math.log(pClamped) : Math.log(1 - pClamped);
}
