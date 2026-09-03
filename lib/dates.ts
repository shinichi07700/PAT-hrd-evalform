// Format tanggal display — murni, tanpa dependensi React/DB
export function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  const d = new Date(s.includes("T") || s.includes(" ") ? s : s + "T00:00:00");
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
