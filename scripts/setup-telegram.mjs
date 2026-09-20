import nextEnv from '@next/env';
import { fileURLToPath } from 'node:url';

nextEnv.loadEnvConfig(fileURLToPath(new URL('../', import.meta.url)), false, { info() {}, error() {} });
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const origin = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL);

async function api(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error('Telegram request failed');
  return data.result;
}

let stage = 'configuration';
try {
  const missing = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'].filter(key => !process.env[key]);
  if (missing.length) {
    console.error('Missing environment variables: ' + missing.join(', '));
    throw new Error('Missing configuration');
  }
  if (!origin || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) throw new Error('Invalid configuration');
  const url = new URL('/api/telegram/webhook', origin);
  if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost') throw new Error('Public HTTPS origin required');
  stage = 'live site readiness';
  const ready = await fetch(new URL('/api/telegram/config', url), { signal: AbortSignal.timeout(15000) });
  if (!ready.ok || !(await ready.json()).enabled) throw new Error('Site not ready');
  // Verify that the locally supplied secret matches the deployed server before changing Telegram.
  // An empty update is acknowledged without binding customers or sending messages.
  stage = 'deployed webhook secret';
  const probe = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-bot-api-secret-token': secret },
    body: '{}', signal: AbortSignal.timeout(15000),
  });
  if (!probe.ok || !(await probe.json()).ok) throw new Error('Webhook secret mismatch');
  stage = 'bot identity';
  const me = await api('getMe', {});
  if (me.username?.toLowerCase() !== 'nobatech_bot') throw new Error('Wrong bot');
  stage = 'webhook registration';
  await api('setWebhook', { url: url.href, secret_token: secret, allowed_updates: ['message'] });
  stage = 'webhook verification';
  const info = await api('getWebhookInfo', {});
  if (info.url !== url.href) throw new Error('Webhook URL mismatch');
  console.log('Webhook registered and verified for nobatech_bot.');
  console.log('Customer Start/status and queue-change delivery still require an end-to-end test.');
  if (info.last_error_date) console.log('Telegram reports a previous delivery error; test a new message.');
} catch {
  console.error('Telegram setup failed at: ' + stage + '. No secret was logged.');
  process.exitCode = 1;
}
