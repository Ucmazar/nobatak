'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DashboardAccessReport } from '@/lib/dashboard-access';
import { supabase } from '@/lib/supabase/client';
import { Business, Service, Staff, Appointment, AppointmentStatus, Profile } from '@/types/database';
import { slugify, isValidUUID } from '@/lib/utils';
import { getUserProfile, upsertUserProfile } from '@/lib/services/profile';
import { getUserBusinesses, createBusiness, updateBusiness, deleteBusiness } from '@/lib/services/businesses';
import { getBusinessServices, createService, updateService, deleteService } from '@/lib/services/services';
import { getBusinessStaff, createStaff, updateStaff, deleteStaff } from '@/lib/services/staff';
import { getBusinessAppointments, createAppointment, updateAppointmentStatus, deleteAppointment } from '@/lib/services/appointments';
import { downloadTicketImage } from '@/lib/ticketImage';

import { usePendingActions } from '@/lib/use-pending-actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { QueueStatus } from '@/components/ui/QueueStatus';
import { StaffAppointmentTables } from '@/components/ui/StaffAppointmentTables';
import { queueAhead } from '@/lib/queue';
import { BusinessQRCode } from '@/components/ui/BusinessQRCode';
import { AfghanDatePicker } from '@/components/ui/AfghanDatePicker';
import { getUpcomingDaysAfghani, isoToAfghaniDate, getKabulTodayISO } from '@/lib/afghaniMonths';

