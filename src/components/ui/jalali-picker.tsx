"use client";

import { useEffect, useRef, useState } from "react";
import { formatDateTime, toFaDigits } from "@/lib/format";
import { t } from "@/lib/i18n";
import { JALALI_MONTHS, JALALI_WEEKDAYS, firstWeekdayOfMonth, fromJalaliParts, monthLength, toJalaliParts } from "@/lib/jalali";
import { Button, Select } from "./index";

const d = t.datepicker;

/** Jalali date and time in Tehran time. The value is always a real Date, stored as UTC. */
export function JalaliPicker({ id, value, onChange, dateOnly = false }: { id?: string; value: Date; onChange: (d: Date) => void; dateOnly?: boolean }) {
  const parts = toJalaliParts(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ jy: parts.jy, jm: parts.jm });
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function shift(delta: number) {
    const m = view.jm + delta;
    setView(m < 1 ? { jy: view.jy - 1, jm: 12 } : m > 12 ? { jy: view.jy + 1, jm: 1 } : { jy: view.jy, jm: m });
  }

  const offset = firstWeekdayOfMonth(view.jy, view.jm);
  const days = monthLength(view.jy, view.jm);
  const label = dateOnly ? formatDateTime(value).split("،")[0] : formatDateTime(value);

  return (
    <div className="relative" ref={rootRef}>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setView({ jy: parts.jy, jm: parts.jm });
          setOpen(!open);
        }}
        className="block min-h-10 w-full rounded-lg border border-line bg-white px-3 py-2 text-start text-sm"
      >
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label={d.choose} className="absolute start-0 z-20 mt-1 w-72 rounded-xl border border-line bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label={d.prevMonth} className="size-9 rounded-lg hover:bg-surface" onClick={() => shift(-1)}>‹</button>
            <span className="text-sm font-medium">{JALALI_MONTHS[view.jm - 1]} {toFaDigits(view.jy)}</span>
            <button type="button" aria-label={d.nextMonth} className="size-9 rounded-lg hover:bg-surface" onClick={() => shift(1)}>›</button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
            {JALALI_WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-muted">{w}</span>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
              const selected = parts.jy === view.jy && parts.jm === view.jm && parts.jd === day;
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={selected}
                  className={`rounded-md py-1.5 ${selected ? "bg-accent text-white" : "hover:bg-surface"}`}
                  onClick={() => onChange(fromJalaliParts({ ...parts, jy: view.jy, jm: view.jm, jd: day }))}
                >
                  {toFaDigits(day)}
                </button>
              );
            })}
          </div>
          {!dateOnly && (
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm" dir="ltr">
              <Select aria-label={d.hour} value={parts.hour} onChange={(e) => onChange(fromJalaliParts({ ...parts, hour: Number(e.target.value) }))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{toFaDigits(String(h).padStart(2, "0"))}</option>
                ))}
              </Select>
              <span>:</span>
              <Select aria-label={d.minute} value={parts.minute} onChange={(e) => onChange(fromJalaliParts({ ...parts, minute: Number(e.target.value) }))}>
                {Array.from({ length: 12 }, (_, i) => i * 5).concat(parts.minute % 5 ? [parts.minute] : []).sort((a, b) => a - b).map((m) => (
                  <option key={m} value={m}>{toFaDigits(String(m).padStart(2, "0"))}</option>
                ))}
              </Select>
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted">{d.tz}</span>
            <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => setOpen(false)}>{d.done}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
