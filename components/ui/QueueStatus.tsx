import React from 'react';
import { Card } from '@/components/ui/Card';

interface QueueStatusProps {
  currentServing: number | null;
  waitingCount: number;
  completedCount: number;
  estimatedWaitMinutes?: number;
}

export function QueueStatus({
  currentServing,
  waitingCount,
  completedCount,
  estimatedWaitMinutes = 0,
}: QueueStatusProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* Current Serving Card */}
      <Card className="p-4 sm:p-5 border-blue-100 bg-gradient-to-br from-blue-50/50 to-white shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-blue-700">نوبت جاری</span>
          <div className="w-8 h-8 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center text-sm font-black">
            ⚡
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-blue-900 font-mono">
            {currentServing !== null && currentServing > 0 ? `#${currentServing}` : '—'}
          </span>
          <span className="text-xs text-blue-600 font-medium">در حال خدمت</span>
        </div>
      </Card>

      {/* Waiting Count Card */}
      <Card className="p-4 sm:p-5 border-amber-100 bg-gradient-to-br from-amber-50/40 to-white shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-amber-700">در انتظار</span>
          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center text-sm font-black">
            ⏳
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-amber-900 font-mono">
            {waitingCount}
          </span>
          <span className="text-xs text-amber-600 font-medium">نوبت در صف</span>
        </div>
      </Card>

      {/* Completed Count Card */}
      <Card className="p-4 sm:p-5 border-emerald-100 bg-gradient-to-br from-emerald-50/40 to-white shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-700">تکمیل‌شده</span>
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-sm font-black">
            ✅
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-emerald-900 font-mono">
            {completedCount}
          </span>
          <span className="text-xs text-emerald-600 font-medium">امروز</span>
        </div>
      </Card>

      {/* Estimated Wait Card */}
      <Card className="p-4 sm:p-5 border-slate-200/80 bg-gradient-to-br from-slate-50 to-white shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">تخمین انتظار نوبت جدید</span>
          <div className="w-8 h-8 rounded-xl bg-slate-200/50 text-slate-600 flex items-center justify-center text-sm font-black">
            ⏱️
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-1">
          <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono">
            ~{estimatedWaitMinutes}
          </span>
          <span className="text-xs text-slate-500 font-medium">دقیقه</span>
        </div>
      </Card>
    </div>
  );
}
