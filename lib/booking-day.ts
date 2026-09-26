import { supabase } from '@/lib/supabase/client';

export interface BookingDay { is_closed: boolean; reason: string; booking_date: string }
export interface NoticeSummary { pending: number; sending: number; failed: number; sent: number }

// Always live: a stale "open" flag must never authorize a booking.
export async function getBookingDay(businessId: string, date: string): Promise<BookingDay | null> {
  const { data, error } = await supabase.from('business_day_closures').select('is_closed,reason,booking_date')
    .eq('business_id', businessId).eq('booking_date', date).maybeSingle();
  if (error) {
    // Existing deployments keep working until the additive migration is installed.
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw new Error('بررسی پذیرش این روز ممکن نشد. دوباره تلاش کنید.');
  }
  return data;
}
