import { safeJsonDownload } from "../engine/utils.js";

export function downloadJson(filename, obj){
  safeJsonDownload(filename, obj);
}

export function downloadJsonl(filename, events){
  const lines = (events ?? []).map(e => JSON.stringify(e));
  const blob = new Blob([lines.join("\n")], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