export default function DashboardPage() {
  const router = useRouter();
  const { pending, runAction, isPending } = usePendingActions();

  const todayStr = getKabulTodayISO();
  const upcomingDays = getUpcomingDaysAfghani(7);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Business State
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);

  const businessLimit = profile?.max_businesses === undefined ? 1 : profile.max_businesses;
  const canCreateBusiness = businessLimit === null || businesses.length < businessLimit;

  // Active Tab
  const [activeTab, setActiveTab] = useState<'queue' | 'services' | 'staff' | 'settings'>('queue');

  // Feedback Notification Toast
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Business Modals & Forms
  const [isBizModalOpen, setIsBizModalOpen] = useState(false);
  const [bizName, setBizName] = useState('');
  const [bizCategory, setBizCategory] = useState('barbershop');
  const [bizSlug, setBizSlug] = useState('');
  const [bizPhone, setBizPhone] = useState('');
  const [bizAddress, setBizAddress] = useState('');
  const [bizDescription, setBizDescription] = useState('');
  const [bizLogoUrl, setBizLogoUrl] = useState('');
  const [bizSaving, setBizSaving] = useState(false);
  const [bizFormError, setBizFormError] = useState<string | null>(null);

  // Services State & Modals
  const [services, setServices] = useState<Service[]>([]);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceDuration, setServiceDuration] = useState('20');
  const [serviceSaving, setServiceSaving] = useState(false);

  // Staff State & Modals
  const [staffMembers, setStaffMembers] = useState<Staff[]>([]);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffName, setStaffName] = useState('');
  const [staffCapacity, setStaffCapacity] = useState('20');
  const [staffSaving, setStaffSaving] = useState(false);

  // Appointments State & Modals
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [hiddenStaffIds, setHiddenStaffIds] = useState<string[]>([]);
  const [appointmentFilter, setAppointmentFilter] = useState<'all' | 'waiting' | 'serving' | 'completed' | 'cancelled'>('all');
  const [isAddAppointmentModalOpen, setIsAddAppointmentModalOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [appointmentSaving, setAppointmentSaving] = useState(false);

  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);

  // Load ALL business data (services + staff + appointments). Used on initial load / business switch.
  const selectedDateRef = React.useRef<string>(todayStr);
  React.useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // Stable ref for selected business (used inside realtime callback)
  const selectedBusinessRef = React.useRef<Business | null>(null);
  React.useEffect(() => { selectedBusinessRef.current = selectedBusiness; }, [selectedBusiness]);

  // Load ALL business data (services + staff + appointments). Used on initial load / business switch.
  const loadBusinessDetails = useCallback(async (businessId: string, date: string) => {
    if (!isValidUUID(businessId)) return;
    try {
      const [srvData, stData, appData] = await Promise.all([
        getBusinessServices(businessId),
        getBusinessStaff(businessId),
        getBusinessAppointments(businessId, date, true),
      ]);
      if (selectedBusinessRef.current?.id !== businessId || selectedBusinessRef.current?.is_active === false) return;
      setServices(srvData);
      setStaffMembers(stData);
      if (selectedDateRef.current === date) { setAppointments(appData); setDataError(null); }
    } catch (err) {
      if (selectedBusinessRef.current?.id === businessId && selectedDateRef.current === date) setDataError(err instanceof Error ? err.message : 'دریافت اطلاعات ممکن نشد. لطفاً دوباره تلاش کنید.');
    }
  }, []);

  // Load ONLY appointments for a date. Used on date switch — no full re-init.
  const loadAppointmentsOnly = useCallback(async (businessId: string, date: string) => {
    if (!isValidUUID(businessId)) return;
    try {
      const appData = await getBusinessAppointments(businessId, date, true);
      if (selectedBusinessRef.current?.id === businessId && selectedBusinessRef.current?.is_active !== false && selectedDateRef.current === date) { setAppointments(appData); setDataError(null); }
    } catch (err) {
      if (selectedBusinessRef.current?.id === businessId && selectedDateRef.current === date) setDataError(err instanceof Error ? err.message : 'دریافت نوبت‌ها ممکن نشد. اتصال اینترنت را بررسی کنید.');
    }
  }, []);

  // Receive fresh business statuses and quota from the existing access poll.
  useEffect(() => {
    function refreshAccess(event: Event) {
      const report = (event as CustomEvent<DashboardAccessReport>).detail;
      if (report.access !== 'allowed' || !report.businesses) return;
      setProfile(previous => previous ? { ...previous, max_businesses: report.maxBusinesses } : previous);
      const statuses = new Map(report.businesses.map(b => [b.id, b.is_active]));
      setBusinesses(previous => previous.map(b => statuses.has(b.id) ? { ...b, is_active: statuses.get(b.id) } : b));
      const selected = selectedBusinessRef.current;
      if (!selected || !statuses.has(selected.id)) return;
      const active = statuses.get(selected.id);
      if (active !== selected.is_active) {
        const updated = { ...selected, is_active: active };
        selectedBusinessRef.current = updated;
        setSelectedBusiness(updated);
        if (active === false) {
          setServices([]); setStaffMembers([]); setAppointments([]);
          setIsServiceModalOpen(false); setIsStaffModalOpen(false); setIsAddAppointmentModalOpen(false);
        } else { void loadBusinessDetails(selected.id, selectedDateRef.current); }
      }
    }
    window.addEventListener('nobatak-access-updated', refreshAccess);
    return () => window.removeEventListener('nobatak-access-updated', refreshAccess);
  }, [loadBusinessDetails]);

  // Check auth user session and load profile & businesses from Supabase
  // NOTE: selectedDate is NOT a dependency — changing date must NOT trigger full re-init
  useEffect(() => {
    async function initDashboard() {
      let redirectingToAdmin = false;
      try {
        setLoading(true);
        const { data: { user: currentUser }, error: authErr } = await supabase.auth.getUser();

        if (authErr || !currentUser) {
          router.push('/login');
          return;
        }

        setUser(currentUser);

        const userProf = await getUserProfile(currentUser.id) ?? await upsertUserProfile({
          id: currentUser.id,
          full_name: currentUser.user_metadata?.full_name || currentUser.email || '',
        });

        if (userProf && userProf.is_active === false) {
          await supabase.auth.signOut();
          document.cookie = 'sb-access-token=; path=/; max-age=0;';
          alert('حساب کاربری شما غیرفعال شده است. لطفاً با مدیر سیستم تماس بگیرید.');
          router.push('/login');
          return;
        }

        if (userProf?.role === 'superadmin') {
          redirectingToAdmin = true;
          router.replace('/admin');
          return;
        }

        setProfile(userProf);

        const userBizList = await getUserBusinesses(currentUser.id);
        setBusinesses(userBizList);

        if (userBizList.length > 0) {
          const firstBiz = userBizList.find(b => b.is_active !== false) ?? userBizList[0];
          setSelectedBusiness(firstBiz);
          selectedBusinessRef.current = firstBiz;
          // Use todayStr (stable) — not selectedDate — to avoid stale closure on mount
          if (firstBiz.is_active !== false) await loadBusinessDetails(firstBiz.id, todayStr);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        router.push('/login');
      } finally {
        if (!redirectingToAdmin) setLoading(false);
      }
    }

    initDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]); // selectedDate intentionally excluded — date changes handled by handleDateChange

  // Realtime gives immediate updates; polling recovers missed events and disconnected sockets.
  const watchedBusinessId = selectedBusiness?.id;
  const watchedBusinessActive = selectedBusiness?.is_active !== false;
  useEffect(() => {
    if (!watchedBusinessId || !watchedBusinessActive) return;
    let disposed = false;
    let running = false;
    let pending = false;
    const refresh = async () => {
      if (disposed || document.visibilityState === 'hidden') return;
      if (running) { pending = true; return; }
      running = true;
      try {
        do {
          pending = false;
          await loadAppointmentsOnly(watchedBusinessId, selectedDateRef.current);
        } while (pending && !disposed);
      } finally { running = false; }
    };
    const channel = supabase.channel('dashboard:rt:' + watchedBusinessId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, payload => {
        const row = payload.new as Partial<Appointment>;
        // DELETE events may not contain business_id, so refresh the selected business.
        if (!row.business_id || row.business_id === watchedBusinessId) void refresh();
      })
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const timer = window.setInterval(() => { void refresh(); }, 3000);
    const resume = () => { void refresh(); };
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    void refresh();
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
      void supabase.removeChannel(channel);
    };
  }, [watchedBusinessId, watchedBusinessActive, loadAppointmentsOnly]);

  // Handle selecting another business
  const handleSelectBusiness = async (biz: Business) => {
    setHiddenStaffIds([]);
    setSelectedBusiness(biz);
    selectedBusinessRef.current = biz;
    if (biz.is_active !== false) await loadBusinessDetails(biz.id, selectedDateRef.current);
  };

  // Handle date tab click — lightweight: only reload appointments, NO full re-init
  const handleDateChange = async (newDate: string) => {
    if (newDate === selectedDate) return;
    setAppointments([]);
    setSelectedDate(newDate);
    selectedDateRef.current = newDate;
    if (selectedBusiness) {
      await loadAppointmentsOnly(selectedBusiness.id, newDate);
    }
  };

  // Create Business in Supabase
  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    return runAction('business-form', async () => {
      try {
        if (!user) {
          setBizFormError('لطفاً ابتدا وارد حساب کاربری خود شوید.');
          return;
        }

        if (!canCreateBusiness) {
          setBizFormError('به سقف مجاز تعداد کسب‌وکار رسیده‌اید. برای افزایش سقف با مدیر سیستم تماس بگیرید.');
          return;
        }

        const trimmedName = bizName.trim();
        if (!trimmedName) {
          setBizFormError('لطفاً نام کسب‌وکار را وارد کنید.');
          return;
        }

        setBizSaving(true);
        setBizFormError(null);

        let candidateSlug = bizSlug.trim() || trimmedName;
        let cleanSlug = slugify(candidateSlug);

        if (!cleanSlug) {
          cleanSlug = `biz-${Date.now().toString(36)}`;
        }

        const { business: newBiz, error } = await createBusiness({
          owner_id: user.id,
          name: trimmedName,
          category: bizCategory,
          slug: cleanSlug,
          phone: bizPhone || null,
          address: bizAddress || null,
          description: bizDescription || null,
          logo_url: bizLogoUrl || null,
        });

        if (error || !newBiz) {
          setBizFormError(`ذخیره انجام نشد: لطفاً دوباره تلاش کنید.`);
          setBizSaving(false);
          return;
        }

        setBusinesses([newBiz, ...businesses]);
        selectedBusinessRef.current = newBiz;
        setSelectedBusiness(newBiz);
        await loadBusinessDetails(newBiz.id, selectedDate);

        setIsBizModalOpen(false);
        resetBizForm();
        setBizSaving(false);
        setAlertMsg({ type: 'success', text: 'کسب‌وکار جدید با موفقیت ثبت شد.' });
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
      finally { setBizSaving(false); }
    });
  };

  const resetBizForm = () => {
    setBizName('');
    setBizCategory('barbershop');
    setBizSlug('');
    setBizPhone('');
    setBizAddress('');
    setBizDescription('');
    setBizLogoUrl('');
    setBizFormError(null);
  };

  // Update Business Settings in Supabase
  const handleUpdateBusinessSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    return runAction('business-form', async () => {
      try {
        if (!selectedBusiness) return;

        setBizSaving(true);
        const { business: updated, error } = await updateBusiness(selectedBusiness.id, {
          name: selectedBusiness.name,
          description: selectedBusiness.description,
          logo_url: selectedBusiness.logo_url,
          phone: selectedBusiness.phone,
          address: selectedBusiness.address,
          opening_time: selectedBusiness.opening_time,
          closing_time: selectedBusiness.closing_time,
        });

        if (error || !updated) {
          setAlertMsg({ type: 'error', text: (error === 'تنظیم ظرفیت هنوز در پایگاه داده تکمیل نشده است.' || error === 'تنظیم ساعت کاری هنوز در پایگاه داده تکمیل نشده است.') ? error : 'ذخیرهٔ تنظیمات انجام نشد. دوباره تلاش کنید.' });
        } else {
          setBusinesses(businesses.map(b => b.id === updated.id ? updated : b));
          setSelectedBusiness(updated);
          setAlertMsg({ type: 'success', text: 'اطلاعات کسب‌وکار به‌روز شد.' });
        }
        setBizSaving(false);
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
      finally { setBizSaving(false); }
    });
  };

  // Delete Business from Supabase
  const handleDeleteBusiness = async () => {
    return runAction('business-form', async () => {
      try {
        if (!selectedBusiness || !confirm('آیا از حذف این کسب‌وکار و تمام اطلاعات مرتبط با آن اطمینان دارید؟')) return;

        const { success, error } = await deleteBusiness(selectedBusiness.id);
        if (!success) {
          setAlertMsg({ type: 'error', text: `خطا در حذف کسب‌وکار: لطفاً دوباره تلاش کنید.` });
        } else {
          const remaining = businesses.filter(b => b.id !== selectedBusiness.id);
          setBusinesses(remaining);
          if (remaining.length > 0) {
            selectedBusinessRef.current = remaining[0];
            setSelectedBusiness(remaining[0]);
            loadBusinessDetails(remaining[0].id, selectedDate);
          } else {
            setSelectedBusiness(null);
            setServices([]);
            setStaffMembers([]);
            setAppointments([]);
          }
          setAlertMsg({ type: 'success', text: 'کسب‌وکار با موفقیت حذف شد.' });
        }
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  // Service CRUD operations
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    return runAction(editingService ? 'service:' + editingService.id : 'service-new', async () => {
      try {
        if (!serviceName || !selectedBusiness) return;

        setServiceSaving(true);
        const duration = parseInt(serviceDuration) || 15;

        if (editingService) {
          const { service: updated, error } = await updateService(editingService.id, {
            name: serviceName,
            description: serviceDescription,
            duration_minutes: duration,
          });

          if (error || !updated) {
            setAlertMsg({ type: 'error', text: `خطا در ویرایش خدمت: لطفاً دوباره تلاش کنید.` });
          } else {
            setServices(previous => previous.map(s => s.id === updated.id ? updated : s));
            setAlertMsg({ type: 'success', text: 'خدمت با موفقیت ویرایش شد.' });
          }
        } else {
          const { service: newSrv, error } = await createService({
            business_id: selectedBusiness.id,
            name: serviceName,
            description: serviceDescription,
            duration_minutes: duration,
            is_active: true,
          });

          if (error || !newSrv) {
            setAlertMsg({ type: 'error', text: `خطا در ایجاد خدمت: لطفاً دوباره تلاش کنید.` });
          } else {
            setServices(previous => [...previous.filter(s => s.id !== newSrv.id), newSrv]);
            setAlertMsg({ type: 'success', text: 'خدمت جدید ثبت شد.' });
          }
        }

        setServiceSaving(false);
        setIsServiceModalOpen(false);
        setEditingService(null);
        setServiceName('');
        setServiceDescription('');
        setServiceDuration('20');
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
      finally { setServiceSaving(false); }
    });
  };

  const handleToggleServiceActive = async (service: Service) => {
    return runAction('service:' + service.id, async () => {
      try {
        const newStatus = !service.is_active;
        const { service: updated, error } = await updateService(service.id, { is_active: newStatus });
        if (error || !updated) {
          setAlertMsg({ type: 'error', text: `خطا در تغییر وضعیت خدمت: لطفاً دوباره تلاش کنید.` });
        } else {
          setServices(previous => previous.map(s => s.id === updated.id ? updated : s));
        }
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  const handleDeleteServiceItem = async (serviceId: string) => {
    return runAction('service:' + serviceId, async () => {
      try {
        if (!confirm('آیا از حذف این خدمت اطمینان دارید؟')) return;
        const { success, error } = await deleteService(serviceId);
        if (success) {
          setServices(previous => previous.filter(s => s.id !== serviceId));
          setAlertMsg({ type: 'success', text: 'خدمت حذف شد.' });
        } else {
          setAlertMsg({ type: 'error', text: `خطا در حذف خدمت: لطفاً دوباره تلاش کنید.` });
        }
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  // Staff CRUD operations
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    return runAction(editingStaff ? 'staff:' + editingStaff.id : 'staff-new', async () => {
      try {
        if (!staffName || !selectedBusiness) return;

        const capacity = Number(staffCapacity);
        if (!staffCapacity.trim() || !Number.isInteger(capacity) || capacity < 0 || capacity > 2147483647) { setAlertMsg({ type: 'error', text: 'ظرفیت باید عدد صحیح صفر یا بیشتر باشد.' }); return; }
        setStaffSaving(true);

        if (editingStaff) {
          const { staff: updated, error } = await updateStaff(editingStaff.id, { name: staffName, max_daily_appointments: capacity });
          if (error || !updated) {
            setAlertMsg({ type: 'error', text: `خطا در ویرایش کارمند: لطفاً دوباره تلاش کنید.` });
          } else {
            setStaffMembers(previous => previous.map(st => st.id === updated.id ? updated : st));
            setAlertMsg({ type: 'success', text: 'نام کارمند به روزرسانی شد.' });
          }
        } else {
          const { staff: newSt, error } = await createStaff({
            business_id: selectedBusiness.id,
            name: staffName,
            max_daily_appointments: capacity,
            is_active: true,
          });

          if (error || !newSt) {
            setAlertMsg({ type: 'error', text: `خطا در ثبت کارمند: لطفاً دوباره تلاش کنید.` });
          } else {
            setStaffMembers(previous => [...previous.filter(st => st.id !== newSt.id), newSt]);
            setAlertMsg({ type: 'success', text: 'کارمند جدید ثبت شد.' });
          }
        }

        setStaffSaving(false);
        setIsStaffModalOpen(false);
        setEditingStaff(null);
        setStaffName(''); setStaffCapacity('20');
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
      finally { setStaffSaving(false); }
    });
  };

  const handleToggleStaffActive = async (st: Staff) => {
    return runAction('staff:' + st.id, async () => {
      try {
        const newStatus = !st.is_active;
        const { staff: updated, error } = await updateStaff(st.id, { is_active: newStatus });
        if (error || !updated) {
          setAlertMsg({ type: 'error', text: `خطا در تغییر وضعیت پرسنل: لطفاً دوباره تلاش کنید.` });
        } else {
          setStaffMembers(previous => previous.map(s => s.id === updated.id ? updated : s));
        }
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  const handleDeleteStaffItem = async (staffId: string) => {
    return runAction('staff:' + staffId, async () => {
      try {
        if (!confirm('آیا از حذف این پرسنل اطمینان دارید؟')) return;
        const { success, error } = await deleteStaff(staffId);
        if (success) {
          setStaffMembers(previous => previous.filter(st => st.id !== staffId));
          setAlertMsg({ type: 'success', text: 'پرونده کارمند حذف شد.' });
        } else {
          setAlertMsg({ type: 'error', text: `خطا در حذف کارمند: لطفاً دوباره تلاش کنید.` });
        }
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  // Appointment Operations
  const handleStatusChange = async (id: string, newStatus: AppointmentStatus) => {
    return runAction('appointment:' + id, async () => {
      try {
        const { success, error, warning } = await updateAppointmentStatus(id, newStatus);
        if (!success) {
          setAlertMsg({ type: 'error', text: `خطا در به روزرسانی وضعیت نوبت: لطفاً دوباره تلاش کنید.` });
        } else {
          setAppointments(previous => previous.map(a => a.id === id ? { ...a, status: newStatus } : a));
          setAlertMsg({ type: warning ? 'error' : 'success', text: warning || 'وضعیت نوبت به روز شد.' });
        }
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  const handleDeleteAppointmentItem = async (appId: string) => {
    return runAction('appointment:' + appId, async () => {
      try {
        if (!confirm('آیا از حذف این نوبت اطمینان دارید؟')) return;
        const { success, error } = await deleteAppointment(appId);
        if (success) {
          setAppointments(previous => previous.filter(a => a.id !== appId));
          setAlertMsg({ type: 'success', text: 'نوبت حذف شد.' });
        } else {
          setAlertMsg({ type: 'error', text: `خطا در حذف نوبت: لطفاً دوباره تلاش کنید.` });
        }
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  // Download ticket image for walk-in appointment from Owner Dashboard
  const handleOwnerDownloadTicket = (app: Appointment) => {
    return runAction('appointment:' + app.id, async () => {
      try {
        if (!selectedBusiness) return;
        const srv = services.find(s => s.id === app.service_id) || app.service;
        const st = staffMembers.find(s => s.id === app.staff_id) || app.staff;
        const aheadCount = queueAhead(appointments, app.appointment_date, app.staff_id, app.queue_number);
        const duration = srv ? srv.duration_minutes : 20;

        downloadTicketImage({
          appointment: app,
          business: {
            name: selectedBusiness.name,
            description: selectedBusiness.description,
            phone: selectedBusiness.phone,
            address: selectedBusiness.address,
          },
          serviceName: srv?.name || null,
          staffName: st?.name || null,
          peopleAhead: aheadCount,
          estimatedWaitMinutes: aheadCount * duration,
        });
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  // Create Walk-in Appointment from Owner Dashboard for SELECTED DATE
  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    return runAction('appointment-new', async () => {
      try {
        if (!custName || !selectedBusiness) return;

        setAppointmentSaving(true);
        // Queue number is scoped for the selected date!
        const nextQueueNum = appointments.length > 0 ? Math.max(...appointments.map(a => a.queue_number)) + 1 : 1;
        const selectedSrv = services.find(s => s.id === selectedServiceId) || services[0] || null;
        const selectedSt = staffMembers.find(s => s.id === selectedStaffId) || staffMembers[0] || null;

        const waitingCount = appointments.filter(a => a.status === 'waiting').length;
        const avgDuration = selectedSrv ? selectedSrv.duration_minutes : 20;
        const estWait = waitingCount * avgDuration;

        const { appointment: newApp, error } = await createAppointment({
          business_id: selectedBusiness.id,
          service_id: selectedSrv?.id || null,
          staff_id: selectedSt?.id || null,
          customer_name: custName,
          customer_phone: custPhone || null,
          queue_number: nextQueueNum,
          status: 'waiting',
          estimated_wait_minutes: estWait,
          appointment_date: selectedDate,
        });

        if (error || !newApp) {
          setAlertMsg({ type: 'error', text: `ثبت نوبت انجام نشد: لطفاً دوباره تلاش کنید.` });
        } else {
          if (selectedBusinessRef.current?.id === newApp.business_id && selectedDateRef.current === newApp.appointment_date) setAppointments(previous => [...previous.filter(a => a.id !== newApp.id), newApp]);
          setIsAddAppointmentModalOpen(false);
          setCustName('');
          setCustPhone('');
          setAlertMsg({ type: 'success', text: `نوبت شماره #${nextQueueNum} برای تاریخ ${isoToAfghaniDate(selectedDate)} با موفقیت ذخیره شد.` });
        }
        setAppointmentSaving(false);
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
      finally { setAppointmentSaving(false); }
    });
  };

  const handleLogout = async () => {
    return runAction('logout', async () => {
      try {
        await supabase.auth.signOut();
        document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        router.push('/login');
      } catch {
        setAlertMsg({ type: 'error', text: 'عملیات انجام نشد. لطفاً دوباره تلاش کنید.' });
      }
    });
  };

  // Display Name of Logged-in User
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email || 'کاربر گرامی';

  // Queue Calculations for selected date
  const dateAppointments = appointments.filter(a => a.appointment_date === selectedDate);
  const currentServingApp = dateAppointments.find(a => a.status === 'serving');
  const waitingAppointments = dateAppointments.filter(a => a.status === 'waiting');
  const completedAppointments = dateAppointments.filter(a => a.status === 'completed');
  const avgDuration = services.length > 0 ? services[0].duration_minutes : 20;
  const estWaitNewJoiner = waitingAppointments.length * avgDuration;

  const staffAppointments = dateAppointments.filter(a => !hiddenStaffIds.includes(a.staff_id || 'unassigned'));
  const filteredAppointments = staffAppointments.filter(a => {
    if (appointmentFilter === 'all') return true;
    return a.status === appointmentFilter;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
          <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          در حال آماده‌سازی داشبورد…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <img src="/logo-transparent.png" alt="نوبتک" className="h-10 w-auto object-contain" />
            </Link>

            {/* <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hidden sm:inline-flex">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              به‌روز
            </span> */}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-600 font-medium">
              سلام، <strong className="text-slate-900 font-bold">{displayName} 👋</strong>
            </span>

            {/* Business Switcher Dropdown */}
            {businesses.length > 0 && selectedBusiness && (
              <select
                disabled={pending.size > 0}
                value={selectedBusiness.id}
                onChange={(e) => {
                  const b = businesses.find(item => item.id === e.target.value);
                  if (b) handleSelectBusiness(b);
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl px-3 py-2 border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
              >
                {businesses.map(b => (
                  <option key={b.id} value={b.id}>{b.name}{b.is_active === false ? ' (غیرفعال)' : ''}</option>
                ))}
              </select>
            )}

            <Button
              size="sm"
              variant="outline"
              disabled={!canCreateBusiness} onClick={() => setIsBizModalOpen(true)}
              className="text-xs hidden sm:inline-flex"
            >
              + کسب‌وکار جدید
            </Button>

            <Button variant="outline" size="sm" isLoading={isPending('logout')} onClick={handleLogout} className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50">
              خروج
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-4 text-xs text-slate-600" role="status">
        کسب‌وکارهای شما: {businesses.length} / {businessLimit === null ? 'نامحدود' : businessLimit}
        {!canCreateBusiness && <span className="mr-2 text-amber-700">برای ایجاد کسب‌وکار جدید، از مدیر بخواهید سقف شما را افزایش دهد.</span>}
      </div>
      {dataError && <div role="alert" className="mx-auto w-full max-w-7xl px-4 pt-4"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{dataError}<button type="button" className="mr-3 font-bold underline" onClick={() => { if (selectedBusiness) void loadBusinessDetails(selectedBusiness.id, selectedDate); }}>تلاش دوباره</button></div></div>}
      {/* Global Notification Toast */}
      {alertMsg && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div
            className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
              alertMsg.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <span>{alertMsg.text}</span>
            <button onClick={() => setAlertMsg(null)} className="text-sm font-bold opacity-60 hover:opacity-100">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* If user has no businesses yet */}
        {businesses.length === 0 ? (
          <Card className="text-center py-16 border-dashed border-2">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 text-3xl">
              🏪
            </div>
            <CardTitle className="text-xl">هنوز هیچ کسب‌وکاری ثبت نکرده‌اید</CardTitle>
            <CardDescription className="max-w-md mx-auto mt-2 text-xs">
              با افزودن اولین کسب‌وکار، لینک اختصاصی نوبت‌گیری آنلاین شما آماده می‌شود.
            </CardDescription>
            <Button className="mt-6" disabled={!canCreateBusiness} onClick={() => setIsBizModalOpen(true)}>
              + ساخت اولین کسب‌وکار
            </Button>
          </Card>
        ) : selectedBusiness?.is_active === false ? (
          <Card className="p-8 text-center border-amber-200 bg-amber-50">
            <CardTitle>کسب‌وکار «{selectedBusiness.name}» غیرفعال است</CardTitle>
            <p className="mt-4 text-sm leading-7 text-amber-900">مدیر سیستم این کسب‌وکار را غیرفعال کرده است. از فهرست بالا کسب‌وکار دیگری انتخاب کنید یا برای فعال‌سازی آن با مدیر تماس بگیرید.</p>
          </Card>
        ) : (
          <>
            {/* Active Business Banner */}
            {selectedBusiness && (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-2xl font-extrabold shadow-md shadow-blue-500/20 shrink-0">
                    {selectedBusiness.logo_url || selectedBusiness.name.charAt(0)}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-extrabold text-slate-900">{selectedBusiness.name}</h1>
                      {/* <Badge variant="emerald">پایدار در Supabase</Badge> */}
                    </div>
                    <p className="text-xs text-slate-500">
                      {selectedBusiness.description || 'سیستم آنلاین نوبت‌دهی و مدیریت صف'}
                    </p>
                  </div>
                </div>

                {/* Public Link Bar */}
                <div className="flex items-center gap-2 w-full md:w-auto justify-end bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <div className="text-xs dir-ltr font-mono text-slate-600 px-2 truncate max-w-[200px] sm:max-w-xs">
                    /q/{selectedBusiness.slug}
                  </div>
                  <Link
                    href={`/q/${selectedBusiness.slug}`}
                    target="_blank"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1 shrink-0"
                  >
                    <span>مشاهده لینک عمومی</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </Link>
                </div>
              </div>
            )}

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveTab('queue')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                  activeTab === 'queue'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>⚡ مدیریت صف و نوبت‌ها</span>
                <span className="bg-white/20 text-white px-1.5 py-0.5 rounded-md text-[10px]">
                  {waitingAppointments.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('services')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                  activeTab === 'services'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>🏷️ خدمات ({services.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('staff')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                  activeTab === 'staff'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>👥 کارکنان ({staffMembers.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>⚙️ تنظیمات کسب‌وکار</span>
              </button>
            </div>

            {/* TAB 1: Queue & Appointments */}
            {activeTab === 'queue' && (
              <div className="space-y-6">
                {/* DATE SELECTOR BAR FOR OWNER QUEUE */}
                <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800 px-1">
                    <span className="flex items-center gap-1.5">
                      <span>📅</span>
                      <span>انتخاب تاریخ صف نوبت‌دهی (مدیریت):</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {isAutoRefreshing ? (
                        <span className="flex items-center gap-1 text-[10px] text-blue-600 font-bold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                          <svg className="animate-spin h-2.5 w-2.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                          </svg>
                          در حال آپدیت...
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block"></span>
                          آپدیت خودکار فعال
                        </span>
                      )}
                      <span className="text-blue-600 font-bold text-xs">{isoToAfghaniDate(selectedDate)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {upcomingDays.map((day) => (
                      <button
                        key={day.isoDate}
                        onClick={() => handleDateChange(day.isoDate)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                          selectedDate === day.isoDate
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}

                    <div className="shrink-0 flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-xl border border-slate-200">
                      <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">تقویم:</span>
                      <AfghanDatePicker min={todayStr} value={selectedDate} onChange={handleDateChange} />
                    </div>
                  </div>
                </div>

                {/* Capacity Status Banner */}


                <QueueStatus
                  currentServing={currentServingApp ? currentServingApp.queue_number : null}
                  waitingCount={waitingAppointments.length}
                  completedCount={completedAppointments.length}
                  estimatedWaitMinutes={estWaitNewJoiner}
                />

                {/* Filter & Action Buttons */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                    <button
                      onClick={() => setAppointmentFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        appointmentFilter === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      همه ({appointments.length})
                    </button>

                    <button
                      onClick={() => setAppointmentFilter('waiting')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        appointmentFilter === 'waiting'
                          ? 'bg-amber-500 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      در انتظار ({waitingAppointments.length})
                    </button>

                    <button
                      onClick={() => setAppointmentFilter('serving')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        appointmentFilter === 'serving'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      در حال خدمت ({currentServingApp ? 1 : 0})
                    </button>

                    <button
                      onClick={() => setAppointmentFilter('completed')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        appointmentFilter === 'completed'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      تکمیل‌شده ({completedAppointments.length})
                    </button>
                  </div>

                  <Button
                    onClick={() => {
                      if (services.length > 0) setSelectedServiceId(services[0].id);
                      if (staffMembers.length > 0) setSelectedStaffId(staffMembers[0].id);
                      setIsAddAppointmentModalOpen(true);
                    }}
                    className="text-xs shrink-0 font-bold"
                  >
                    + ثبت نوبت جدید / حضوری ({isoToAfghaniDate(selectedDate)})
                  </Button>
                </div>

                <fieldset className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <legend className="px-2 text-sm font-bold text-slate-800">نمایش نوبت‌های کارمندان / داکترها</legend>
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={hiddenStaffIds.length === 0}
                        onChange={e => setHiddenStaffIds(e.target.checked ? [] : [...new Set([...staffMembers.map(person => person.id), ...dateAppointments.map(a => a.staff_id || 'unassigned'), 'unassigned'])])} />
                      انتخاب همه
                    </label>
                    {[...staffMembers, { id: 'unassigned', name: 'بدون انتخاب کارمند' }].map(person => (
                      <label key={person.id} className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={!hiddenStaffIds.includes(person.id)}
                          onChange={e => setHiddenStaffIds(previous => e.target.checked ? previous.filter(id => id !== person.id) : [...new Set([...previous, person.id])])} />
                        {person.name}
                        <span className="text-xs text-slate-400">({dateAppointments.filter(a => (a.staff_id || 'unassigned') === person.id).length.toLocaleString('fa-AF')})</span>
                      </label>
                    ))}
                  </div>
                  <p className="border-t border-slate-100 pt-3 text-xs text-slate-500" aria-live="polite">{staffAppointments.length.toLocaleString('fa-AF')} نوبت از کارمندان انتخاب‌شده در روز {isoToAfghaniDate(selectedDate)}</p>
                </fieldset>

                {/* Appointments List */}
                {filteredAppointments.length === 0 ? (
                  <Card className="text-center py-12 border-dashed border-2">
                    <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3 text-xl">
                      📋
                    </div>
                    <CardTitle className="text-base">نوبتی مطابق این فیلترها در تاریخ {isoToAfghaniDate(selectedDate)} وجود ندارد</CardTitle>
                    <CardDescription className="text-xs mt-1">
                      نوبت‌های حضوری و آنلاین پس از ثبت، اینجا نمایش داده می‌شوند.
                    </CardDescription>
                  </Card>
                ) : (
                  <StaffAppointmentTables pendingActions={pending} appointments={filteredAppointments} allAppointments={dateAppointments} staff={staffMembers} onStatusChange={handleStatusChange} onDelete={handleDeleteAppointmentItem} onDownload={handleOwnerDownloadTicket} />
                )}
              </div>
            )}

            {/* TAB 2: Services Management */}
            {activeTab === 'services' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">لیست خدمات کسب‌وکار</h2>
                    <p className="text-xs text-slate-500">خدمات قابل ارائه به مشتریان</p>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingService(null);
                      setServiceName('');
                      setServiceDescription('');
                      setServiceDuration('20');
                      setIsServiceModalOpen(true);
                    }}
                    size="sm"
                    className="text-xs"
                  >
                    + افزودن خدمت جدید
                  </Button>
                </div>

                {services.length === 0 ? (
                  <Card className="text-center py-12 border-dashed">
                    <CardTitle className="text-base">هیچ خدمتی ثبت نشده است</CardTitle>
                    <CardDescription className="text-xs mt-1">برای انتخاب توسط مشتریان، خدمات خود را اضافه کنید</CardDescription>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {services.map(srv => (
                      <Card key={srv.id} className="relative overflow-hidden flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">{srv.name}</h3>
                            <Badge variant={srv.is_active ? 'emerald' : 'slate'}>
                              {srv.is_active ? 'فعال' : 'غیرفعال'}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2">
                            {srv.description || 'بدون توضیح'}
                          </p>
                          <div className="text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg p-2 inline-block">
                            ⏱️ مدت زمان: {srv.duration_minutes} دقیقه
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              disabled={isPending('service:' + srv.id)} aria-busy={isPending('service:' + srv.id)} onClick={() => handleToggleServiceActive(srv)}
                              className="text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                            >
                              {isPending('service:' + srv.id) ? 'در حال انجام…' : srv.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                            </button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs px-2.5 py-1"
                              disabled={isPending('service:' + srv.id)} onClick={() => {
                                setEditingService(srv);
                                setServiceName(srv.name);
                                setServiceDescription(srv.description || '');
                                setServiceDuration(srv.duration_minutes.toString());
                                setIsServiceModalOpen(true);
                              }}
                            >
                              ویرایش
                            </Button>
                          </div>
                          <button
                            disabled={isPending('service:' + srv.id)} aria-busy={isPending('service:' + srv.id)} onClick={() => handleDeleteServiceItem(srv.id)}
                            className="text-xs text-rose-600 hover:underline"
                          >
                            حذف
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Staff Management */}
            {activeTab === 'staff' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">ارائه‌دهندگان خدمت / پرسنل</h2>
                    <p className="text-xs text-slate-500">همکاران و ارائه‌دهندگان خدمات</p>
                  </div>
                  <Button
                    onClick={() => {
                      setEditingStaff(null);
                      setStaffName('');
                      setIsStaffModalOpen(true);
                    }}
                    size="sm"
                    className="text-xs"
                  >
                    + افزودن همکار / ارائه‌دهنده
                  </Button>
                </div>

                {staffMembers.length === 0 ? (
                  <Card className="text-center py-12 border-dashed">
                    <CardTitle className="text-base">هیچ همکاری ثبت نشده است</CardTitle>
                    <CardDescription className="text-xs mt-1">می‌توانید اسامی ارائه‌دهندگان خدمت را ثبت نمایید</CardDescription>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {staffMembers.map(st => (
                      <Card key={st.id} className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-100 font-bold text-slate-700 flex items-center justify-center text-sm">
                            👤
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{st.name}</h4><p className="text-xs text-slate-500">ظرفیت روزانه: {st.max_daily_appointments === 0 ? 'نامحدود' : (st.max_daily_appointments ?? 20).toLocaleString('fa-AF')}</p>
                            <Badge variant={st.is_active ? 'emerald' : 'slate'} className="mt-1">
                              {st.is_active ? 'فعال' : 'غیرفعال'}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" disabled={isPending('staff:' + st.id)} onClick={() => { setEditingStaff(st); setStaffName(st.name); setStaffCapacity(String(st.max_daily_appointments ?? 20)); setIsStaffModalOpen(true); }}>ویرایش</Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs px-2 py-1"
                            disabled={isPending('staff:' + st.id)} aria-busy={isPending('staff:' + st.id)} onClick={() => handleToggleStaffActive(st)}
                          >
                            {isPending('staff:' + st.id) ? 'در حال انجام…' : st.is_active ? 'تغییر' : 'فعال‌سازی'}
                          </Button>
                          <button
                            disabled={isPending('staff:' + st.id)} aria-busy={isPending('staff:' + st.id)} onClick={() => handleDeleteStaffItem(st.id)}
                            className="text-xs text-rose-600 hover:underline px-1"
                          >
                            حذف
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: Business Settings */}
            {activeTab === 'settings' && selectedBusiness && (
              <Card className="max-w-2xl mx-auto">
                <CardHeader>
                  <CardTitle>تنظیمات کسب‌وکار فعلی</CardTitle>
                  <CardDescription>مشخصات کسب‌وکار خود را ویرایش کنید</CardDescription>
                </CardHeader>
                <CardContent>
                  <BusinessQRCode key={selectedBusiness.id} name={selectedBusiness.name} slug={selectedBusiness.slug} phone={selectedBusiness.phone} />
                  <div className="mt-6" />
                  <form onSubmit={handleUpdateBusinessSettings} className="space-y-4">
          <fieldset disabled={isPending('business-form')} aria-busy={isPending('business-form')} className="space-y-4 min-w-0">
                    <Input
                      label="نام کسب‌وکار *"
                      value={selectedBusiness.name}
                      onChange={(e) => setSelectedBusiness({ ...selectedBusiness, name: e.target.value })}
                      required
                    />

                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700">توضیحات</label>
                      <textarea
                        rows={3}
                        value={selectedBusiness.description || ''}
                        onChange={(e) => setSelectedBusiness({ ...selectedBusiness, description: e.target.value })}
                        placeholder="شرح کوتاه کسب‌وکار..."
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
                      />
                    </div>

                    <Input
                      label="شماره تماس"
                      value={selectedBusiness.phone || ''}
                      onChange={(e) => setSelectedBusiness({ ...selectedBusiness, phone: e.target.value })}
                      className="dir-ltr text-right"
                    />

                    <Input
                      label="آدرس حضوری"
                      value={selectedBusiness.address || ''}
                      onChange={(e) => setSelectedBusiness({ ...selectedBusiness, address: e.target.value })}
                    />



                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input type="time" label="ساعت شروع کار" value={selectedBusiness.opening_time?.slice(0,5) || ''} onChange={e => setSelectedBusiness({ ...selectedBusiness, opening_time: e.target.value || null })} />
                      <Input type="time" label="ساعت ختم کار" value={selectedBusiness.closing_time?.slice(0,5) || ''} onChange={e => setSelectedBusiness({ ...selectedBusiness, closing_time: e.target.value || null })} />
                    </div>
                    <p className="text-xs text-slate-500">ساعت‌ها به وقت افغانستان در صفحهٔ نوبت‌گیری نمایش داده می‌شوند. ختم زودتر از شروع، به معنی ختم در روز بعد است.</p>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        disabled={isPending('business-form')} aria-busy={isPending('business-form')} onClick={handleDeleteBusiness}
                        className="text-xs font-bold text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors"
                      >
                        🗑️ حذف کامل این کسب‌وکار
                      </button>

                      <Button type="submit" isLoading={bizSaving || isPending('business-form')}>
                        ذخیره تغییرات
                      </Button>
                    </div>
                  </fieldset>
        </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>

      {/* MODAL: Create New Business */}
      <Modal
        isOpen={isBizModalOpen}
        onClose={() => {
          if (isPending('business-form')) return;
          setIsBizModalOpen(false);
          resetBizForm();
        }}
        title="ایجاد کسب‌وکار جدید"
        description="مشخصات کسب‌وکار را برای ذخیره دائم وارد نمایید"
      >
        {bizFormError && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 font-medium">
            {bizFormError}
          </div>
        )}

        <form onSubmit={handleCreateBusiness} className="space-y-4">
          <fieldset disabled={isPending('business-form')} aria-busy={isPending('business-form')} className="space-y-4 min-w-0">
          <Input
            label="نام کسب‌وکار *"
            placeholder="مثلاً: آرایشگاه VIP، کلینیک شفا"
            value={bizName}
            onChange={(e) => {
              const val = e.target.value;
              setBizName(val);
              if (!bizSlug || bizSlug === slugify(bizName)) {
                setBizSlug(slugify(val));
              }
            }}
            required
          />

          <div className="space-y-1.5">
            <Input
              label="آدرس اختصاصی لینک (Slug)"
              placeholder="مثلاً: fahim-barber"
              value={bizSlug}
              onChange={(e) => setBizSlug(e.target.value)}
              onBlur={() => {
                if (bizSlug.trim()) {
                  setBizSlug(slugify(bizSlug));
                }
              }}
              helperText="اگر خالی بگذارید، به طور خودکار از نام کسب‌وکار ساخته می‌شود."
              className="dir-ltr text-left font-mono"
            />
          </div>

          <Input
            label="شماره تماس (اختیاری)"
            value={bizPhone}
            onChange={(e) => setBizPhone(e.target.value)}
            className="dir-ltr text-right"
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsBizModalOpen(false)}>
              انصراف
            </Button>
            <Button type="submit" isLoading={bizSaving || isPending('business-form')}>
              ذخیره و ایجاد
            </Button>
          </div>
        </fieldset>
        </form>
      </Modal>

      {/* MODAL: Add / Edit Service */}
      <Modal
        isOpen={isServiceModalOpen}
        onClose={() => { if (!(isPending(editingService ? 'service:' + editingService.id : 'service-new'))) setIsServiceModalOpen(false); }}
        title={editingService ? 'ویرایش خدمت' : 'افزودن خدمت جدید'}
        description="مشخصات خدمت را برای ذخیره دائم وارد نمایید"
      >
        <form onSubmit={handleSaveService} className="space-y-4">
          <fieldset disabled={isPending(editingService ? 'service:' + editingService.id : 'service-new')} aria-busy={isPending(editingService ? 'service:' + editingService.id : 'service-new')} className="space-y-4 min-w-0">
          <Input
            label="عنوان خدمت *"
            placeholder="مثلاً: اصلاح مو، فیشیال صورت"
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">توضیحات مختصر</label>
            <textarea
              rows={2}
              value={serviceDescription}
              onChange={(e) => setServiceDescription(e.target.value)}
              placeholder="شرح کوتاه خدمت..."
              className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <Input
            label="مدت زمان تقریبی (دقیقه) *"
            type="number"
            value={serviceDuration}
            onChange={(e) => setServiceDuration(e.target.value)}
            required
            className="dir-ltr text-right"
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsServiceModalOpen(false)}>
              انصراف
            </Button>
            <Button type="submit" isLoading={serviceSaving}>
              {editingService ? 'ذخیره تغییرات' : 'افزودن خدمت'}
            </Button>
          </div>
        </fieldset>
        </form>
      </Modal>

      {/* MODAL: Add / Edit Staff */}
      <Modal
        isOpen={isStaffModalOpen}
        onClose={() => { if (!(isPending(editingStaff ? 'staff:' + editingStaff.id : 'staff-new'))) setIsStaffModalOpen(false); }}
        title={editingStaff ? 'ویرایش همکار' : 'افزودن ارائه‌دهنده خدمت'}
        description="مشخصات ارائه‌دهنده خدمت را وارد نمایید"
      >
        <form onSubmit={handleSaveStaff} className="space-y-4">
          <fieldset disabled={isPending(editingStaff ? 'staff:' + editingStaff.id : 'staff-new')} aria-busy={isPending(editingStaff ? 'staff:' + editingStaff.id : 'staff-new')} className="space-y-4 min-w-0">
          <Input type="number" min="0" max="2147483647" step="1" label="ظرفیت روزانهٔ این کارمند" value={staffCapacity} onChange={e => setStaffCapacity(e.target.value)} helperText="صفر یعنی نامحدود. ظرفیت هر کارمند جدا محاسبه می‌شود." required />
          <Input
            label="نام و نام خانوادگی ارائه‌دهنده *"
            placeholder="مثلاً: علی رضایی"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsStaffModalOpen(false)}>
              انصراف
            </Button>
            <Button type="submit" isLoading={staffSaving}>
              ثبت ارائه‌دهنده
            </Button>
          </div>
        </fieldset>
        </form>
      </Modal>

      {/* MODAL: Add Walk-in Appointment */}
      <Modal
        isOpen={isAddAppointmentModalOpen}
        onClose={() => { if (!(isPending('appointment-new'))) setIsAddAppointmentModalOpen(false); }}
        title={`ثبت نوبت جدید (حضوری / دستی) - تاریخ ${isoToAfghaniDate(selectedDate)}`}
        description="مشخصات نوبت را برای ذخیره دائم در صف ثبت کنید"
      >
        {selectedBusiness && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center justify-between">
            <span>🔗 لینک عمومی صف نوبت‌دهی:</span>
            <Link
              href={`/q/${selectedBusiness.slug}`}
              target="_blank"
              className="font-bold text-blue-700 hover:underline flex items-center gap-1"
            >
              <span>مشاهده صفحه نوبت</span>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          </div>
        )}
        <form onSubmit={handleAddAppointment} className="space-y-4">
          <fieldset disabled={isPending('appointment-new')} aria-busy={isPending('appointment-new')} className="space-y-4 min-w-0">
          <Input
            label="نام مشتری *"
            placeholder="مثلاً: محمد حسینی"
            value={custName}
            onChange={(e) => setCustName(e.target.value)}
            required
          />

          <Input
            label="شماره تماس مشتری (اختیاری)"
            placeholder="۰۹۱۲..."
            value={custPhone}
            onChange={(e) => setCustPhone(e.target.value)}
            className="dir-ltr text-right"
          />

          {services.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">انتخاب خدمت</label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
              >
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.duration_minutes} دقیقه)
                  </option>
                ))}
              </select>
            </div>
          )}

          {staffMembers.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">ارائه‌دهنده خدمت (اختیاری)</label>
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-600 focus:outline-none"
              >
                {staffMembers.map(st => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsAddAppointmentModalOpen(false)}>
              انصراف
            </Button>
            <Button type="submit" isLoading={appointmentSaving}>
              ثبت نوبت برای {isoToAfghaniDate(selectedDate)}
            </Button>
          </div>
        </fieldset>
        </form>
      </Modal>
    </div>
  );
}
