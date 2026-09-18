'use client';
import { Search, X } from 'lucide-react';
export function AdminTableSearch({ value, onChange, placeholder, count, total }: {
  value: string; onChange: (value: string) => void; placeholder: string; count: number; total: number;
}) {
  return <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/20 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div className="relative w-full sm:max-w-sm">
      <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
      <input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="w-full rounded-xl border border-slate-700 bg-slate-950/60 py-2.5 pl-10 pr-10 text-xs text-slate-100 outline-none transition focus:border-indigo-400 placeholder:text-slate-500 [&::-webkit-search-cancel-button]:appearance-none" />
      {value && <button type="button" aria-label="پاک کردن جستجو" onClick={() => onChange('')} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={15} /></button>}
    </div>
    <p role="status" className="text-xs tabular-nums text-slate-500">{count} از {total} مورد</p>
  </div>;
}
