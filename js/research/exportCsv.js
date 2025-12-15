import { toCsv } from "./toCsv.js";

export function exportLongCsv({ sessionsState, filename="chc-cat-long.csv" }){
  const rows = [];

  const sessions = sessionsState?.sessions ?? {};
  for (const s of Object.values(sessions)){
    const meta = s.meta ?? {};
    const personId = meta.participantId ?? s.id; // still anonymous unless you supply participantId
    for (const e of (s.events ?? [])){
      if (e.type !== "ITEM_RESPONSE") continue;
      const p = e.payload ?? {};

      rows.push({
        sessionId: s.id,
        personId,
        createdAt: s.createdAt,
        mode: meta.mode ?? "",
        formId: meta.formId ?? "",
        domain: p.domain ?? "",
        family: p.family ?? "",
        itemId: p.itemId ?? "",
        anchor: p.anchor ? 1 : 0,
        x: p.x ?? "",
        rtMs: p.rtMs ?? "",
        thetaAfter: p.thetaAfter ?? "",
        semAfter: p.semAfter ?? "",
        ageYears: meta.ageYears ?? "",
        lang: meta.language ?? "",
        tz: meta.tz ?? "",
        deviceType: meta.deviceType ?? "",
        groupA: meta.groupA ?? "",
        groupB: meta.groupB ?? "",
        groupC: meta.groupC ?? ""
      });
    }
  }

  const csv = toCsv(rows);
  downloadText(filename, csv, "text/csv");
}

function downloadText(filename, text, mime){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
