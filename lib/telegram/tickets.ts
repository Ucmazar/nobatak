import { createHmac, timingSafeEqual } from 'node:crypto';

export function signTicket(id: string, secret: string) {
  const value = id.replaceAll('-', '');
  if (!/^[a-f0-9]{32}$/i.test(value) || !secret) throw new Error('Invalid ticket');
  return value + '_' + createHmac('sha256', secret).update('nobatak-ticket-v1:' + value).digest('base64url').slice(0, 24);
}
export function verifyTicket(token: string, secret: string): string | null {
  if (!/^[a-f0-9]{32}_[A-Za-z0-9_-]{24}$/i.test(token) || !secret) return null;
  const value = token.slice(0, 32);
  const id = `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
  const expected = signTicket(id, secret);
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected)) ? id : null;
}
export function secretMatches(actual: string | null, expected: string | undefined) {
  return !!actual && !!expected && Buffer.byteLength(actual) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
