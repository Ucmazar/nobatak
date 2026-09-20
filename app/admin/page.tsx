'use client';

import { useEffect, useState } from 'react';
import { AdminTableSearch } from '@/components/ui/AdminTableSearch';
import { matchesAdminSearch } from '@/lib/admin-search';
import { BusinessLimitEditor } from '@/components/ui/BusinessLimitEditor';
import { supabase } from '@/lib/supabase/client';
import {
  getAdminStats,
  getAllBusinesses,
  getAllUsers,
  toggleBusinessActive,
  toggleUserActive,
  AdminStats,
  AdminBusinessItem,
  AdminUserItem,
} from '@/lib/services/admin';
import { isoToAfghaniDate } from '@/lib/afghaniMonths';

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [businesses, setBusinesses] = useState<AdminBusinessItem[]>([]);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [activeTab, setActiveTab] = useState<'businesses' | 'users'>('businesses');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [businessSearch, setBusinessSearch] = useState('');
  const filteredUsers = users.filter(user => matchesAdminSearch(userSearch, [user.full_name, user.phone, user.role]));
  const filteredBusinesses = businesses.filter(business => {
    const owner = users.find(user => user.id === business.owner_id);
    return matchesAdminSearch(businessSearch, [business.name, business.slug, business.phone, business.description, owner?.full_name]);
  });

  useEffect(() => {
    checkAdminAndLoadData();
  }, []);

  async function checkAdminAndLoadData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      // Check profile role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile || profile.role !== 'superadmin') {
        setIsSuperAdmin(false);
        setLoading(false);
        return;
      }

      setIsSuperAdmin(true);

      // Load data in parallel
      const [statsData, businessList, userList] = await Promise.all([
        getAdminStats(),
        getAllBusinesses(),
        getAllUsers(),
      ]);

      setStats(statsData);
      setBusinesses(businessList);
      setUsers(userList);
    } catch (err: any) {
      console.error('Admin loading error:', err);
      setErrorMsg(err.message || 'خطا در دریافت اطلاعات مدیریتی');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleBusiness(businessId: string, currentStatus: boolean) {
    setTogglingId(businessId);
    try {
      const updated = await toggleBusinessActive(businessId, !currentStatus);
      if (!updated.success) throw new Error(updated.error || 'تغییر وضعیت ثبت نشد');
      if (updated.success) {
        setBusinesses((prev) =>
          prev.map((b) => (b.id === businessId ? { ...b, is_active: !currentStatus } : b))
        );
      }
    } catch (err: any) {
      alert('خطا در تغییر وضعیت کسب‌وکار: ' + err.message);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleToggleUser(userId: string, currentStatus: boolean) {
    setTogglingId(userId);
    try {
      const res = await toggleUserActive(userId, !currentStatus);
      if (res.success) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_active: !currentStatus } : u))
        );
      } else {
        alert('خطا در تغییر وضعیت کاربر: ' + res.error);
      }
    } catch (err: any) {
      alert('خطا در تغییر وضعیت کاربر: ' + err.message);
    } finally {
      setTogglingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-400 text-sm">در حال دریافت اطلاعات سیستم...</p>
      </div>
    );
  }

  if (isSuperAdmin === false) {
    return (
      <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-8 text-center max-w-md mx-auto my-12">
        <div className="w-16 h-16 bg-red-900/50 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
          ✕
        </div>
        <h2 className="text-xl font-bold text-red-200 mb-2">دسترسی غیرمجاز</h2>
        <p className="text-sm text-red-300 mb-6">
          شما دسترسی لازم برای مشاهده پنل  را ندارید.
        </p>
        <a
          href="/"
          className="inline-block bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-xl text-sm font-medium transition"
        >
          بازگشت به صحفه اصلی
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome & Stats Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">پنل مدیریت اصلی (Super Admin)</h1>
          <p className="text-slate-400 text-sm mt-1">
            خوش آمدید <span className="text-indigo-400 font-semibold">fahimadmin</span> — مدیریت کامل سیستم نوبتک
          </p>
        </div>
        <button
          onClick={checkAdminAndLoadData}
          className="self-start md:self-auto bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs flex items-center gap-2 border border-slate-700 transition"
        >
          🔄 به‌روزرسانی داده‌ها
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 p-4 rounded-xl text-sm">
          {errorMsg}
        </div>
      )}

      <a href="/admin/telegram" className="flex items-center justify-between gap-4 rounded-2xl border border-sky-700 bg-sky-950/50 p-5 text-white transition hover:bg-sky-900/50">
        <div>
          <h2 className="font-bold text-sky-200">اتصال ربات تلگرام</h2>
          <p className="mt-1 text-sm text-slate-300">بررسی وضعیت ربات و تنظیم دریافت پیام‌های مشتریان</p>
        </div>
        <span className="shrink-0 rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold">تنظیم تلگرام ←</span>
      </a>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="text-xs font-medium text-slate-400 mb-1">کل کاربران ثبت‌شده</div>
          <div className="text-3xl font-extrabold text-white">{stats?.totalUsers ?? 0}</div>
          <div className="text-xs text-indigo-400 mt-2">کاربران سیستم</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="text-xs font-medium text-slate-400 mb-1">کل کسب‌وکارها</div>
          <div className="text-3xl font-extrabold text-white">{stats?.totalBusinesses ?? 0}</div>
          <div className="text-xs text-emerald-400 mt-2">مراکز و صف‌های تعریف‌شده</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="text-xs font-medium text-slate-400 mb-1">کسب‌وکارهای فعال</div>
          <div className="text-3xl font-extrabold text-emerald-400">
            {stats?.activeBusinesses ?? 0}
          </div>
          <div className="text-xs text-slate-400 mt-2">ارائه‌دهندگان فعال نوبت</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <div className="text-xs font-medium text-slate-400 mb-1">کل نوبت‌های صادرشده</div>
          <div className="text-3xl font-extrabold text-amber-400">
            {stats?.totalAppointments ?? 0}
          </div>
          <div className="text-xs text-slate-400 mt-2">مجموع نوبت‌ها در سیستم</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 flex space-x-6 space-x-reverse">
        <button
          onClick={() => setActiveTab('businesses')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'businesses'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          مدیریت کسب‌وکارها ({businesses.length})
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'users'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          لیست کاربران ({users.length})
        </button>
      </div>

      {/* Tab Content: Businesses */}
      {activeTab === 'businesses' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <h2 className="font-bold text-slate-200 text-base">لیست کسب‌وکارها</h2>
            <span className="text-xs text-slate-400">
              امکان غیرفعال‌سازی یا فعال‌سازی حساب کسب‌وکارها
            </span>
          </div>

          <AdminTableSearch value={businessSearch} onChange={setBusinessSearch} placeholder="جستجوی نام کسب‌وکار، شناسه، تلفن یا مالک…" count={filteredBusinesses.length} total={businesses.length} />
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs border-b border-slate-800">
                <tr>
                  <th className="p-4">نام کسب‌وکار</th>
                  <th className="p-4">شناسه (Slug)</th>
                  <th className="p-4">تلفن / تماس</th>
                  <th className="p-4">تاریخ ایجاد (شمسی افغانستان)</th>
                  <th className="p-4">وضعیت</th>
                  <th className="p-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredBusinesses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500">
                      {businessSearch.trim() ? 'کسب‌وکاری مطابق جستجوی شما پیدا نشد.' : 'هیچ کسب‌وکاری هنوز ثبت نشده است.'}
                    </td>
                  </tr>
                ) : (
                  filteredBusinesses.map((bus) => (
                    <tr key={bus.id} className="hover:bg-slate-800/30 transition">
                      <td className="p-4 font-semibold text-white">
                        {bus.name}
                        {bus.description && (
                          <div className="text-xs font-normal text-slate-400 line-clamp-1">
                            {bus.description}
                          </div>
                        )}
                      </td>
                      <td className="p-4 dir-ltr text-right font-mono text-xs text-indigo-300">
                        {bus.slug}
                      </td>
                      <td className="p-4 text-slate-400">{bus.phone || '—'}</td>
                      <td className="p-4 text-slate-400 text-xs">
                        {isoToAfghaniDate(bus.created_at)}
                      </td>
                      <td className="p-4">
                        {bus.is_active ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ● فعال
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            ○ غیرفعال
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        <button
                          disabled={togglingId === bus.id}
                          onClick={() => handleToggleBusiness(bus.id, bus.is_active !== false)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                            bus.is_active
                              ? 'bg-red-950/40 hover:bg-red-900/60 border-red-800 text-red-300'
                              : 'bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-800 text-emerald-300'
                          } disabled:opacity-50`}
                        >
                          {togglingId === bus.id
                            ? 'در حال تغییر...'
                            : bus.is_active
                            ? 'غیرفعال کردن'
                            : 'فعال کردن'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Users */}
      {activeTab === 'users' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <h2 className="font-bold text-slate-200 text-base">لیست کاربران سیستم</h2>
            <span className="text-xs text-slate-400">همه پروفایل‌های ثبت‌شده در دیتابیس</span>
          </div>

          <AdminTableSearch value={userSearch} onChange={setUserSearch} placeholder="جستجوی نام کاربر، شماره تماس یا نقش…" count={filteredUsers.length} total={users.length} />
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs border-b border-slate-800">
                <tr>
                  <th className="p-4">نام کامل</th>
                  <th className="p-4">شماره تماس</th>
                  <th className="p-4">نقش (Role)</th>
                  <th className="p-4">تاریخ عضویت (شمسی افغانستان)</th>
                  <th className="p-4">سقف کسب‌وکار</th>
                  <th className="p-4">وضعیت حساب</th>
                  <th className="p-4 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      {userSearch.trim() ? 'کاربری مطابق جستجوی شما پیدا نشد.' : 'هیچ کاربر دیگری ثبت نشده است.'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((usr) => {
                    const isActive = usr.is_active !== false;
                    return (
                      <tr key={usr.id} className="hover:bg-slate-800/30 transition">
                        <td className="p-4 font-semibold text-white">
                          {usr.full_name || 'کاربر بدون نام'}
                        </td>
                        <td className="p-4 text-slate-400">{usr.phone || '—'}</td>
                        <td className="p-4">
                          {usr.role === 'superadmin' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              ★ Super Admin (fahimadmin)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                              کاربر عادی
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-slate-400 text-xs">
                          {isoToAfghaniDate(usr.created_at)}
                        </td>
                        <td className="p-4">
                          {usr.role === 'superadmin' ? 'نامحدود' : <BusinessLimitEditor userId={usr.id} limit={usr.max_businesses} count={businesses.filter(b => b.owner_id === usr.id).length} onSaved={limit => setUsers(prev => prev.map(u => u.id === usr.id ? { ...u, max_businesses: limit } : u))} />}
                        </td>
                        <td className="p-4">
                          {isActive ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              ● فعال
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                              ○ غیرفعال (مسدود)
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {usr.role === 'superadmin' ? (
                            <span className="text-xs text-slate-500 font-mono">—</span>
                          ) : (
                            <button
                              disabled={togglingId === usr.id}
                              onClick={() => handleToggleUser(usr.id, isActive)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                                isActive
                                  ? 'bg-red-950/40 hover:bg-red-900/60 border-red-800 text-red-300'
                                  : 'bg-emerald-950/40 hover:bg-emerald-900/60 border-emerald-800 text-emerald-300'
                              } disabled:opacity-50`}
                            >
                              {togglingId === usr.id
                                ? 'در حال تغییر...'
                                : isActive
                                ? 'غیرفعال کردن'
                                : 'فعال کردن'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
