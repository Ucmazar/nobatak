import React from 'react';
import { Check, Clock3, Ticket, Users } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface QueueStatusProps {
  currentServing: number | null;
  waitingCount: number;
  completedCount: number;
  estimatedWaitMinutes?: number;
}

export function QueueStatus({ currentServing, waitingCount, completedCount, estimatedWaitMinutes = 0 }: QueueStatusProps) {
  return (
    <div className="workspace-summary-grid grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card className="workspace-summary-card workspace-summary-current">
        <div><p className="workspace-summary-label">نوبت جاری</p><strong>{currentServing !== null && currentServing > 0 ? currentServing.toLocaleString('fa-AF') : '—'}</strong><span>در حال خدمت</span></div>
        <span className="workspace-summary-icon"><Ticket aria-hidden="true" /></span>
      </Card>
      <Card className="workspace-summary-card workspace-summary-waiting">
        <div><p className="workspace-summary-label">در انتظار</p><strong>{waitingCount.toLocaleString('fa-AF')}</strong><span>نوبت در صف</span></div>
        <span className="workspace-summary-icon"><Users aria-hidden="true" /></span>
      </Card>
      <Card className="workspace-summary-card workspace-summary-completed">
        <div><p className="workspace-summary-label">تکمیل‌شده</p><strong>{completedCount.toLocaleString('fa-AF')}</strong><span>نفر در تاریخ انتخابی</span></div>
        <span className="workspace-summary-icon"><Check aria-hidden="true" /></span>
      </Card>
      <Card className="workspace-summary-card workspace-summary-time">
        <div><p className="workspace-summary-label">زمان انتظار</p><strong>حدود {estimatedWaitMinutes.toLocaleString('fa-AF')}</strong><span>دقیقه</span></div>
        <span className="workspace-summary-icon"><Clock3 aria-hidden="true" /></span>
      </Card>
    </div>
  );
}
