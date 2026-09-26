'use client';

type Config = { enabled: boolean; username: string };
let config: { value: Config; expires: number } | undefined;
let flight: Promise<Config> | undefined;

// Only public capability metadata is cached. Booking/ticket state is never cached here.
export function getTelegramConfig(): Promise<Config> {
  if (config && config.expires > Date.now()) return Promise.resolve(config.value);
  if (flight) return flight;
  flight = fetch('/api/telegram/config').then(async response => {
    if (!response.ok) throw new Error('Telegram configuration unavailable');
    const value: Config = await response.json();
    config = { value, expires: Date.now() + 30_000 };
    return value;
  }).finally(() => { flight = undefined; });
  return flight;
}

// Bundle tokens are one-time connection links. Deduplicate only simultaneous requests;
// do not reuse a consumed link or keep personal ticket tokens in a shared cache.
const bundles = new Map<string, Promise<string>>();
export function createTelegramBundle(tokens: string[]) {
  const key = [...new Set(tokens)].sort().join(',');
  const existing = bundles.get(key);
  if (existing) return existing;
  const promise = fetch('/api/telegram/bundle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens: key.split(',') }) })
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'اتصال نوبت‌ها انجام نشد.');
      return result.link as string;
    }).finally(() => { bundles.delete(key); });
  bundles.set(key, promise);
  return promise;
}
