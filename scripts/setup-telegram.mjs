const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const origin = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL);
if (!token || !secret || !origin || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error('Set the bot token, webhook secret (32+ safe characters), and public site origin in the environment.');
const url = new URL('/api/telegram/webhook', origin);
if (url.protocol !== 'https:' || url.hostname === 'localhost') throw new Error('A public HTTPS origin is required.');
async function api(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const data = await response.json(); if (!response.ok || !data.ok) throw new Error('Telegram setup request failed.'); return data.result;
}
try {
  const me = await api('getMe', {});
  if (me.username?.toLowerCase() !== 'nobatech_bot') throw new Error('The token belongs to a different bot.');
  await api('setWebhook', { url: url.href, secret_token: secret, allowed_updates: ['message'] });
  console.log('Telegram webhook configured for nobatech_bot.');
} catch { console.error('Telegram setup failed. Check the configuration and network; no secret was logged.'); process.exitCode = 1; }
