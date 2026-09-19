'use client';
import { useEffect, useState } from 'react';
export function TelegramButton({ appointmentId }: { appointmentId: string }) {
  const [link, setLink] = useState('');
  useEffect(() => {
    let disposed = false;
    Promise.resolve().then(async () => {
      const response = await fetch('/api/telegram/config'); const config = await response.json();
      const token = localStorage.getItem('nobatak_ticket_' + appointmentId);
      if (!disposed) setLink(config.enabled && token ? 'https://t.me/nobatech_bot?start=' + encodeURIComponent(token) : '');
    }).catch(() => { if (!disposed) setLink(''); });
    return () => { disposed = true; };
  }, [appointmentId]);
  if (!link) return null;
  return <a href={link} target="_blank" rel="noopener noreferrer" className="block w-full rounded-xl bg-sky-500 hover:bg-sky-600 px-4 py-3 text-center text-sm font-bold text-white">اطلاع‌رسانی با تلگرام</a>;
}
