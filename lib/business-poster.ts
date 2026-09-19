import QRCode from 'qrcode';

export function isLocalHost(host: string) {
  return host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export function businessPublicURL(origin: string, slug: string, configured?: string) {
  let base = new URL(origin);
  // A public dashboard always creates links on its own domain, even if an old
  // environment variable still points at localhost.
  if (isLocalHost(base.hostname) && configured) {
    try {
      const candidate = new URL(configured);
      if (['https:', 'http:'].includes(candidate.protocol) && !isLocalHost(candidate.hostname)) base = candidate;
    } catch { /* Invalid configuration must never produce a local QR code. */ }
  }
  if (isLocalHost(base.hostname) || !['https:', 'http:'].includes(base.protocol)) throw new Error('PUBLIC_SITE_URL_REQUIRED');
  return new URL('/q/' + encodeURIComponent(slug), base.origin).href;
}

export async function makeBusinessPoster(name: string, url: string, phone?: string | null) {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1600; canvas.height = 2263;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const qr = await QRCode.toCanvas(url, { width: 1040, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#0f172aff', light: '#ffffffff' } });
  const logo = new Image(); logo.src = '/logo-transparent.png';
  await logo.decode();
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1600, 2263);
  ctx.strokeStyle = '#0891b2'; ctx.lineWidth = 7; ctx.beginPath(); ctx.roundRect(50, 50, 1500, 2163, 45); ctx.stroke();
  const logoHeight = 330 * logo.height / logo.width;
  ctx.drawImage(logo, 635, 110, 330, logoHeight);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const line = (text: string, y: number, size: number, color = '#0f172a', bold = false, direction: CanvasDirection = 'rtl') => {
    ctx.direction = direction; ctx.fillStyle = color;
    ctx.font = `${bold ? 'bold ' : ''}${size}px Tahoma, Arial, sans-serif`;
    ctx.fillText(text, 800, y, 1340);
  }
  line('نوبتک | سیستم مدیریت نوبت', 365, 34, '#0e7490');
  line(new URL(url).host, 415, 30, '#64748b', false, 'ltr');
  // Wrap business names so long names remain readable on the printed poster.
  ctx.font = 'bold 76px Tahoma, Arial, sans-serif';
  const words = name.trim().split(/\s+/); const lines: string[] = []; let current = '';
  for (const word of words) { const next = current ? current + ' ' + word : word; if (current && ctx.measureText(next).width > 1280) { lines.push(current); current = word; } else current = next; }
  if (current) lines.push(current);
  const titleLines = lines.length <= 3 ? lines : [lines[0], lines[1], lines.slice(2).join(' ')];
  titleLines.forEach((text, i) => line(text, 505 + i * 86, 76, '#0f172a', true));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, 280, 750, 1040, 1040);
  line('برای گرفتن نوبت، کیوآر را اسکن کنید', 1840, 48, '#0f172a', true);
  line('دوربین موبایل خود را روبه‌روی کیوآر بگیرید', 1910, 31, '#475569');
  if (phone?.trim()) {
    line('تماس کسب‌وکار', 2010, 30, '#64748b');
    line(phone, 2070, 48, '#0f172a', true, 'ltr');
  }
  line('نوبت‌دهی آسان با نوبتک', 2160, 27, '#64748b');
  return canvas.toDataURL('image/png');
}

