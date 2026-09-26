import type { Business, Service, Staff } from '@/types/database';

type Catalog = { business: Business; services: Service[]; staff: Staff[]; savedAt: number };
const key = (slug: string) => 'nobatak_public_catalog_v1:' + encodeURIComponent(slug);
// A presentation-only browser cache; never store appointments or customer details.
export function savePublicCatalog(slug: string, business: Business, services: Service[], staff: Staff[]) {
  const { id, name, description, category, phone, address, opening_time, closing_time } = business;
  const value = { business: { id, name, description, category, phone, address, opening_time, closing_time, slug },
    services: services.map(({ id, business_id, name, description, duration_minutes, is_active }) => ({ id, business_id, name, description, duration_minutes, is_active })),
    staff: staff.map(({ id, business_id, name, is_active, max_daily_appointments }) => ({ id, business_id, name, is_active, max_daily_appointments })), savedAt: Date.now() };
  try { localStorage.setItem(key(slug), JSON.stringify(value)); } catch { /* Optional presentation cache. */ }
}
export function readPublicCatalog(slug: string): Catalog | null {
  try {
    const value = JSON.parse(localStorage.getItem(key(slug)) || 'null');
    if (!value || Date.now() - value.savedAt > 86400000 || typeof value.business?.id !== 'string' || !Array.isArray(value.services) || !Array.isArray(value.staff)) return null;
    return value as Catalog;
  } catch { return null; }
}
export function clearPublicCatalog(slug: string) {
  try { localStorage.removeItem(key(slug)); } catch { /* Browser storage unavailable. */ }
}
