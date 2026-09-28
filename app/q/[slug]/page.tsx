'use client';

import React, { useState, useEffect, use, useCallback, useRef } from 'react';
import { NavigationLink as Link } from '@/components/ui/NavigationLink';
import { createLiveRefresh } from '@/lib/live-refresh';
import { getBookingDay, type BookingDay } from '@/lib/booking-day';
import { usePendingActions } from '@/lib/use-pending-actions';
import { getTelegramConfig } from '@/lib/telegram/client';
import { QueueSkeleton } from '@/components/ui/QueueSkeleton';
import { readPublicCatalog, savePublicCatalog, clearPublicCatalog } from '@/lib/public-catalog';
import { supabase } from '@/lib/supabase/client';
import { Business, Service, Staff, Appointment } from '@/types/database';
import { getBusinessBySlug } from '@/lib/services/businesses';
import { getBusinessServices } from '@/lib/services/services';
import { getBusinessStaff } from '@/lib/services/staff';
import { getBusinessAppointments, invalidateAppointmentReads } from '@/lib/services/appointments';
import { createPublicAppointment as createAppointment, cancelPublicAppointment as deleteAppointment } from '@/lib/services/public-booking';
import { queueAhead } from '@/lib/queue';
import { TelegramButton } from '@/components/ui/TelegramButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AfghanDatePicker } from '@/components/ui/AfghanDatePicker';
import { getUpcomingDaysAfghani, isoToAfghaniDate, getKabulTodayISO } from '@/lib/afghaniMonths';
import { getBookingDeviceId, normalizeBookingName } from '@/lib/booking-device';
import { AlertTriangle, CalendarDays, Check, Clock3, Download, MapPin, Phone, Plus, ShieldCheck, Store, Ticket, Users, XCircle } from 'lucide-react';

interface PublicBookingPageProps {
  params: Promise<{ slug: string }>;
}

