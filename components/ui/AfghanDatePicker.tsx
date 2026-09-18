'use client';
import { AFGHANI_MONTHS, toPersianDigits, toJalali, jalaliToISO } from '@/lib/afghaniMonths';

export function AfghanDatePicker({ value, min, onChange }: { value: string; min: string; onChange: (date: string) => void }) {
  const [gy, gm, gd] = value.split('-').map(Number);
  const [year, month, day] = toJalali(gy, gm, gd);
  const [minGy, minGm, minGd] = min.split('-').map(Number);
  const [firstYear] = toJalali(minGy, minGm, minGd);
  function validDays(y: number, m: number) {
    return Array.from({ length: 31 }, (_, i) => i + 1).filter(d => {
      const iso = jalaliToISO(y, m, d); return iso !== null && iso >= min;
    });
  }
  function select(y: number, m: number, d: number) {
    let days = validDays(y, m);
    if (!days.length) { m = 1; while (m <= 12 && !(days = validDays(y, m)).length) m++; }
    if (!days.length) return;
    const chosen = days.includes(d) ? d : days.find(candidate => candidate >= d) ?? days[days.length - 1];
    const iso = jalaliToISO(y, m, chosen);
    if (iso) onChange(iso);
  }
  const style = 'bg-transparent text-slate-800 text-xs font-bold py-1 px-1 rounded-md focus:outline-2 focus:outline-blue-500 cursor-pointer';
  return <div role="group" aria-label="انتخاب تاریخ هجری خورشیدی" className="inline-flex items-center gap-0.5" dir="rtl">
    <select aria-label="روز" className={style} value={day} onChange={e => select(year, month, Number(e.target.value))}>{validDays(year, month).map(d => <option key={d} value={d}>{toPersianDigits(d)}</option>)}</select>
    <select aria-label="ماه" className={style} value={month} onChange={e => select(year, Number(e.target.value), day)}>{AFGHANI_MONTHS.map((name, i) => <option key={name} value={i + 1} disabled={!validDays(year, i + 1).length}>{name}</option>)}</select>
    <select aria-label="سال" className={style} value={year} onChange={e => select(Number(e.target.value), month, day)}>{Array.from({ length: Math.max(21, year - firstYear + 1) }, (_, i) => firstYear + i).map(y => <option key={y} value={y}>{toPersianDigits(y)}</option>)}</select>
  </div>;
}
