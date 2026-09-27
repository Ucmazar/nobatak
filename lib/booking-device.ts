const STORAGE_KEY = 'nobatak_booking_device_id';
let memoryId: string | null = null;

export function getBookingDeviceId(): string {
  if (memoryId) return memoryId;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && /^[a-f0-9-]{36}$/i.test(saved)) return (memoryId = saved);
  } catch { /* Use an in-memory ID when storage is unavailable. */ }
  memoryId = crypto.randomUUID();
  try { localStorage.setItem(STORAGE_KEY, memoryId); } catch { /* The current page still keeps the ID. */ }
  return memoryId;
}

export function normalizeBookingName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLocaleLowerCase('fa');
}
