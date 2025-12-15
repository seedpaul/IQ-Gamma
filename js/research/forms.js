import { hashStringToInt } from "../engine/utils.js";

export class FormManager{
  constructor(formsMeta){
    this.meta = formsMeta;
    this.forms = formsMeta?.forms ?? {};
    this.formIds = Object.keys(this.forms);
  }

  assignForm(seed){
    if (!this.formIds.length) return null;
    const h = hashStringToInt(String(seed ?? ""));
    return this.formIds[h % this.formIds.length];
  }

  getAllowedItemIds(formId, domain){
    const form = this.forms[formId];
    const d = form?.[domain];
    if (!d) return null;
    return d.items ?? null;
  }

  getAnchorIds(formId, domain){
    const form = this.forms[formId];
    return form?.[domain]?.anchors ?? [];
  }

  describe(formId){
    const form = this.forms[formId];
    if (!form) return null;
    const byDomain = {};
    for (const [d, v] of Object.entries(form)){
      byDomain[d] = { nItems: (v.items?.length ?? 0), nAnchors: (v.anchors?.length ?? 0) };
    }
    return { formId, byDomain };
  }
}
