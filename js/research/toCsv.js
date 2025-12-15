export function toCsv(rows){
  if (!rows || !rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")){
      return '"' + s.replaceAll('"', '""') + '"';
    }
    return s;
  };
  const lines = [];
  lines.push(cols.map(esc).join(","));
  for (const r of rows){
    lines.push(cols.map(c => esc(r[c])).join(","));
  }
  return lines.join("\n");
}
