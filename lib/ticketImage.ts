import { isoToAfghaniDate, getKabulTodayISO } from '@/lib/afghaniMonths';
/**
 * Helper to render and download a high-resolution, visually stunning ticket graphic
 * directly as a PNG image to the user's device gallery/downloads.
 */

interface GenerateTicketParams {
  appointment: {
    id: string;
    queue_number: number;
    customer_name: string;
    customer_phone?: string | null;
    appointment_date?: string;
    created_at?: string;
  };
  business: {
    name: string;
    description?: string | null;
    phone?: string | null;
    address?: string | null;
  };
  serviceName?: string | null;
  staffName?: string | null;
  peopleAhead: number;
  estimatedWaitMinutes: number;
}

export function downloadTicketImage(params: GenerateTicketParams) {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Outer Dark Canvas Background
  const bgGrad = ctx.createLinearGradient(0, 0, 800, 1080);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.5, '#1e293b');
  bgGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 800, 1080);

  // 2. Main Ticket Card Container (Gradient Blue/Indigo)
  const cardGrad = ctx.createLinearGradient(40, 40, 760, 1040);
  cardGrad.addColorStop(0, '#1d4ed8'); // blue-700
  cardGrad.addColorStop(0.5, '#2563eb'); // blue-600
  cardGrad.addColorStop(1, '#4338ca'); // indigo-700
  ctx.fillStyle = cardGrad;
  roundRect(ctx, 40, 40, 720, 1000, 32);
  ctx.fill();

  // Decorative circles
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.beginPath();
  ctx.arc(720, 40, 200, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(40, 1040, 180, 0, Math.PI * 2);
  ctx.fill();

  // 3. Top Branding Section
  ctx.textAlign = 'right';

  // System Badge
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  roundRect(ctx, 480, 75, 240, 36, 12);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText('⚡ رسید آنلاین نوبتک', 705, 100);

  // Business Name
  ctx.font = 'bold 42px Tahoma, Vazirmatn, sans-serif';
  ctx.fillStyle = '#fde047'; // Bright yellow
  ctx.fillText(params.business.name || 'کسب‌وکار', 720, 175);

  // Business Contact & Address
  const addressPhone = [params.business.address, params.business.phone ? `📞 ${params.business.phone}` : '']
    .filter(Boolean)
    .join('  •  ');
  if (addressPhone) {
    ctx.font = '20px Tahoma, Vazirmatn, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(addressPhone, 720, 215);
  }

  // Ticket Perforated Cut Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.moveTo(80, 250);
  ctx.lineTo(720, 250);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cut-out circles on ticket sides
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(40, 250, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(760, 250, 20, 0, Math.PI * 2);
  ctx.fill();

  // 4. White Ticket Main Body Box
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 70, 285, 660, 650, 28);
  ctx.fill();

  // Title inside white box
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 28px Tahoma, Vazirmatn, sans-serif';
  const targetDateLabel = params.appointment.appointment_date ? ` (${isoToAfghaniDate(params.appointment.appointment_date)})` : '';
  ctx.fillText(`تأییدیه و شماره نوبت شما${targetDateLabel}`, 400, 340);

  // Big Queue Number Badge
  const badgeGrad = ctx.createLinearGradient(200, 370, 600, 520);
  badgeGrad.addColorStop(0, '#1d4ed8');
  badgeGrad.addColorStop(1, '#4f46e5');
  ctx.fillStyle = badgeGrad;
  roundRect(ctx, 200, 370, 400, 150, 24);
  ctx.fill();

  ctx.fillStyle = '#bfdbfe';
  ctx.font = 'bold 20px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText('شماره نوبت اختصاصی', 400, 408);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'black 72px Tahoma, sans-serif';
  ctx.fillText(`#${params.appointment.queue_number}`, 400, 490);

  // Customer & Service Info Details
  ctx.textAlign = 'right';
  let currentY = 575;

  ctx.fillStyle = '#334155';
  ctx.font = 'bold 24px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText(`👤 مشتری: ${params.appointment.customer_name}`, 680, currentY);

  if (params.serviceName) {
    currentY += 45;
    ctx.fillText(`🏷️ خدمت درخواستی: ${params.serviceName}`, 680, currentY);
  }

  if (params.staffName) {
    currentY += 45;
    ctx.fillText(`👨‍💼 ارائه‌دهنده: ${params.staffName}`, 680, currentY);
  }

  // Metric Cards (People Ahead & Est Wait Time)
  currentY += 45;

  // Box 1: People Ahead
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 95, currentY, 280, 90, 18);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 17px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText('افراد قبل از شما', 235, currentY + 32);
  ctx.fillStyle = '#d97706'; // amber-600
  ctx.font = 'bold 28px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText(`${params.peopleAhead} نفر`, 235, currentY + 70);

  // Box 2: Est Wait Time
  roundRect(ctx, 425, currentY, 280, 90, 18);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 17px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText('زمان تقریبی انتظار', 565, currentY + 32);
  ctx.fillStyle = '#2563eb'; // blue-600
  ctx.font = 'bold 28px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText(`~${params.estimatedWaitMinutes} دقیقه`, 565, currentY + 70);

  // Issue Date/Time Footer inside white box
  const now = new Date();
  const dateStr = isoToAfghaniDate(params.appointment.appointment_date || getKabulTodayISO()) + ' - ' + now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText(`تاریخ و زمان ثبت: ${dateStr}`, 400, 905);

  // 5. Card Bottom Notice
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 19px Tahoma, Vazirmatn, sans-serif';
  ctx.fillText('📸 این تصویر در گالری گوشی شما ذخیره می‌شود (مناسب استفاده آفلاین)', 400, 985);

  // 6. Trigger PNG Download
  const link = document.createElement('a');
  link.download = `nobatak-ticket-${params.appointment.queue_number}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
