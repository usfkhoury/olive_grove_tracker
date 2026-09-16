// Minimal RFC 4180 CSV encoder — matches Python's csv.writer default dialect.
function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(esc).join(",")];
  for (const r of rows) lines.push(r.map(esc).join(","));
  return lines.join("\r\n") + "\r\n";
}
