import { safeTextDownload } from "../engine/utils.js";

function csvEscape(x){
  const s = String(x ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replaceAll('"','""') + '"';
  return s;
}

export function exportCalibrationPack({ sessionsState, itembank }){
  // sessionsState: { sessions: {id -> {meta, events}}, order: [] }
  const sessions = Object.values(sessionsState?.sessions ?? {}).filter(s => s?.completed);

  // Build long-format responses from ITEM_RESPONSE events.
  const rows = [];
  const metaRows = [];
  const items = (itembank?.items ?? []);
  const itemById = new Map(items.map(it => [it.id, it]));

  for (const s of sessions){
    const sid = s.id;
    const meta = s.meta ?? {};
    metaRows.push({
      sessionId: sid,
      createdAt: s.createdAt,
      completedAt: s.completedAt ?? "",
      mode: meta.mode ?? "",
      formId: meta.formId ?? "",
      ageYears: meta.ageYears ?? "",
      ageBand: meta.ageBand ?? "",
      language: meta.language ?? "",
      country: meta.country ?? "",
      deviceClass: meta.deviceClass ?? "",
      tz: meta.tz ?? "",
      screenW: meta.screen?.w ?? "",
      screenH: meta.screen?.h ?? "",
      dpr: meta.screen?.dpr ?? "",
      userAgent: meta.userAgent ?? ""
    });

    const evts = s.events ?? [];
    for (const e of evts){
      if (e.type !== "ITEM_RESPONSE") continue;
      const p = e.payload ?? {};
      const it = itemById.get(p.itemId);
      rows.push({
        sessionId: sid,
        at: e.at,
        formId: meta.formId ?? "",
        domain: p.domain,
        family: p.family,
        itemId: p.itemId,
        anchor: it?.anchor === true ? 1 : 0,
        a: p.a,
        b: p.b,
        c: p.c ?? "",
        x: p.x,
        rtMs: p.rtMs,
        thetaAfter: p.thetaAfter,
        semAfter: p.semAfter
      });
    }
  }

  // Export: responses_long.csv
  const longHeader = ["sessionId","at","formId","domain","family","itemId","anchor","a","b","c","x","rtMs","thetaAfter","semAfter"];
  const longCsv = [longHeader.join(",")].concat(rows.map(r => longHeader.map(k => csvEscape(r[k])).join(","))).join("\n");
  safeTextDownload("calibration_responses_long.csv", longCsv, "text/csv");

  // Export: participants_meta.csv
  const metaHeader = ["sessionId","createdAt","completedAt","mode","formId","ageYears","ageBand","language","country","deviceClass","tz","screenW","screenH","dpr","userAgent"];
  const metaCsv = [metaHeader.join(",")].concat(metaRows.map(r => metaHeader.map(k => csvEscape(r[k])).join(","))).join("\n");
  safeTextDownload("calibration_participants_meta.csv", metaCsv, "text/csv");

  // Export: Q-matrix (domain/family + anchor/forms)
  const qHeader = ["itemId","domain","family","model","a","b","c","anchor","forms"];
  const qCsv = [qHeader.join(",")].concat(items.map(it => qHeader.map(k => {
    const v = (k === "forms") ? (it.forms ?? []).join("|") : it[k];
    return csvEscape(v);
  }).join(","))).join("\n");
  safeTextDownload("calibration_item_metadata.csv", qCsv, "text/csv");

  // Minimal helper files for R/Python pipelines
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    files: [
      "calibration_responses_long.csv",
      "calibration_participants_meta.csv",
      "calibration_item_metadata.csv"
    ],
    notes: [
      "Long-format response data for IRT (e.g., mirt::mirt, TAM::tam.mml, py-irt).",
      "Each row is a dichotomous item response with RT and theta/SEM trajectory.",
      "Equating: use formId + anchor flag; anchors appear in all forms."
    ]
  };
  safeTextDownload("calibration_manifest.json", JSON.stringify(manifest, null, 2), "application/json");
}
