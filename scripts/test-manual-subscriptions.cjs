/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');

const DAY = 86400000;
function effective(status, expiresAt, now) { return status === 'active' && expiresAt && expiresAt <= now ? 'expired' : status; }
function renewal({ status, currentEnd, requestedStart, months, customEnd, paymentStatus }) {
  if (paymentStatus !== 'paid') return null;
  const start = customEnd ? requestedStart : (['active', 'suspended'].includes(effective(status, currentEnd, requestedStart)) && currentEnd > requestedStart ? currentEnd : requestedStart);
  const end = customEnd || new Date(new Date(start).setUTCMonth(new Date(start).getUTCMonth() + months)).getTime();
  return { start, end };
}

test('1: paid payment activates a fresh subscription', () => {
  const start = Date.UTC(2026, 9, 3); const result = renewal({ status: 'expired', currentEnd: start - DAY, requestedStart: start, months: 1, paymentStatus: 'paid' });
  assert.equal(result.start, start); assert.ok(result.end > start);
});
test('2: pending payment never changes subscription access', () => {
  assert.equal(renewal({ status: 'expired', currentEnd: 0, requestedStart: Date.now(), months: 1, paymentStatus: 'pending' }), null);
});
test('3: early renewal extends from current expiry', () => {
  const start = Date.UTC(2026, 9, 3); const currentEnd = start + 10 * DAY; const result = renewal({ status: 'active', currentEnd, requestedStart: start, months: 3, paymentStatus: 'paid' });
  assert.equal(result.start, currentEnd);
});
test('4: expired renewal starts at requested new date', () => {
  const start = Date.UTC(2026, 9, 3); const result = renewal({ status: 'expired', currentEnd: start - DAY, requestedStart: start, months: 1, paymentStatus: 'paid' });
  assert.equal(result.start, start);
});
test('5: custom end is kept exactly and does not carry forward', () => {
  const start = Date.UTC(2026, 9, 3); const end = start + 17 * DAY; const result = renewal({ status: 'active', currentEnd: start + 30 * DAY, requestedStart: start, months: null, customEnd: end, paymentStatus: 'paid' });
  assert.deepEqual(result, { start, end });
});
test('6: expired, suspended and cancelled subscriptions resolve to free access', () => {
  const now = Date.UTC(2026, 9, 3); const fallback = (status, end) => effective(status, end, now) === 'active' ? 'growth' : 'free';
  assert.equal(fallback('active', now - 1), 'free'); assert.equal(fallback('suspended', now + DAY), 'free'); assert.equal(fallback('cancelled', now + DAY), 'free');
});
