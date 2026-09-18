'use client';

import React, { useState, useEffect, use, useCallback, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Business, Service, Staff, Appointment } from '@/types/database';
import { getBusinessBySlug } from '@/lib/services/businesses';
import { getBusinessServices } from '@/lib/services/services';
import { getBusinessStaff } from '@/lib/services/staff';
import { getBusinessAppointments, createAppointment, deleteAppointment } from '@/lib/services/appointments';
import { downloadTicketImage } from '@/lib/ticketImage';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { AfghanDatePicker } from '@/components/ui/AfghanDatePicker';
import { getUpcomingDaysAfghani, isoToAfghaniDate, getKabulTodayISO } from '@/lib/afghaniMonths';

interface PublicBookingPageProps {
  params: Promise<{ slug: string }>;
}

export default function PublicBookingPage({ params }: PublicBookingPageProps) {
  const resolvedParams = use(params);
  const slug = resolvedParams.slug;

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

  useEffect(() => {
    let disposed = false;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const current = await getBusinessBySlug(slug);
        if (!disposed && !current) { businessRef.current = null; setBusiness(null); }
      } finally { pending = false; }
    }, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, [slug]);

  // ─── Keep refs in sync ────────────────────────────────────────────────────
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // ─── Load appointments for a given date (NO full-page reload) ────────────
  const loadAppointmentsForDate = useCallback(async (bizId: string, date: string) => {
    try {
      const appData = await getBusinessAppointments(bizId, date);
      setAppointments(appData);
      return appData;
    } catch (err) {
      console.error('Error loading appointments:', err);
      return [];
    }
  }, []);

  // ─── INITIAL DATA FETCH — runs only when slug changes (NOT on date change) ─
  useEffect(() => {
    async function loadPublicData() {
      try {
        setLoading(true);
        const bizData = await getBusinessBySlug(slug);

        if (!bizData) {
          setBusiness(null);
          return;
        }

        setBusiness(bizData);
        businessRef.current = bizData;

        const [srvData, stData, appData] = await Promise.all([
          getBusinessServices(bizData.id, true),
          getBusinessStaff(bizData.id, true),
          getBusinessAppointments(bizData.id, todayStr),
        ]);

        setServices(srvData);
        if (srvData.length > 0) setSelectedServiceId(srvData[0].id);
        setStaffList(stData);
        setAppointments(appData);

        // Restore user's saved appointments from localStorage
        const storageKey = `nobatak_user_apps_${bizData.id}`;
        const localData = localStorage.getItem(storageKey);
        if (localData) {
          try {
            const parsed: Appointment[] = JSON.parse(localData);
            const validActive = parsed
              .filter(localApp => {
                const live = appData.find(a => a.id === localApp.id);
                return live && (live.status === 'waiting' || live.status === 'serving');
              })
              .map(localApp => {
                const live = appData.find(a => a.id === localApp.id)!;
                return { ...localApp, status: live.status, queue_number: live.queue_number };
              });
            setMyAppointments(validActive);
            localStorage.setItem(storageKey, JSON.stringify(validActive));
            if (validActive.length > 0) {
              setActiveTicketId(validActive[validActive.length - 1].id);
              setShowBookingForm(false);
            } else {
              setShowBookingForm(true);
            }
          } catch {
            setShowBookingForm(true);
          }
        } else {
          setShowBookingForm(true);
        }
      } catch (err) {
        console.error('Error loading public page:', err);
        setBusiness(null);
      } finally {
        setLoading(false);
      }
    }

    loadPublicData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]); // Only depends on slug — date changes do NOT trigger this

  // ─── Real-Time Subscription (Instant Updates without Polling) ───────────
  useEffect(() => {
    if (!business) return;

    const channel = supabase
      .channel(`public:rt:${business.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        async (payload: any) => {
          const rowBizId = payload?.new?.business_id || payload?.old?.business_id;
          if (!rowBizId || rowBizId === business.id) {
            await loadAppointmentsForDate(business.id, selectedDateRef.current);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [business, loadAppointmentsForDate]);

  // ─── Handle date tab click (no page reload, lightweight spinner only) ─────
  const handleDateChange = async (newDate: string) => {
    if (newDate === selectedDate) return;
    setSelectedDate(newDate);
    selectedDateRef.current = newDate;
    const biz = businessRef.current;
    if (!biz) return;
    setDateLoading(true);
    await loadAppointmentsForDate(biz.id, newDate);
    setDateLoading(false);
  };

  // ─── Queue Metrics ────────────────────────────────────────────────────────
  const dateAppointments = appointments.filter(a => (a.appointment_date || todayStr) === selectedDate);
  const servingAppointment = dateAppointments.find(a => a.status === 'serving');
  const waitingAppointments = dateAppointments.filter(a => a.status === 'waiting');
  const selectedService = services.find(s => s.id === selectedServiceId) || services[0] || null;
  const serviceDuration = selectedService ? selectedService.duration_minutes : 20;

  const selectedAppointment = myAppointments.find(a => a.id === activeTicketId) || myAppointments[0] || null;
  const peopleAheadCount = selectedAppointment
    ? dateAppointments.filter(a => a.status === 'waiting' && a.queue_number < selectedAppointment.queue_number).length
    : 0;
  const estimatedWaitTime = selectedAppointment && !showBookingForm
    ? peopleAheadCount * serviceDuration
    : waitingAppointments.length * serviceDuration;

  // ─── LocalStorage helpers ─────────────────────────────────────────────────
  const saveAppointmentToLocalStorage = (bizId: string, newApp: Appointment) => {
    const storageKey = `nobatak_user_apps_${bizId}`;
    const existing = myAppointments.filter(a => a.id !== newApp.id);
    const updated = [...existing, newApp];
    setMyAppointments(updated);
    setActiveTicketId(newApp.id);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  };

  const removeAppointmentFromLocalStorage = (bizId: string, appId: string) => {
    const storageKey = `nobatak_user_apps_${bizId}`;
    const updated = myAppointments.filter(a => a.id !== appId);
    setMyAppointments(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
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
    if (!customerName.trim() || !business) {
      setFormError('لطفاً نام خود را وارد کنید.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const maxCapacity = business.max_daily_appointments ?? 0;
    if (maxCapacity > 0 && dateAppointments.length >= maxCapacity) {
      setFormError(`⚠️ تکمیل ظرفیت: سقف نوبت‌دهی کسب‌وکار برای تاریخ ${isoToAfghaniDate(selectedDate)} (${maxCapacity} نوبت) تکمیل گردیده است.`);
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
      customer_phone: customerPhone.trim() || null,
      queue_number: newQueueNum,
      status: 'waiting',
      estimated_wait_minutes: estimatedWaitTime,
      appointment_date: selectedDate,
    });

    if (error || !newApp) {
      setFormError(`ثبت نوبت انجام نشد: لطفاً دوباره تلاش کنید.`);
    } else {
      saveAppointmentToLocalStorage(business.id, newApp);
      // Optimistic update — Real-Time will also fire but we update instantly
      setAppointments(prev => [...prev, newApp]);
      setShowBookingForm(false);
      setCustomerName('');
      setCustomerPhone('');
      setActionAlert({ type: 'success', text: `نوبت شماره #${newQueueNum} برای ${isoToAfghaniDate(selectedDate)} با موفقیت ثبت شد.` });
    }

    setSubmitting(false);
  };

  // ─── Cancel Appointment ───────────────────────────────────────────────────
  const handleCancelAppointment = async (appId: string, queueNum: number) => {
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
  };

  // ─── Download Ticket Image ────────────────────────────────────────────────
  const handleDownloadImage = () => {
    if (!selectedAppointment || !business) return;
    const chosenService = services.find(s => s.id === selectedAppointment.service_id) || selectedAppointment.service || selectedService;
    const chosenStaff = staffList.find(s => s.id === selectedAppointment.staff_id) || selectedAppointment.staff;
    const aheadCount = dateAppointments.filter(a => a.status === 'waiting' && a.queue_number < selectedAppointment.queue_number).length;
    const avgDuration = chosenService ? chosenService.duration_minutes : 20;
    downloadTicketImage({
      appointment: selectedAppointment,
      business: { name: business.name, description: business.description, phone: business.phone, address: business.address },
      serviceName: chosenService?.name || null,
      staffName: chosenStaff?.name || null,
      peopleAhead: aheadCount,
      estimatedWaitMinutes: aheadCount * avgDuration,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
          <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          در حال بارگذاری اطلاعات...
        </div>
      </div>
    );
  }

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
  const maxCapacity = business.max_daily_appointments ?? 0;
  const capacityFull = maxCapacity > 0 && dateAppointments.length >= maxCapacity;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-12">
      {/* Public Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-transparent.png" alt="نوبتک" className="h-9 w-auto object-contain" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              زنده
            </span>
            {myAppointments.length > 0 && (
              <Badge variant="blue" className="text-[11px] font-bold">{myAppointments.length} نوبت فعال</Badge>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl w-full mx-auto px-4 py-6 space-y-6">
        {/* Action Alert */}
        {actionAlert && (
          <div className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
            actionAlert.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}>
            <span>{actionAlert.text}</span>
            <button onClick={() => setActionAlert(null)} className="text-sm font-bold opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Business Branding Card */}
        <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 text-white rounded-3xl p-6 sm:p-8 shadow-xl shadow-blue-600/15 relative overflow-hidden space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-3xl font-extrabold border border-white/20 shrink-0">
              {business.logo_url || business.name.charAt(0)}
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold">{business.name}</h1>
              {business.description && (
                <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed max-w-xl">{business.description}</p>
              )}
            </div>
          </div>
          {(business.address || business.phone) && (
            <div className="pt-3 border-t border-white/10 flex flex-wrap gap-4 text-xs text-blue-100">
              {business.address && <span>📍 {business.address}</span>}
              {business.phone && <span className="dir-ltr text-right font-mono">📞 {business.phone}</span>}
            </div>
          )}
        </div>

        {/* DATE SELECTION BAR */}
        <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800 px-1">
            <span className="flex items-center gap-1.5">
              <span>📅</span>
              <span>انتخاب تاریخ نوبت‌دهی:</span>
            </span>
            <span className="flex items-center gap-2">
              {dateLoading && (
                <svg className="animate-spin h-3.5 w-3.5 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              )}
              <span className="text-blue-600 font-bold text-xs">{isoToAfghaniDate(selectedDate)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {upcomingDays.map((day) => (
              <button
                key={day.isoDate}
                onClick={() => handleDateChange(day.isoDate)}
                disabled={dateLoading}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer disabled:opacity-60 ${
                  selectedDate === day.isoDate
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                }`}
              >
                {day.label}
              </button>
            ))}

            <div className="shrink-0 flex items-center gap-1 bg-slate-100 px-2.5 py-1.5 rounded-xl border border-slate-200">
              <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">تقویم:</span>
              <AfghanDatePicker min={todayStr} value={selectedDate} onChange={handleDateChange} />
            </div>
          </div>
        </div>

        {/* Live Queue Summary Cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-blue-200 p-4 text-center shadow-xs">
            <span className="text-[11px] font-bold text-blue-600 block">نوبت جاری</span>
            <span className="text-2xl sm:text-3xl font-black text-blue-900 font-mono mt-1 block">
              {servingAppointment ? `#${servingAppointment.queue_number}` : '—'}
            </span>
            <span className="text-[10px] text-blue-500 font-medium mt-1 block">در حال خدمت</span>
          </div>

          <div className="bg-white rounded-2xl border border-amber-200 p-4 text-center shadow-xs">
            <span className="text-[11px] font-bold text-amber-600 block">
              {!showBookingForm && selectedAppointment ? 'افراد قبل از شما' : 'افراد در صف'}
            </span>
            <span className="text-2xl sm:text-3xl font-black text-amber-900 font-mono mt-1 block">
              {!showBookingForm && selectedAppointment ? peopleAheadCount : waitingAppointments.length}
            </span>
            <span className="text-[10px] text-amber-600 font-medium mt-1 block">نوبت در انتظار</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-xs">
            <span className="text-[11px] font-bold text-slate-600 block">زمان انتظار</span>
            <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono mt-1 block">~{estimatedWaitTime}</span>
            <span className="text-[10px] text-slate-500 font-medium mt-1 block">دقیقه</span>
          </div>
        </div>

        {/* SCREEN A: Active Ticket View */}
        {!showBookingForm && selectedAppointment ? (
          <Card className="border-blue-200 bg-gradient-to-b from-blue-50/40 via-white to-white shadow-xl overflow-hidden">
            <CardHeader className="text-center pb-4 border-b border-slate-100">
              {myAppointments.length > 1 && (
                <div className="mb-4 flex items-center justify-center gap-2 overflow-x-auto pb-1">
                  <span className="text-xs text-slate-500 font-medium ml-1">نوبت‌های شما:</span>
                  {myAppointments.map(app => (
                    <button
                      key={app.id}
                      onClick={() => setActiveTicketId(app.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTicketId === app.id ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      #{app.queue_number} ({app.customer_name})
                    </button>
                  ))}
                </div>
              )}

              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl font-black mb-2 animate-bounce">✓</div>
              <Badge variant="emerald" className="mx-auto">نوبت شما برای {isoToAfghaniDate(selectedAppointment.appointment_date || selectedDate)} فعال است</Badge>
              <CardTitle className="text-xl sm:text-2xl mt-2 font-extrabold text-slate-900">رسید آنلاین نوبتک</CardTitle>
              <CardDescription className="text-xs">
                مشتری گرامی <strong className="text-slate-900">{selectedAppointment.customer_name}</strong>، رسید نوبت شما برای <strong className="font-bold text-blue-700">{isoToAfghaniDate(selectedAppointment.appointment_date || selectedDate)}</strong>:
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6 pt-6">
              <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white rounded-3xl p-6 text-center shadow-lg shadow-blue-600/20 space-y-2">
                <span className="text-xs text-blue-100 font-medium block">شماره نوبت اختصاصی روز {isoToAfghaniDate(selectedAppointment.appointment_date || selectedDate)}</span>
                <div className="text-6xl font-black font-mono tracking-wider">#{selectedAppointment.queue_number}</div>
                {selectedAppointment.service && (
                  <span className="text-xs font-semibold bg-white/15 px-3 py-1 rounded-full inline-block mt-2">
                    🏷️ {selectedAppointment.service.name}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block">نوبت فعلی سیستم</span>
                  <span className="text-lg font-extrabold text-blue-600 font-mono mt-1 block">
                    {servingAppointment ? `#${servingAppointment.queue_number}` : '—'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block">افراد قبل از شما</span>
                  <span className="text-lg font-extrabold text-amber-600 font-mono mt-1 block">{peopleAheadCount} نفر</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block">زمان تقریبی انتظار</span>
                  <span className="text-sm font-extrabold text-slate-800 font-mono mt-1 block">
                    {peopleAheadCount === 0 ? 'اولین نوبت روز' : `حدود ${peopleAheadCount * serviceDuration} دقیقه`}
                  </span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 text-xs text-amber-900 flex items-center gap-3">
                <span className="text-2xl">📱</span>
                <div className="space-y-0.5">
                  <strong className="block text-amber-950 font-bold">اطلاعات نوبت به‌صورت زنده به‌روز می‌شود</strong>
                  <p className="text-[11px] text-amber-800">وضعیت نوبت به صورت لحظه‌ای آپدیت می‌شود — بدون نیاز به رفرش صفحه.</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Button
                  onClick={handleDownloadImage}
                  size="lg"
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm shadow-md shadow-blue-500/20 py-3.5"
                >
                  📸 دانلود رسید به صورت عکس (تصویر)
                </Button>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button variant="outline" onClick={() => { setFormError(null); setShowBookingForm(true); }} className="text-xs font-bold py-2.5">
                    + ثبت نوبت جدید (برای روز دیگر یا دیگری)
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleCancelAppointment(selectedAppointment.id, selectedAppointment.queue_number)}
                    isLoading={cancellingId === selectedAppointment.id}
                    className="text-xs font-bold text-rose-600 border-rose-200 hover:bg-rose-50 py-2.5"
                  >
                    🗑️ انصراف و حذف این نوبت
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
                <Button size="sm" variant="outline" onClick={() => setShowBookingForm(false)} className="text-xs font-bold shrink-0">
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
                    <label className="block text-xs font-bold text-slate-800">۲. انتخاب ارائه‌دهنده خدمت (اختیاری)</label>
                    <select
                      value={selectedStaffId}
                      onChange={(e) => setSelectedStaffId(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">فرقی نمی‌کند (اولین ارائه‌دهنده آزاد)</option>
                      {staffList.map(st => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <Input
                    label="نام و نام خانوادگی مشتری *"
                    placeholder="مثلاً: علی محمدی"
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
                {capacityFull && (
                  <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs text-rose-800 text-center font-medium space-y-1">
                    <strong className="block font-bold text-sm text-rose-900">⚠️ تکمیل ظرفیت پذیرش نوبت برای این روز</strong>
                    <p>سقف پذیرش برای تاریخ <span className="font-mono font-bold">{isoToAfghaniDate(selectedDate)}</span> تکمیل شده است. لطفاً از نوار بالا تاریخ دیگری انتخاب کنید.</p>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full mt-3 font-bold text-sm" isLoading={submitting} disabled={capacityFull}>
                  {capacityFull
                    ? 'ظرفیت نوبت‌دهی این روز تکمیل است'
                    : `تایید و دریافت شماره نوبت روز ${selectedDayInfo ? selectedDayInfo.dayName : isoToAfghaniDate(selectedDate)}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        قدرت گرفته از سیستم مدیریت نوبت‌دهی آنلاین <strong className="text-slate-600">نوبتک</strong>
      </footer>
    </div>
  );
}
