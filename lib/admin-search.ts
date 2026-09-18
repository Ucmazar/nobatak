export function normalizeAdminSearch(value: string): string {
  return value.toLowerCase().replace(/ي|ى/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632))
    .replace(/[\u200c\u200d]/g, '').replace(/\s+/g, ' ').trim();
}
export function matchesAdminSearch(query: string, values: (string | null | undefined)[]): boolean {
  const text = normalizeAdminSearch(values.filter(Boolean).join(' '));
  return normalizeAdminSearch(query).split(' ').every(word => text.includes(word));
}
