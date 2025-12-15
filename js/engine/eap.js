import { normalPdf } from "./utils.js";
import { logLikelihoodItem } from "./irt.js";

export class EapEstimator{
  constructor({ gridMin=-4, gridMax=4, step=0.1 } = {}){
    this.grid = [];
    for (let x = gridMin; x <= gridMax + 1e-9; x += step){
      this.grid.push(Number(x.toFixed(3)));
    }
  }

  estimate(responses, priorMean=0, priorSd=1){
    // responses: [{ item, x:0|1 }]
    const w = [];
    let sum = 0;

    for (const theta of this.grid){
      const prior = normalPdf((theta - priorMean) / priorSd) / priorSd;
      let ll = 0;
      for (const r of responses){
        ll += logLikelihoodItem(theta, r.item, r.x === 1);
      }
      const post = prior * Math.exp(ll);
      w.push(post);
      sum += post;
    }

    if (sum <= 0){
      return { theta: priorMean, sem: priorSd, var: priorSd * priorSd };
    }

    // normalize
    for (let i = 0; i < w.length; i++) w[i] /= sum;

    // EAP mean and variance
    let mean = 0;
    for (let i = 0; i < this.grid.length; i++){
      mean += this.grid[i] * w[i];
    }

    let v = 0;
    for (let i = 0; i < this.grid.length; i++){
      const d = this.grid[i] - mean;
      v += d * d * w[i];
    }

    return { theta: mean, var: v, sem: Math.sqrt(v) };
  }
}
