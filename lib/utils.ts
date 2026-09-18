// Utility helper for class names
export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

// Convert English numbers to Persian digits
export function toPersianDigits(n: number | string): string {
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return n.toString().replace(/\d/g, (x) => farsiDigits[parseInt(x)]);
}

// Slugify string for business URLs e.g. "آرایشگاه رضا" -> "arayeshgah-reza" or custom slug
export function slugify(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/\u200C/g, '-')
    .replace(/[^\w\s-a-zA-Z0-9\u0600-\u06FF]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Check if string is a valid PostgreSQL UUID
export function isValidUUID(str: string | null | undefined): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}
