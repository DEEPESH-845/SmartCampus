export const nf = (n: number, digits = 0) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const rupee = (n: number) => "₹" + nf(Math.round(n));
export const compact = (n: number) => (n >= 1000 ? nf(n / 1000, n % 1000 ? 1 : 0) + "K" : nf(n));
export const hourLabel = (hh: string) => `${hh}:00`;
/** "2026-08-10" -> "Mon 10 Aug" (UTC so server and browser agree). */
export const day = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const pairName = (p: { a: string; b: string }) => `${p.a} + ${p.b}`;
