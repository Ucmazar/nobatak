import { botReady, database } from '@/lib/telegram/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  let enabled = false;
  if (botReady()) { try { const { data, error } = await database().rpc('nobatak_telegram_ready'); enabled = !error && data === true; } catch { /* Not configured. */ } }
  return Response.json({ enabled, username: 'nobatech_bot' }, { headers: { 'Cache-Control': 'no-store' } });
}