export default function PublicBookingPage({ params }: PublicBookingPageProps) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

  const { runAction, pending } = usePendingActions();
  const [planDailyLimit, setPlanDailyLimit] = useState<number | null>(null);
  const [bookingDay, setBookingDay] = useState<BookingDay | null>(null);
  const [catalogChecking, setCatalogChecking] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const appointmentsRef = useRef<Appointment[]>([]);
  const queueVersion = useRef(0);
  const todayStr = getKabulTodayISO();
  const upcomingDays = getUpcomingDaysAfghani(7);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // ─── Page state ───────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);         // Initial full-page load ONLY
  const [dateLoading, setDateLoading] = useState(false); // Lightweight date-switch spinner
  const [business, setBusiness] = useState<Business | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  // Stable ref so callbacks always have current business without stale closure
  const businessRef = useRef<Business | null>(null);
  const selectedDateRef = useRef<string>(todayStr);

  // Booking Form State
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Saved My Appointments State (Local Storage Persistence)
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const myAppointmentsRef = useRef<Appointment[]>([]);
  useEffect(() => { myAppointmentsRef.current = myAppointments; }, [myAppointments]);
  useEffect(() => { appointmentsRef.current = appointments; }, [appointments]);
  const readSavedTickets = async (bizId: string, ids: string[]): Promise<Appointment[]> => {
    if (!ids.length) return [];
    const { data, error } = await supabase.from('appointments').select('*, service:services(*), staff:staff(*)').eq('business_id', bizId).in('id', ids);
    if (error) throw error;
    return (data || []) as unknown as Appointment[];
  };
  useEffect(() => { void getTelegramConfig().catch(() => {}); }, []);

  // ─── Keep refs in sync ────────────────────────────────────────────────────
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // ─── Load appointments for a given date (NO full-page reload) ────────────
  const loadAppointmentsForDate = useCallback(async (bizId: string, date: string) => {
    const version = queueVersion.current;
    try {
      const [appData, day, plan] = await Promise.all([getBusinessAppointments(bizId, date, true), getBookingDay(bizId, date), supabase.rpc('business_plan_daily_quota', { p_business: bizId })]);
      if (plan.error && plan.error.code !== 'PGRST202') throw plan.error;
      const savedIds = myAppointmentsRef.current.map(item => item.id);
      const savedRows = await readSavedTickets(bizId, savedIds);
      if (businessRef.current?.id !== bizId || queueVersion.current !== version) return appData;
      if (selectedDateRef.current === date) { setAppointments(appData); setPlanDailyLimit(plan.data ?? null); setBookingDay(day); setQueueError(null); }
      setMyAppointments(previous => previous.flatMap(item => {
        if (!savedIds.includes(item.id)) return [item];
        const live = savedRows.find(row => row.id === item.id);
        return live && ['waiting','serving'].includes(live.status) ? [live] : [];
      }));
      return appData;
    } catch {
      if (businessRef.current?.id === bizId && selectedDateRef.current === date) setQueueError('اطلاعات صف تأیید نشد. اتصال را بررسی کنید؛ ثبت نوبت پس از تأیید فعال می‌شود.');
      return null;
    }
  }, []);

  // ─── INITIAL DATA FETCH — runs only when slug changes (NOT on date change) ─
  useEffect(() => {
    let disposed = false;
    const cached = readPublicCatalog(slug);
    if (cached) { setBusiness(cached.business); setServices(cached.services); setStaffList(cached.staff); setLoading(false); }
    async function loadPublicData() {
      try {
        setCatalogChecking(true);
        if (!cached) setLoading(true);
        const bizData = await getBusinessBySlug(slug, true);

        if (disposed) return;
        if (!bizData) {
          clearPublicCatalog(slug);
          setBusiness(null);
          return;
        }

        setBusiness(bizData);
        businessRef.current = bizData;

        const [srvData, stData, appData, day, plan] = await Promise.all([
          getBusinessServices(bizData.id, true),
          getBusinessStaff(bizData.id, true),
          getBusinessAppointments(bizData.id, todayStr, true),
          getBookingDay(bizData.id, todayStr),
          supabase.rpc('business_plan_daily_quota', { p_business: bizData.id }),
        ]);

        if (disposed) return;
        if (plan.error && plan.error.code !== 'PGRST202') throw plan.error;
        setPlanDailyLimit(plan.data ?? null);
        setBookingDay(day);
        savePublicCatalog(slug, bizData, srvData, stData);
        setServices(srvData);
        if (srvData.length > 0) setSelectedServiceId(srvData[0].id);
        setStaffList(stData);
        setAppointments(appData);

        // Restore user's saved appointments from localStorage
        const storageKey = `nobatak_user_apps_${bizData.id}`;
        let saved: Appointment[] = [];
        try { saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (!Array.isArray(saved)) saved = []; } catch { saved = []; }
        const incoming = new URLSearchParams(window.location.hash.slice(1)).get('ticket');
        let linked: Appointment | null = null;
        if (incoming) {
          const response = await fetch('/api/telegram/ticket', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: incoming }) });
          const result = await response.json();
          if (response.ok && result.appointment?.business_id === bizData.id) {
            linked = result.appointment;
            try { localStorage.setItem('nobatak_ticket_' + linked!.id, incoming); } catch { /* Optional storage. */ }
            saved = [...saved.filter(item => item.id !== linked!.id), linked!];
            history.replaceState(null, '', window.location.pathname + window.location.search);
          } else setActionAlert({ type: 'error', text: 'لینک نوبت معتبر نیست یا نوبت دیگر موجود نیست.' });
        }
        const recovered = await readSavedTickets(bizData.id, saved.map(item => item.id));
        if (disposed) return;
        const valid = recovered.filter(item => ['waiting','serving'].includes(item.status));
        setMyAppointments(valid); try { localStorage.setItem(storageKey, JSON.stringify(valid)); } catch { /* Keep tickets in memory. */ }
        const active = linked && valid.find(item => item.id === linked!.id) || valid[valid.length - 1];
        if (active) {
          setActiveTicketId(active.id); setShowBookingForm(window.location.hash === '#book');
          setSelectedDate(active.appointment_date); selectedDateRef.current = active.appointment_date;
          setAppointments(active.appointment_date === todayStr ? appData : await getBusinessAppointments(bizData.id, active.appointment_date, true));
          setBookingDay(await getBookingDay(bizData.id, active.appointment_date));
        } else setShowBookingForm(true);

      } catch (err) {
        if (!disposed) setQueueError('دریافت اطلاعات زنده ممکن نشد. اتصال را بررسی و دوباره تلاش کنید.');
      } finally {
        if (!disposed) { setLoading(false); setCatalogChecking(false); }
      }
    }

    void loadPublicData();
    return () => { disposed = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]); // Only depends on slug — date changes do NOT trigger this

  // Reconcile live rows and public settings without repeated full-page loading.
  const liveBusinessId = business?.id;
  useEffect(() => {
    if (!liveBusinessId || catalogChecking) return;
    const refresh = createLiveRefresh(async () => {
      await loadAppointmentsForDate(liveBusinessId, selectedDateRef.current);
    }, () => document.visibilityState !== 'hidden' && navigator.onLine);
    const settings = createLiveRefresh(async () => {
      const current = await getBusinessBySlug(slug, true);
      if (!current) { businessRef.current = null; setBusiness(null); clearPublicCatalog(slug); return; }
      const [srv, staff] = await Promise.all([getBusinessServices(current.id, true), getBusinessStaff(current.id, true)]);
      businessRef.current = current; setBusiness(current); setServices(srv); setStaffList(staff);
      savePublicCatalog(slug, current, srv, staff);
    }, () => document.visibilityState !== 'hidden' && navigator.onLine);
    const channel = supabase.channel('public:rt:' + liveBusinessId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments', filter: 'business_id=eq.' + liveBusinessId }, refresh.request)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments', filter: 'business_id=eq.' + liveBusinessId }, refresh.request)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'appointments' }, payload => {
        if (appointmentsRef.current.some(row => row.id === payload.old.id)) refresh.request();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'business_day_closures', filter: 'business_id=eq.' + liveBusinessId }, refresh.request)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'businesses', filter: 'id=eq.' + liveBusinessId }, settings.request)
      .subscribe(status => { refresh.connection(status); settings.connection(status); });
    const resume = () => { refresh.request(); settings.request(); };
    window.addEventListener('focus', resume); window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { refresh.close(); settings.close(); window.removeEventListener('focus', resume); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); void supabase.removeChannel(channel); };
  }, [liveBusinessId, catalogChecking, slug, loadAppointmentsForDate]);

  useEffect(() => {
    const openBooking = () => { if (window.location.hash === '#book') setShowBookingForm(true); };
    openBooking();
    window.addEventListener('hashchange', openBooking);
    return () => window.removeEventListener('hashchange', openBooking);
  }, []);

  // ─── Handle date tab click (no page reload, lightweight spinner only) ─────
  const handleDateChange = async (newDate: string) => {
    if (newDate === selectedDate) return;
    setAppointments([]); setBookingDay(null);
    setSelectedDate(newDate);
    selectedDateRef.current = newDate;
    const biz = businessRef.current;
    if (!biz) return;
    setDateLoading(true);
    await loadAppointmentsForDate(biz.id, newDate);
    if (selectedDateRef.current === newDate) setDateLoading(false);
  };

  // ─── Queue Metrics ────────────────────────────────────────────────────────
  const dateAppointments = appointments.filter(a => a.appointment_date === selectedDate);
  const servingAppointment = dateAppointments.find(a => a.status === 'serving');
  const bookingAhead = queueAhead(dateAppointments, selectedDate, selectedStaffId || null);
  const selectedService = services.find(s => s.id === selectedServiceId) || services[0] || null;
  const selectedAppointment = myAppointments.find(a => a.id === activeTicketId && a.appointment_date === selectedDate) || myAppointments.find(a => a.appointment_date === selectedDate) || null;
  const receiptService = selectedAppointment ? services.find(service => service.id === selectedAppointment.service_id) || selectedAppointment.service : null;
  const serviceDuration = selectedAppointment && !showBookingForm ? receiptService?.duration_minutes ?? 20 : selectedService?.duration_minutes ?? 20;
  const peopleAheadCount = selectedAppointment
    ? queueAhead(dateAppointments, selectedAppointment.appointment_date, selectedAppointment.staff_id, selectedAppointment.queue_number)
    : 0;
  const estimatedWaitTime = selectedAppointment && !showBookingForm
    ? peopleAheadCount * serviceDuration
    : bookingAhead * serviceDuration;
  const selectedAppointmentTime = selectedAppointment?.created_at
    ? new Intl.DateTimeFormat('fa-AF', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kabul' }).format(new Date(selectedAppointment.created_at))
    : '—';

  // ─── LocalStorage helpers ─────────────────────────────────────────────────
  const saveAppointmentToLocalStorage = (bizId: string, newApp: Appointment) => {
    const storageKey = `nobatak_user_apps_${bizId}`;
    const existing = myAppointments.filter(a => a.id !== newApp.id);
    const updated = [...existing, newApp];
    setMyAppointments(updated);
    setActiveTicketId(newApp.id);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { /* Ticket stays in memory. */ }
  };

  const removeAppointmentFromLocalStorage = (bizId: string, appId: string) => {
    const storageKey = `nobatak_user_apps_${bizId}`;
    const updated = myAppointments.filter(a => a.id !== appId);
    setMyAppointments(updated);
    try { localStorage.setItem(storageKey, JSON.stringify(updated)); } catch { /* Ticket stays in memory. */ }
    if (updated.length > 0) {
      setActiveTicketId(updated[updated.length - 1].id);
    } else {
      setActiveTicketId(null);
      setShowBookingForm(true);
    }
  };

  // ─── Handle Booking Submission ────────────────────────────────────────────
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    return runAction('booking', async () => {
      queueVersion.current++;
      try {
        if (catalogChecking || dateLoading || queueError || bookingDay?.is_closed) { setFormError(bookingDay?.reason || 'لطفاً تا تأیید وضعیت صف صبر کنید.'); return; }
        if (!customerName.trim() || !business) {
          setFormError('لطفاً نام مراجعه‌کننده را وارد کنید.');
          return;
        }

        setSubmitting(true);
        setFormError(null);

        if (businessCapacityFull) { setSubmitting(false); setFormError('ظرفیت روزانهٔ کسب‌وکار تکمیل شده است؛ روز دیگری انتخاب کنید.'); return; }
        if (staffList.length > 0 && !selectedStaffId) { setSubmitting(false); setFormError('لطفاً یک کارمند انتخاب کنید.'); return; }
        const activeMine = myAppointments.filter(item => ['waiting', 'serving'].includes(item.status));
        const deviceLimit = business.max_active_appointments_per_device ?? 3;
        if (business.max_active_appointments_per_device !== null && activeMine.length >= deviceLimit) { setSubmitting(false); setFormError(`شما ${deviceLimit.toLocaleString('fa-AF')} نوبت فعال دارید. برای گرفتن نوبت جدید، یکی از نوبت‌های قبلی باید تکمیل یا لغو شود.`); return; }
        const normalizedName = normalizeBookingName(customerName);
        if (activeMine.some(item => (item.staff_id || '') === selectedStaffId && normalizeBookingName(item.customer_name) === normalizedName)) { setSubmitting(false); setFormError('برای این مراجعه‌کننده نزد همین کارمند یک نوبت فعال وجود دارد.'); return; }
        const maxCapacity = staffList.find(st => st.id === selectedStaffId)?.max_daily_appointments ?? (staffList.length ? 20 : 0);
        if (maxCapacity > 0 && dateAppointments.filter(a => (a.staff_id || '') === selectedStaffId && a.status !== 'cancelled').length >= maxCapacity) {
          setFormError(`⚠️ تکمیل ظرفیت: سقف نوبت‌دهی این کارمند برای تاریخ ${isoToAfghaniDate(selectedDate)} (${maxCapacity} نوبت) تکمیل گردیده است.`);
          setSubmitting(false);
          return;
        }

        const maxQueue = dateAppointments.length > 0 ? Math.max(...dateAppointments.map(a => a.queue_number)) : 0;
        const newQueueNum = maxQueue + 1;

        const chosenStaff = staffList.find(st => st.id === selectedStaffId) || null;

        const { appointment: newApp, error } = await createAppointment({
          business_id: business.id,
          service_id: selectedService?.id || null,
          staff_id: chosenStaff?.id || null,
          customer_name: customerName.trim(),
          booking_device_id: getBookingDeviceId(),
          customer_phone: customerPhone.trim() || null,
          queue_number: newQueueNum,
          status: 'waiting',
          estimated_wait_minutes: estimatedWaitTime,
          appointment_date: selectedDate,
        });

        if (error || !newApp) {
          setFormError(error === 'BOOKING_CLOSED' ? 'پذیرش نوبت برای این روز بسته شده است.' : error === 'DEVICE_ACTIVE_LIMIT_REACHED' ? `شما ${(business.max_active_appointments_per_device ?? 3).toLocaleString('fa-AF')} نوبت فعال دارید. برای گرفتن نوبت جدید، یکی از نوبت‌های قبلی باید تکمیل یا لغو شود.` : error === 'DUPLICATE_ACTIVE_NAME' ? 'برای این مراجعه‌کننده نزد همین کارمند یک نوبت فعال وجود دارد.' : (error === 'BUSINESS_DAILY_CAPACITY_REACHED' || error?.startsWith('ظرفیت روزانهٔ پلن')) ? 'ظرفیت روزانهٔ پلن کسب‌وکار تکمیل شده است؛ روز دیگری انتخاب کنید.' : error === 'DAILY_CAPACITY_REACHED' ? 'ظرفیت این کارمند در این روز تکمیل شده است؛ کارمند یا روز دیگری انتخاب کنید.' : 'ثبت نوبت انجام نشد. لطفاً دوباره تلاش کنید.');
        } else {
          saveAppointmentToLocalStorage(business.id, newApp);
          // Optimistic update — Real-Time will also fire but we update instantly
          if (selectedDateRef.current === newApp.appointment_date) setAppointments(prev => [...prev.filter(row => row.id !== newApp.id), newApp]);
          setShowBookingForm(false);
          setCustomerName('');
          setCustomerPhone('');
          setActionAlert({ type: 'success', text: `نوبت شماره #${newApp.queue_number} برای ${isoToAfghaniDate(selectedDate)} با موفقیت ثبت شد.` });
        }

        setSubmitting(false);
      } catch { setActionAlert({ type: 'error', text: 'عملیات کامل نشد؛ وضعیت نوبت را پیش از تلاش دوباره بررسی کنید.' }); }
      finally { setSubmitting(false); queueVersion.current++; invalidateAppointmentReads(); if (businessRef.current) void loadAppointmentsForDate(businessRef.current.id, selectedDateRef.current); }
    });
  };

  // ─── Cancel Appointment ───────────────────────────────────────────────────
  const handleCancelAppointment = async (appId: string, queueNum: number) => {
    return runAction('cancel:' + appId, async () => {
      queueVersion.current++;
      try {
        if (!business) return;
        if (!confirm(`آیا از انصراف و حذف نوبت شماره #${queueNum} اطمینان دارید؟`)) return;

        setCancellingId(appId);
        const { success, error } = await deleteAppointment(appId);
        if (!success) {
          setActionAlert({ type: 'error', text: `خطا در حذف نوبت: لطفاً دوباره تلاش کنید.` });
        } else {
          removeAppointmentFromLocalStorage(business.id, appId);
          setAppointments(prev => prev.filter(a => a.id !== appId));
          setActionAlert({ type: 'success', text: `نوبت شماره #${queueNum} با موفقیت حذف شد.` });
        }
        setCancellingId(null);
      } catch { setActionAlert({ type: 'error', text: 'عملیات کامل نشد؛ وضعیت نوبت را پیش از تلاش دوباره بررسی کنید.' }); }
      finally { setCancellingId(null); queueVersion.current++; invalidateAppointmentReads(); if (businessRef.current) void loadAppointmentsForDate(businessRef.current.id, selectedDateRef.current); }
    });
  };

  // ─── Download Ticket Image ────────────────────────────────────────────────
  const handleDownloadImage = async () => {
    if (!selectedAppointment || !business) return;
    const chosenService = services.find(s => s.id === selectedAppointment.service_id) || selectedAppointment.service || selectedService;
    const chosenStaff = staffList.find(s => s.id === selectedAppointment.staff_id) || selectedAppointment.staff;
    const aheadCount = queueAhead(dateAppointments, selectedAppointment.appointment_date, selectedAppointment.staff_id, selectedAppointment.queue_number);
    const avgDuration = chosenService ? chosenService.duration_minutes : 20;
    const { downloadTicketImage } = await import('@/lib/ticketImage');
    downloadTicketImage({
      appointment: selectedAppointment,
      business: { name: business.name, description: business.description, phone: business.phone, address: business.address, noShowGraceMinutes: business.no_show_grace_minutes },
      serviceName: chosenService?.name || null,
      staffName: chosenStaff?.name || null,
      peopleAhead: aheadCount,
      estimatedWaitMinutes: aheadCount * avgDuration,
    });
  };

  if (loading || catalogChecking) return <QueueSkeleton />;

  if (!business) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md text-center py-8">
          <div className="text-4xl mb-3">🔍</div>
          <CardTitle>کسب‌وکار یافت نشد</CardTitle>
          <CardDescription className="mt-2">متأسفانه آدرس نوبت‌دهی وارد شده معتبر نیست.</CardDescription>
          <Link href="/" className="inline-block mt-6"><Button>بازگشت به صفحه اصلی</Button></Link>
        </Card>
      </div>
    );
  }

  const selectedDayInfo = upcomingDays.find(d => d.isoDate === selectedDate);
  const maxCapacity = selectedStaffId ? staffList.find(st => st.id === selectedStaffId)?.max_daily_appointments ?? 20 : 0;
  const businessRemaining = planDailyLimit !== null ? Math.max(0, planDailyLimit - dateAppointments.filter(a => a.status !== 'cancelled').length) : Infinity;
  const businessCapacityFull = businessRemaining === 0;
  const capacityFull = businessCapacityFull || maxCapacity > 0 && dateAppointments.filter(a => (a.staff_id || '') === selectedStaffId && a.status !== 'cancelled').length >= maxCapacity;

  return (
    <div className="booking-app min-h-screen flex flex-col font-sans pb-12">
      {/* Public Header */}
      <header className="booking-public-header sticky top-0 z-20 text-white">
        <div className="mx-auto flex min-h-20 max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="booking-header-icon"><CalendarDays size={24} aria-hidden="true" /></span>
            <span className="min-w-0"><strong className="block truncate text-lg sm:text-2xl">نوبتک - در {business.name}</strong>{business.description && <small className="mt-1 block truncate text-[11px] text-blue-100/80 sm:text-xs">{business.description}</small>}</span>
          </Link>
          <div className="flex items-center gap-2">
            {myAppointments.length > 0 && (
              <span className="booking-active-count">نوبت فعال: {myAppointments.length.toLocaleString('fa-AF')}</span>
            )}
          </div>
        </div>
        <div className="booking-business-meta"><div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 text-xs text-blue-50/90">
          <span><Store size={16} aria-hidden="true" />{business.category === 'barbershop' ? 'سلمانی' : business.category || 'کسب‌وکار'}</span>
          {business.address && <span><MapPin size={16} aria-hidden="true" />{business.address}</span>}
          {(business.opening_time || business.closing_time) && <span><Clock3 size={16} aria-hidden="true" />ساعت کاری: {business.opening_time?.slice(0,5) || '—'} تا {business.closing_time?.slice(0,5) || '—'}{business.opening_time && business.closing_time && business.closing_time < business.opening_time ? ' (روز بعد)' : ''}</span>}
          {business.phone && <span dir="ltr"><Phone size={16} aria-hidden="true" />{business.phone}</span>}
        </div></div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Action Alert */}
        {actionAlert && (
          <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
            actionAlert.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <span>{actionAlert.text}</span>
            <button onClick={() => setActionAlert(null)} className="text-sm font-bold opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* DATE SELECTION BAR */}
        <section className="booking-date-card workspace-date-card" aria-label="انتخاب روز نوبت">
          <header className="workspace-date-card-header">
            <div className="workspace-date-card-title">
              <span className="workspace-date-card-icon"><CalendarDays size={21} aria-hidden="true" /></span>
              <div>
                <h2>کدام روز می‌توانید بیایید؟</h2>
                <p>یک روز را انتخاب کنید تا وضعیت پذیرش و نوبت‌های همان روز نمایش داده شود.</p>
              </div>
            </div>
            <div className="workspace-selected-date">
              <span>روز انتخاب‌شده</span>
              <strong>{isoToAfghaniDate(selectedDate)}</strong>
            </div>
          </header>

          <div className="workspace-date-card-body">
            <div className="workspace-date-shortcuts" aria-label="روزهای قابل انتخاب">
              {upcomingDays.map((day) => (
                <button
                  type="button"
                  key={day.isoDate}
                  onClick={() => handleDateChange(day.isoDate)}
                  disabled={dateLoading}
                  aria-pressed={selectedDate === day.isoDate}
                  className={`workspace-date-chip disabled:cursor-wait disabled:opacity-60 ${selectedDate === day.isoDate ? 'is-selected' : ''}`}
                >
                  {day.label}
                </button>
              ))}
            </div>

            <div className="workspace-date-card-footer">
              <div className="workspace-calendar-picker">
                <span className="workspace-calendar-label">انتخاب تاریخ دقیق</span>
                <AfghanDatePicker min={todayStr} value={selectedDate} onChange={handleDateChange} variant="dashboard" />
              </div>
              <span className={`workspace-refresh-state ${dateLoading ? 'is-refreshing' : ''}`}>
                <span className={dateLoading ? 'navigation-spinner' : 'workspace-live-dot'} aria-hidden="true" />
                {dateLoading ? 'در حال بررسی روز…' : 'روز انتخاب‌شده آماده است'}
              </span>
            </div>
          </div>
        </section>

        {dateLoading ? <p role="status" className="p-4 text-blue-700">در حال بررسی پذیرش روز انتخاب‌شده…</p> : queueError ? (
          <div role="alert" className="rounded-xl bg-amber-50 p-4">{queueError}<button type="button" className="mr-2 underline" onClick={() => { if (businessRef.current) void loadAppointmentsForDate(businessRef.current.id, selectedDateRef.current); }}>تلاش دوباره</button></div>
        ) : bookingDay?.is_closed ? (
          <section role="status" className="rounded-2xl border border-rose-200 bg-white p-8 text-center">
            <h2 className="text-xl font-bold text-rose-900">پذیرش این روز بسته است</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-slate-700">دلیل: {bookingDay.reason}</p>
            <p className="mt-3 text-sm text-slate-500">برای دریافت نوبت، روز دیگری انتخاب کنید.</p>
          </section>
        ) : <>
        {/* Live Queue Summary Cards */}
        <div className="booking-summary-grid grid grid-cols-3 gap-3">
          <div className="booking-summary-card booking-summary-blue">
            <span className="booking-summary-icon"><Ticket size={24} aria-hidden="true" /></span>
            <span><span className="text-[11px] font-bold text-blue-600 block">نوبت جاری</span><strong className="text-2xl sm:text-3xl font-black text-blue-900 font-mono mt-1 block">{servingAppointment ? `#${servingAppointment.queue_number}` : '—'}</strong><span className="text-[10px] text-blue-500 font-medium mt-1 block">در حال خدمت</span></span>
          </div>

          <div className="booking-summary-card booking-summary-amber">
            <span className="booking-summary-icon"><Users size={24} aria-hidden="true" /></span>
            <span><span className="text-[11px] font-bold text-amber-600 block">
              {!showBookingForm && selectedAppointment ? 'افراد قبل از شما' : 'افراد در صف'}
            </span><strong className="text-2xl sm:text-3xl font-black text-amber-900 font-mono mt-1 block">
              {!showBookingForm && selectedAppointment ? peopleAheadCount : bookingAhead}
            </strong><span className="text-[10px] text-amber-600 font-medium mt-1 block">نوبت در انتظار</span></span>
          </div>

          <div className="booking-summary-card booking-summary-slate">
            <span className="booking-summary-icon"><Clock3 size={24} aria-hidden="true" /></span>
            <span><span className="text-[11px] font-bold text-slate-600 block">زمان انتظار</span><strong className="text-2xl sm:text-3xl font-black text-slate-900 font-mono mt-1 block">~{estimatedWaitTime}</strong><span className="text-[10px] text-slate-500 font-medium mt-1 block">دقیقه</span></span>
          </div>
        </div>

        {/* SCREEN A: Active Ticket View */}
        {!showBookingForm && selectedAppointment ? (
          <Card className="booking-receipt overflow-hidden border-slate-200 bg-white shadow-xl">
            <CardHeader className="text-center pb-5">
              {myAppointments.length > 1 && (
                <div className="mb-4 flex items-center justify-center gap-2 overflow-x-auto pb-1">
                  <span className="text-xs text-slate-500 font-medium ml-1">نوبت‌های شما:</span>
                  {myAppointments.map(app => (
                    <button
                      key={app.id}
                      onClick={() => { setActiveTicketId(app.id); void handleDateChange(app.appointment_date); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTicketId === app.id ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      #{app.queue_number} ({app.customer_name})
                    </button>
                  ))}
                </div>
              )}

              <div className="booking-success-mark"><Check size={34} strokeWidth={3} aria-hidden="true" /></div>
              <Badge variant="emerald" className="mx-auto mt-1">نوبت شما برای {isoToAfghaniDate(selectedAppointment.appointment_date || selectedDate)} فعال است</Badge>
              <CardTitle className="mt-3 text-2xl font-extrabold text-slate-950 sm:text-3xl">رسید آنلاین نوبتک</CardTitle>
              <CardDescription className="mt-1 text-sm leading-7">
                مشتری گرامی <strong className="text-slate-900">{selectedAppointment.customer_name}</strong>، رسید نوبت شما برای <strong className="font-bold text-blue-700">{isoToAfghaniDate(selectedAppointment.appointment_date || selectedDate)}</strong>:
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5 pt-0">
              <div className="booking-ticket" aria-label={`شماره نوبت ${selectedAppointment.queue_number}، زمان نوبت ${selectedAppointmentTime}`}>
                <div className="booking-ticket-value booking-ticket-number"><span>شماره نوبت:</span><strong>{selectedAppointment.queue_number.toLocaleString('fa-AF')}</strong></div>
                <div aria-hidden="true" />
                <div className="booking-ticket-value booking-ticket-time"><span>زمان نوبت:</span><strong>{selectedAppointmentTime}</strong></div>
              </div>

              {(selectedAppointment.service || selectedAppointment.staff) && <div className="flex flex-wrap justify-center gap-2 text-xs font-semibold text-slate-600">{selectedAppointment.service && <span className="rounded-full bg-blue-50 px-3 py-1.5 text-blue-700">خدمت: {selectedAppointment.service.name}</span>}{selectedAppointment.staff && <span className="rounded-full bg-slate-100 px-3 py-1.5">ارائه‌دهنده: {selectedAppointment.staff.name}</span>}</div>}

              <div className="booking-receipt-metrics grid grid-cols-3 gap-3 text-center">
                <div>
                  <span className="booking-mini-icon text-blue-600"><Ticket size={20} aria-hidden="true" /></span>
                  <span className="text-[10px] text-slate-500 block">نوبت فعلی سیستم</span>
                  <span className="text-lg font-extrabold text-blue-600 font-mono mt-1 block">
                    {servingAppointment ? `#${servingAppointment.queue_number}` : '—'}
                  </span>
                </div>
                <div>
                  <span className="booking-mini-icon text-orange-600"><Users size={20} aria-hidden="true" /></span>
                  <span className="text-[10px] text-slate-500 block">افراد قبل از شما</span>
                  <span className="text-lg font-extrabold text-orange-600 font-mono mt-1 block">{peopleAheadCount.toLocaleString('fa-AF')} نفر</span>
                </div>
                <div>
                  <span className="booking-mini-icon text-blue-600"><Clock3 size={20} aria-hidden="true" /></span>
                  <span className="text-[10px] text-slate-500 block">زمان تقریبی انتظار</span>
                  <span className="text-sm font-extrabold text-slate-800 font-mono mt-1 block">
                    {peopleAheadCount === 0 ? 'اولین نوبت روز' : `حدود ${(peopleAheadCount * serviceDuration).toLocaleString('fa-AF')} دقیقه`}
                  </span>
                </div>
              </div>

              <div className="booking-browser-note">
                <ShieldCheck size={24} aria-hidden="true" />
                <div className="space-y-0.5">
                  <strong className="block font-bold">اطلاعات نوبت در همین مرورگر شما محفوظ می‌ماند</strong>
                  <p className="text-[11px]">وضعیت نوبت به‌صورت زنده به‌روز می‌شود و به چاپ رسید کاغذی نیاز نیست.</p>
                </div>
              </div>

              <div className="booking-arrival-note" role="note">
                <AlertTriangle size={24} aria-hidden="true" />
                <div><strong className="block">لطفاً به‌موقع حاضر شوید</strong><span>{business?.no_show_grace_minutes === 0 ? 'پس از فرا رسیدن نوبت، باید حاضر باشید؛ در غیر این صورت صاحب کسب‌وکار می‌تواند نوبت را لغو کند.' : `پس از فرا رسیدن نوبت، تا ${(business?.no_show_grace_minutes ?? 5).toLocaleString('fa-AF')} دقیقه حاضر شوید؛ پس از آن صاحب کسب‌وکار می‌تواند نوبت را لغو کند.`}</span></div>
              </div>

              <div className="space-y-3 pt-1">
                <Button
                  onClick={handleDownloadImage}
                  size="lg"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm shadow-md shadow-blue-500/20 py-3.5"
                >
                  <Download size={18} aria-hidden="true" /> دانلود رسید به صورت عکس (تصویر)
                </Button>
                <TelegramButton key={selectedAppointment.id} appointmentIds={myAppointments.filter(a => a.status === 'waiting' || a.status === 'serving').map(a => a.id)} appointmentId={selectedAppointment.id} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => { setFormError(null); setShowBookingForm(true); }} className="text-xs font-bold py-2.5">
                    <Plus size={18} aria-hidden="true" /> ثبت نوبت جدید (برای خود یا فرد دیگر)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleCancelAppointment(selectedAppointment.id, selectedAppointment.queue_number)}
                    isLoading={cancellingId === selectedAppointment.id} disabled={pending.size > 0}
                    className="text-xs font-bold text-rose-600 border-rose-200 hover:bg-rose-50 py-2.5"
                  >
                    <XCircle size={18} aria-hidden="true" /> انصراف از این نوبت
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* SCREEN B: Booking Form */
          <Card className="shadow-md border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>فرم ثبت آنلاین نوبت ({selectedDayInfo ? selectedDayInfo.label : isoToAfghaniDate(selectedDate)})</CardTitle>
                <CardDescription className="mt-1 text-xs">خدمت مورد نظر و اطلاعات خود را برای این روز وارد نمایید</CardDescription>
              </div>
              {myAppointments.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => { window.history.replaceState(null, '', window.location.pathname); setShowBookingForm(false); }} className="text-xs font-bold shrink-0">
                  ⬅️ بازگشت به نوبت‌های من ({myAppointments.length})
                </Button>
              )}
            </CardHeader>

            <CardContent>
              {formError && (
                <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 font-medium">{formError}</div>
              )}

              <form onSubmit={handleBookAppointment} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">۱. انتخاب خدمت مورد نظر *</label>
                  {services.length === 0 ? (
                    <p className="text-xs text-slate-500">هیچ خدمتی برای این کسب‌وکار ثبت نشده است.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {services.map(srv => (
                        <div
                          key={srv.id}
                          onClick={() => setSelectedServiceId(srv.id)}
                          className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                            selectedServiceId === srv.id ? 'bg-blue-50/70 border-blue-600 ring-2 ring-blue-100' : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-slate-900">{srv.name}</span>
                            <span className="text-[10px] font-semibold text-blue-600 bg-blue-100/60 px-2 py-0.5 rounded-md">⏱️ {srv.duration_minutes} دقیقه</span>
                          </div>
                          {srv.description && <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{srv.description}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {staffList.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800">۲. انتخاب ارائه‌دهنده خدمت</label>
                    <select
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">کارمند مورد نظر را انتخاب کنید</option>
                      {staffList.map(st => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div role="status" aria-live="polite" className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
                  {dateLoading ? 'در حال دریافت وضعیت صف…' : <>
                    <p className="font-bold">{staffList.find(st => st.id === selectedStaffId)?.name || 'صف عمومی'} · {isoToAfghaniDate(selectedDate)}</p>
                    <p className="mt-1">{bookingAhead.toLocaleString('fa-AF')} نفر پیش از شما هستند؛ اگر اکنون نوبت بگیرید، نفر {(bookingAhead + 1).toLocaleString('fa-AF')} صف خواهید بود.</p>
                    <p className="mt-1 text-xs text-blue-700">جایگاه فعلی صف است و تا ثبت نوبت ممکن است تغییر کند.</p>
                  </>}
                </div>

                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <Input
                    label="نام مراجعه‌کننده *"
                    placeholder="مثلاً: احمد، علی یا محمد"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                  <Input
                    label="شماره تلفن همراه (اختیاری)"
                    placeholder="۰۹۱۲..."
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="dir-ltr text-right"
                  />
                </div>

                {/* Capacity full warning */}
                {myAppointments.length > 0 && <Button type="button" variant="outline" className="w-full" onClick={() => { window.history.replaceState(null, '', window.location.pathname); setShowBookingForm(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>بازگشت به نوبت‌های من ({myAppointments.length})</Button>}
                {capacityFull && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 text-center font-medium space-y-1">
                    <strong className="block font-bold text-sm text-rose-900">⚠️ تکمیل ظرفیت پذیرش نوبت برای این روز</strong>
                    <p>سقف پذیرش برای تاریخ <span className="font-mono font-bold">{isoToAfghaniDate(selectedDate)}</span> تکمیل شده است. لطفاً از نوار بالا تاریخ دیگری انتخاب کنید.</p>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full mt-3 font-bold text-sm" isLoading={submitting} disabled={capacityFull || (staffList.length > 0 && !selectedStaffId) || catalogChecking || dateLoading || !!queueError || !!bookingDay?.is_closed || pending.size > 0}>
                  {capacityFull
                    ? 'ظرفیت نوبت‌دهی این روز تکمیل است'
                    : `تایید و دریافت شماره نوبت روز ${selectedDayInfo ? selectedDayInfo.dayName : isoToAfghaniDate(selectedDate)}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
        </>}
      </main>

      <footer className="mt-auto border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        قدرت گرفته از سیستم مدیریت نوبت‌دهی آنلاین <strong className="text-slate-600">نوبتک</strong>
      </footer>
    </div>
  );
}
