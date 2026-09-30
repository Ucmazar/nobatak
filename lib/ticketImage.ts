import { isoToAfghaniDate, getKabulTodayISO } from '@/lib/afghaniMonths';

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
    noShowGraceMinutes?: number;
  };
  serviceName?: string | null;
  staffName?: string | null;
  peopleAhead: number;
  estimatedWaitMinutes: number;
}

export function downloadTicketImage(params: GenerateTicketParams) {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const logo = new Image();
  logo.onload = () => renderAndDownload(canvas, ctx, params, logo);
  logo.onerror = () => renderAndDownload(canvas, ctx, params);
  logo.src = '/logo-transparent.png';
}

function renderAndDownload(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  params: GenerateTicketParams,
  logo?: HTMLImageElement,
) {
  ctx.direction = 'rtl';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#f7fbff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#eaf5ff';
  ctx.beginPath();
  ctx.ellipse(32, 380, 180, 260, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eef7ff';
  ctx.beginPath();
  ctx.ellipse(694, 820, 170, 280, 0.25, 0, Math.PI * 2);
  ctx.fill();

  if (logo) ctx.drawImage(logo, 526, 25, 154, 87);
  else {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0758c9';
    ctx.font = font(34, 900);
    ctx.fillText('نوبت', 675, 62);
    ctx.fillStyle = '#53657c';
    ctx.font = font(13, 500);
    ctx.fillText('سیستم هوشمند نوبت‌دهی', 675, 91);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0758c9';
  ctx.font = font(31, 900);
  ctx.fillText(params.business.name || 'کسب‌وکار', 48, 72);

  ctx.save();
  ctx.shadowColor = 'rgba(23, 78, 126, 0.11)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 24, 132, 672, 916, 34);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#e4eef7';
  ctx.lineWidth = 1.4;
  roundRect(ctx, 24, 132, 672, 916, 34);
  ctx.stroke();

  drawSuccessCard(ctx);
  drawQueueCard(ctx, params.appointment.queue_number);
  drawInformationCard(ctx, params);
  drawWaitCard(ctx, params.estimatedWaitMinutes);
  drawGraceNotice(ctx, params.business.noShowGraceMinutes ?? 5);

  const link = document.createElement('a');
  link.download = `nobatak-ticket-${params.appointment.queue_number}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function drawSuccessCard(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#f0fbf6';
  ctx.strokeStyle = '#d7f1e4';
  ctx.lineWidth = 1.2;
  roundRect(ctx, 46, 156, 628, 112, 24);
  ctx.fill();
  ctx.stroke();

  drawCheckIcon(ctx, 128, 212);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#063f2e';
  ctx.font = font(25, 900);
  ctx.fillText('نوبت شما با موفقیت ثبت شد', 620, 198);
  ctx.fillStyle = '#64748b';
  ctx.font = font(18, 500);
  ctx.fillText('لطفاً در محل کسب‌وکار منتظر بمانید', 620, 234);
}

function drawQueueCard(ctx: CanvasRenderingContext2D, queueNumber: number) {
  const gradient = ctx.createLinearGradient(46, 286, 674, 526);
  gradient.addColorStop(0, '#ddecff');
  gradient.addColorStop(0.52, '#edf6ff');
  gradient.addColorStop(1, '#d8ebff');
  ctx.fillStyle = gradient;
  roundRect(ctx, 46, 286, 628, 240, 24);
  ctx.fill();

  ctx.fillStyle = 'rgba(117, 182, 244, 0.25)';
  ctx.beginPath();
  ctx.ellipse(52, 515, 178, 122, -0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.64)';
  ctx.beginPath();
  ctx.ellipse(157, 540, 155, 94, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(118, 183, 245, 0.22)';
  ctx.beginPath();
  ctx.ellipse(676, 500, 190, 130, 0.22, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#0758c9';
  ctx.font = font(42, 900);
  ctx.fillText('نوبت', 360, 354);
  ctx.font = font(102, 900);
  ctx.fillText(queueNumber.toLocaleString('fa-AF'), 360, 446);
}

function drawInformationCard(ctx: CanvasRenderingContext2D, params: GenerateTicketParams) {
  ctx.fillStyle = '#fbfcff';
  ctx.strokeStyle = '#e5eaf2';
  ctx.lineWidth = 1.2;
  roundRect(ctx, 46, 544, 628, 202, 20);
  ctx.fill();
  ctx.stroke();
  drawDivider(ctx, 46, 611, 674);
  drawDivider(ctx, 46, 678, 674);

  drawTagIcon(ctx, 636, 578);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = font(17, 500);
  ctx.fillText('خدمت:', 596, 578);
  ctx.fillStyle = '#111f39';
  ctx.font = font(20, 800);
  ctx.textAlign = 'center';
  ctx.fillText(params.serviceName || 'ثبت نشده', 338, 578);

  drawUserIcon(ctx, 636, 645);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = font(17, 500);
  ctx.fillText('ارائه‌دهنده:', 596, 645);
  ctx.fillStyle = '#111f39';
  ctx.font = font(19, 800);
  ctx.textAlign = 'center';
  ctx.fillText(params.staffName || 'تعیین نشده', 405, 645);
  ctx.strokeStyle = '#dce3ec';
  ctx.beginPath();
  ctx.moveTo(235, 625);
  ctx.lineTo(235, 665);
  ctx.stroke();
  ctx.fillStyle = '#64748b';
  ctx.font = font(16, 500);
  ctx.fillText(`${params.peopleAhead.toLocaleString('fa-AF')} نفر در انتظار`, 137, 645);

  drawCalendarIcon(ctx, 636, 712);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = font(16, 500);
  ctx.fillText('تاریخ و زمان ثبت:', 596, 712);
  ctx.fillStyle = '#16243d';
  ctx.font = font(17, 700);
  ctx.textAlign = 'left';
  ctx.fillText(formatAppointmentDateTime(params.appointment), 72, 712);
}

function drawWaitCard(ctx: CanvasRenderingContext2D, estimatedWaitMinutes: number) {
  ctx.fillStyle = '#edf6ff';
  ctx.strokeStyle = '#e1effc';
  ctx.lineWidth = 1;
  roundRect(ctx, 46, 764, 628, 108, 20);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'right';
  ctx.fillStyle = '#53657c';
  ctx.font = font(18, 500);
  ctx.fillText('زمان تقریبی انتظار شما', 622, 794);
  ctx.fillStyle = '#0763d7';
  ctx.font = font(29, 900);
  ctx.fillText(formatWaitTime(estimatedWaitMinutes), 622, 836);
  drawClockIcon(ctx, 112, 818, '#076ce6', 30);
}

function drawGraceNotice(ctx: CanvasRenderingContext2D, graceMinutes: number) {
  const normalizedGrace = Math.max(0, Math.round(graceMinutes));
  ctx.fillStyle = '#fff1f3';
  ctx.strokeStyle = '#ffd7dd';
  ctx.lineWidth = 1.2;
  roundRect(ctx, 46, 890, 628, 132, 20);
  ctx.fill();
  ctx.stroke();

  drawClockIcon(ctx, 636, 930, '#d91537', 22);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#cf1534';
  ctx.font = font(20, 900);
  const graceLabel = normalizedGrace === 0
    ? 'مهلت حضور در محل: بدون مهلت اضافه'
    : `مهلت حضور در محل: ${normalizedGrace.toLocaleString('fa-AF')} دقیقه`;
  ctx.fillText(graceLabel, 598, 928);
  ctx.fillStyle = '#58677b';
  ctx.font = font(14, 500);
  if (normalizedGrace === 0) {
    ctx.fillText('پس از رسیدن نوبت باید در محل حضور داشته باشید.', 598, 968);
    ctx.fillText('در غیر این‌صورت نوبت شما قابل لغو خواهد بود.', 598, 996);
  } else {
    ctx.fillText(`لطفاً حداکثر تا ${normalizedGrace.toLocaleString('fa-AF')} دقیقه پس از رسیدن نوبت، در محل حضور داشته باشید.`, 598, 968);
    ctx.fillText('در غیر این‌صورت نوبت شما به صورت خودکار لغو خواهد شد.', 598, 996);
  }
}

function formatAppointmentDateTime(appointment: GenerateTicketParams['appointment']) {
  const createdAt = appointment.created_at ? new Date(appointment.created_at) : new Date();
  const validDate = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;
  const time = new Intl.DateTimeFormat('fa-AF', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kabul',
  }).format(validDate);
  return `${isoToAfghaniDate(appointment.appointment_date || getKabulTodayISO())} - ${time}`;
}

function formatWaitTime(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `حدود ${total.toLocaleString('fa-AF')} دقیقه`;
  const hours = Math.floor(total / 60);
  const remaining = total % 60;
  if (!remaining) return `حدود ${hours.toLocaleString('fa-AF')} ساعت`;
  return `حدود ${hours.toLocaleString('fa-AF')} ساعت و ${remaining.toLocaleString('fa-AF')} دقیقه`;
}

function font(size: number, weight: number) {
  return `${weight} ${size}px Vazirmatn, Tahoma, Arial, sans-serif`;
}

function drawDivider(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number) {
  ctx.strokeStyle = '#e9edf3';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
}

function drawCheckIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const gradient = ctx.createLinearGradient(x - 35, y - 35, x + 35, y + 35);
  gradient.addColorStop(0, '#49be72');
  gradient.addColorStop(1, '#24a95d');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 17, y);
  ctx.lineTo(x - 4, y + 14);
  ctx.lineTo(x + 20, y - 16);
  ctx.stroke();
}

function drawTagIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#61708a';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-15, -14);
  ctx.lineTo(4, -14);
  ctx.lineTo(16, -2);
  ctx.lineTo(-6, 20);
  ctx.lineTo(-19, 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fbfcff';
  ctx.beginPath();
  ctx.arc(2, -6, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawUserIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#61708a';
  ctx.beginPath();
  ctx.arc(x, y - 10, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 17, y + 18);
  ctx.quadraticCurveTo(x - 15, y + 2, x, y + 2);
  ctx.quadraticCurveTo(x + 15, y + 2, x + 17, y + 18);
  ctx.closePath();
  ctx.fill();
}

function drawCalendarIcon(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.strokeStyle = '#61708a';
  ctx.fillStyle = '#61708a';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  roundRect(ctx, x - 16, y - 15, 32, 31, 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 16, y - 5);
  ctx.lineTo(x + 16, y - 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 8, y - 20);
  ctx.lineTo(x - 8, y - 10);
  ctx.moveTo(x + 8, y - 20);
  ctx.lineTo(x + 8, y - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - 7, y + 4, 2, 0, Math.PI * 2);
  ctx.arc(x + 2, y + 4, 2, 0, Math.PI * 2);
  ctx.arc(x + 9, y + 4, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawClockIcon(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, radius: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, radius / 5);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - radius * 0.52);
  ctx.lineTo(x, y + 1);
  ctx.lineTo(x + radius * 0.42, y + radius * 0.2);
  ctx.stroke();
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
