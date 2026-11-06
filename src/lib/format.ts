// Display helpers. Stored times are UTC; everything shown is Jalali in Asia/Tehran.
const TZ = "Asia/Tehran";
const LOCALE = "fa-IR-u-ca-persian-nu-arabext";

const FA = "۰۱۲۳۴۵۶۷۸۹";

export function toFaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => FA[Number(d)]);
}

/** Converts Persian and Arabic digits to Latin, for parsing user input. */
export function toLatinDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fa-IR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function formatDate(d: Date | string): string {
  return dateFmt.format(new Date(d));
}

export function formatDateTime(d: Date | string): string {
  const date = new Date(d);
  return `${dateFmt.format(date)}، ساعت ${timeFmt.format(date)}`;
}

export function formatNumber(n: number, maxFraction = 2): string {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: maxFraction }).format(n);
}

export function formatPercent(ratio: number, maxFraction = 0): string {
  return `${formatNumber(ratio * 100, maxFraction)}٪`;
}

/** mm:ss or hh:mm:ss in Persian digits. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return toFaDigits(h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${toFaDigits(s)} ثانیه`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${toFaDigits(m)} دقیقه و ${toFaDigits(rest)} ثانیه` : `${toFaDigits(m)} دقیقه`;
}
