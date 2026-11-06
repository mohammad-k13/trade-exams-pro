import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

// Iran has had a fixed UTC+03:30 offset since DST was abolished in 2022.
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

export const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];
export const JALALI_WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

export interface JalaliParts {
  jy: number;
  jm: number;
  jd: number;
  hour: number;
  minute: number;
}

export function toJalaliParts(date: Date): JalaliParts {
  const t = new Date(date.getTime() + TEHRAN_OFFSET_MS);
  const j = toJalaali(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  return { ...j, hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}

export function fromJalaliParts(p: JalaliParts): Date {
  const g = toGregorian(p.jy, p.jm, p.jd);
  return new Date(Date.UTC(g.gy, g.gm - 1, g.gd, p.hour, p.minute) - TEHRAN_OFFSET_MS);
}

export function monthLength(jy: number, jm: number): number {
  return jalaaliMonthLength(jy, jm);
}

/** Column of the first day of a Jalali month; Saturday is 0. */
export function firstWeekdayOfMonth(jy: number, jm: number): number {
  const g = toGregorian(jy, jm, 1);
  return (new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay() + 1) % 7;
}
