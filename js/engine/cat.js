import { fisher2pl, fisher3pl } from "./irt.js";
import { clamp } from "./utils.js";

export class CatSubtest{
  constructor({
    domain,
    items,
    estimator,
    exposureStore,
    config,
    allowedItemIds = null,
    excludedItemIds = null,
    anchorItemIds = [],
    anchorPolicy = {},
    anchorMiniBlockN = 0
  }){
    this.domain = domain;
    this.items = items;
    this.estimator = estimator;
    this.exposureStore = exposureStore;
    this.config = config;

    this.allowedSet = allowedItemIds ? new Set(allowedItemIds) : null;
    this.excludedSet = excludedItemIds ? new Set(excludedItemIds) : new Set();

    this.responses = []; // { item, x, rtMs, meta }
    this.administered = new Set();
    this.theta = 0;
    this.sem = 999;
    this.startedAt = null;

    this.formId = null;
    this.anchorTarget = null;
    this.anchorAdministered = 0;

    this.familyCounts = {};

    this.anchorSet = new Set(anchorItemIds ?? []);
    this.anchorPolicy = anchorPolicy ?? {};
    this.anchorMiniBlockN = Math.max(0, anchorMiniBlockN ?? 0);
    this.anchorMiniRemaining = this.anchorMiniBlockN;
    this.adminAnchors = 0;
  }

 
  setFormContext({ formId, anchorTarget } = {}){
    this.formId = formId ?? null;
    this.anchorTarget = (typeof anchorTarget === "number") ? anchorTarget : null;
    this.anchorAdministered = 0;
    this.adminAnchors = 0;
    this.anchorMiniRemaining = this.anchorMiniBlockN;
  }

  start(){
    this.startedAt = performance.now();

    // Apply form / exclusion filtering
    let pool = this.items;
    if (this.allowedSet){
      pool = pool.filter(it => this.allowedSet.has(it.id));
    }
    if (this.excludedSet && this.excludedSet.size){
      pool = pool.filter(it => !this.excludedSet.has(it.id));
    }
    this.items = pool;
    this.theta = 0;
    this.sem = 999;
    this.responses = [];
    this.administered = new Set();
    this.familyCounts = {};
    this.anchorMiniRemaining = this.anchorMiniBlockN;
    this.adminAnchors = 0;
  }

  recordResponse({ item, x, rtMs, meta={} }){
    this.responses.push({ item, x, rtMs, meta });
    this.administered.add(item.id);

    if (this.anchorSet.has(item.id)){
      this.adminAnchors += 1;
    }

    this.familyCounts[item.family] = (this.familyCounts[item.family] ?? 0) + 1;

    // Exposure accounting
    this.exposureStore?.bump(item.id);

    // Update theta/sem
    const est = this.estimator.estimate(this.responses, 0, 1);
    this.theta = est.theta;
    this.sem = est.sem;

    return est;
  }

  _infoAtTheta(item, theta){
    if (item.model === "3PL"){
      return fisher3pl(theta, item.a, item.b, item.c ?? 0);
    }
    return fisher2pl(theta, item.a, item.b);
  }

  _familyNeedScore(item){
    // Content balancing: each family has a target proportion.
    const targets = this.config.familyTargets?.[this.domain] ?? null;
    if (!targets) return 0;

    const total = Math.max(1, this.responses.length);
    const current = (this.familyCounts[item.family] ?? 0) / total;
    const target = targets[item.family] ?? 0;

    // positive when under target; negative when above
    return target - current;
  }

  _weightedPick(arr){
    // arr: [{ item, w }]
    if (!arr?.length) return null;
    let sum = 0;
    for (const x of arr){ sum += Math.max(0, x.w ?? 0); }
    if (sum <= 0) return arr[0].item;
    let r = Math.random() * sum;
    for (const x of arr){
      r -= Math.max(0, x.w ?? 0);
      if (r <= 0) return x.item;
    }
    return arr[arr.length - 1].item;
  }


