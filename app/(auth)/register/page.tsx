'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { upsertUserProfile } from '@/lib/services/profile';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password) {
      setError('لطفاً تمامی فیلدها را پر کنید.');
      return;
    }

    if (password.length < 6) {
      setError('رمز عبور باید حداقل ۶ کاراکتر باشد.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (data.user && data.session) {
        // Ensure user profile record is created in profiles table
        await upsertUserProfile({
          id: data.user.id,
          full_name: fullName,
        });
      }

      if (data.session) {
        document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=604800; SameSite=Lax`;
        router.push('/dashboard');
        router.refresh();
      } else if (data.user && data.session) {
        setSuccessMsg('لینک تأیید به ایمیل شما ارسال شد. پس از تأیید ایمیل، وارد حساب شوید.');
      }
    } catch {
      setError('خطایی در فرایند ثبت‌نام رخ داد. دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo Branding */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <img src="/logo-transparent.png" alt="نوبتک" className="h-12 w-auto object-contain mx-auto" />
          </Link>
          <p className="text-xs text-slate-500">ایجاد حساب رایگان و شروع نوبت‌دهی</p>
        </div>

        <Card className="shadow-lg border-slate-200/80">
          <CardHeader>
            <CardTitle>ثبت‌نام در نوبتک</CardTitle>
            <CardDescription>اطلاعات خود را برای ساخت حساب جدید وارد نمایید</CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 font-medium">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl p-3 font-medium">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <Input
                label="نام و نام خانوادگی"
                type="text"
                placeholder="مثلاً: علی محمدی"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />

              <Input
                label="ایمیل"
                type="email"
                placeholder="example@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="dir-ltr text-right"
              />

              <Input
                label="رمز عبور"
                type="password"
                placeholder="حداقل ۶ کاراکتر"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button type="submit" size="lg" className="w-full mt-2" isLoading={loading}>
                ایجاد حساب کاربری
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                قبلاً ثبت‌نام کرده‌اید؟{' '}
                <Link href="/login" className="font-bold text-blue-600 hover:underline">
                  وارد شوید
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
