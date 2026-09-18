import React from 'react';
import Link from 'next/link';
import { Appointment, AppointmentStatus } from '@/types/database';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

interface AppointmentCardProps {
  appointment: Appointment;
  onStatusChange?: (id: string, newStatus: AppointmentStatus) => void;
  isOwnerView?: boolean;
  businessSlug?: string;
  peopleAheadCount?: number;
  onDownloadTicket?: (appointment: Appointment) => void;
}

export function AppointmentCard({
  appointment,
  onStatusChange,
  isOwnerView = false,
  businessSlug,
  peopleAheadCount,
  onDownloadTicket,
}: AppointmentCardProps) {
  const statusConfig: Record<
    AppointmentStatus,
    { label: string; variant: 'waiting' | 'serving' | 'completed' | 'cancelled' }
  > = {
    waiting: { label: 'در انتظار', variant: 'waiting' },
    serving: { label: 'در حال ارائه خدمت', variant: 'serving' },
    completed: { label: 'تکمیل‌شده', variant: 'completed' },
    cancelled: { label: 'لغو شده', variant: 'cancelled' },
  };

  const formattedTime = new Date(appointment.created_at).toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const currentStatus = statusConfig[appointment.status] || statusConfig.waiting;

  return (
    <div
      className={`p-4 rounded-2xl border transition-all ${
        appointment.status === 'serving'
          ? 'bg-blue-50/40 border-blue-200 shadow-sm ring-1 ring-blue-300'
          : appointment.status === 'completed'
          ? 'bg-slate-50/60 border-slate-200 opacity-75'
          : appointment.status === 'cancelled'
          ? 'bg-rose-50/30 border-rose-100 opacity-60'
          : 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left Info Section */}
        <div className="flex items-start md:items-center gap-3.5 flex-1">
          <div
            className={`w-12 h-12 rounded-2xl font-mono font-extrabold text-lg flex items-center justify-center shrink-0 ${
              appointment.status === 'serving'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : appointment.status === 'completed'
                ? 'bg-emerald-100 text-emerald-800'
                : appointment.status === 'cancelled'
                ? 'bg-slate-100 text-slate-400'
                : 'bg-amber-100 text-amber-900'
            }`}
          >
            #{appointment.queue_number}
          </div>

          <div className="space-y-1 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-slate-900 text-sm">{appointment.customer_name}</h4>
              <Badge variant={currentStatus.variant}>{currentStatus.label}</Badge>

              {/* People Ahead Metric Badge */}
              {isOwnerView && appointment.status === 'waiting' && peopleAheadCount !== undefined && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                  ⏳ {peopleAheadCount === 0 ? 'اولین نفر صف (بدون انتظار)' : `${peopleAheadCount} نفر قبل از این نوبت`}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {appointment.service && (
                <span className="flex items-center gap-1 font-medium text-slate-700">
                  🏷️ {appointment.service.name} ({appointment.service.duration_minutes} دقیقه)
                </span>
              )}
              {appointment.staff && (
                <span className="flex items-center gap-1">
                  👤 {appointment.staff.name}
                </span>
              )}
              {appointment.customer_phone && (
                <span className="flex items-center gap-1 dir-ltr text-right font-mono">
                  📞 {appointment.customer_phone}
                </span>
              )}
              <span className="text-slate-400">⏱️ {formattedTime}</span>
            </div>
          </div>
        </div>

        {/* Action Controls for Business Owner */}
        {isOwnerView && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 md:pt-0 border-t md:border-0 border-slate-100 justify-end shrink-0">
            {/* Public Link Shortcut
            {businessSlug && (
              <Link
                href={`/q/${businessSlug}`}
                target="_blank"
                className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                title="مشاهده صفحه عمومی نوبت‌دهی"
              >
                <span>🔗 صفحه نوبت</span>
              </Link>
            )} */}

            {/* Download PNG Ticket Image */}
            {onDownloadTicket && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs font-bold text-indigo-600 border-indigo-200 hover:bg-indigo-50 px-2.5 py-1.5"
                onClick={() => onDownloadTicket(appointment)}
                title="دانلود عکس رسید نوبت برای مشتری"
              >
                📸 عکس رسید
              </Button>
            )}

            {/* Status Transition Actions */}
            {onStatusChange && (
              <>
                {appointment.status === 'waiting' && (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 font-bold"
                    onClick={() => onStatusChange(appointment.id, 'serving')}
                  >
                    شروع نوبت
                  </Button>
                )}

                {appointment.status === 'serving' && (
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1.5 font-bold"
                    onClick={() => onStatusChange(appointment.id, 'completed')}
                  >
                    تکمیل خدمت
                  </Button>
                )}

                {appointment.status !== 'completed' && appointment.status !== 'cancelled' && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs px-2.5 py-1.5"
                    onClick={() => onStatusChange(appointment.id, 'cancelled')}
                  >
                    لغو
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