  pickNextItem(){
    // Eligible not yet administered
    const eligible0 = this.items.filter(it => !this.administered.has(it.id));
    if (eligible0.length === 0) return null;

    // Basic exposure control
    const maxExposure = this.config.maxExposurePerItem ?? 999999;
    const eligible = eligible0.filter(it => (this.exposureStore?.getCount(it.id) ?? 0) < maxExposure);
    const pool0 = eligible.length ? eligible : eligible0;

    // Anchor logic:
    // 1) If in anchor-only mini block, draw anchor items only.
    // 2) Otherwise, maintain target anchor proportion with bounds, while still maximizing information near theta.
    const anchorPool = pool0.filter(it => this.anchorSet.has(it.id));
    const nonAnchorPool = pool0.filter(it => !this.anchorSet.has(it.id));

    const n = this.responses.length;
    const targetProp = clamp01(this.anchorPolicy?.targetProp ?? 0.22);
    const minAnchors = this.anchorPolicy?.minAnchors ?? 2;
    const maxAnchors = this.anchorPolicy?.maxAnchors ?? 6;
    const avoidFirstTwo = !!this.anchorPolicy?.avoidFirstTwo;

    const desiredAnchorsNow = Math.round((n + 1) * targetProp);

    let forceAnchor = false;

    if (this.anchorMiniRemaining > 0){
      forceAnchor = true;
    }else{
      const under = (this.adminAnchors < Math.min(desiredAnchorsNow, maxAnchors)) && (this.adminAnchors < minAnchors || this.adminAnchors < desiredAnchorsNow);
      const allowEarly = !(avoidFirstTwo && n < 2) && n >= 0;
      forceAnchor = under && allowEarly && (n >= (avoidFirstTwo ? 2 : 0));
      // If we've already exceeded max anchors, avoid anchors unless no alternative
      if (this.adminAnchors >= maxAnchors) forceAnchor = false;
    }

    let pool = pool0;

    if (forceAnchor && anchorPool.length){
      pool = anchorPool;
    }else if (!forceAnchor && nonAnchorPool.length){
      // if we are far above target, bias away from anchors
      const over = this.adminAnchors > Math.max(minAnchors, desiredAnchorsNow + 1);
      pool = over ? nonAnchorPool : pool0;
    }else{
      pool = pool0;
    }

    // Score each item by information, plus family balancing and soft randomization
    const scored = pool.map(item => {
      const info = this._infoAtTheta(item, this.theta);
      const need = this._familyNeedScore(item);
      const anchorBonus = this.anchorSet.has(item.id) ? 0.04 : 0.0; // tiny preference for anchors when allowed
      const jitter = (Math.random() - 0.5) * 0.05;
      return { item, score: info * 0.70 + need * 0.26 + anchorBonus + jitter, info, need };
    });

    scored.sort((a,b) => b.score - a.score);
    const top = scored.slice(0, 6);
    const pick = top[Math.floor(Math.random() * top.length)] ?? scored[0];
    if (!pick) return null;

    // Mini-block accounting
    if (this.anchorMiniRemaining > 0 && this.anchorSet.has(pick.item.id)){
      this.anchorMiniRemaining--;
    }

    return pick.item;
  }

  shouldStop(){
    const minItems = this.config.minItems?.[this.domain] ?? 12;
    const maxItems = this.config.maxItems?.[this.domain] ?? 25;
    const semThresh = this.config.semThreshold?.[this.domain] ?? 0.30;

    const n = this.responses.length;

    if (n < minItems) return false;
    if (n >= maxItems) return true;
    return this.sem <= semThresh;
  }

  summary(){
    return {
      domain: this.domain,
      n: this.responses.length,
      theta: this.theta,
      sem: this.sem,
      responses: this.responses.map(r => ({
        itemId: r.item.id,
        x: r.x,
        rtMs: r.rtMs,
        family: r.item.family,
        b: r.item.b,
        a: r.item.a
      }))
    };
  }

  isAnchor(itemId){
    return this.anchorSet.has(itemId);
  }
}

function clamp01(x){
  return clamp(typeof x === "number" ? x : 0, 0, 1);
}
