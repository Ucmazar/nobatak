'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getUserProfile, upsertUserProfile } from '@/lib/services/profile';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('لطفاً ایمیل و رمز عبور را وارد کنید.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('ایمیل یا رمز عبور اشتباه است.');
        } else {
          setError(authError.message);
        }
        return;
      }

      if (data.session) {
        // Ensure profile record exists in public.profiles table (critical for businesses FK constraint)
        const profile = await getUserProfile(data.user!.id) ?? await upsertUserProfile({
          id: data.user!.id,
          full_name: data.user!.user_metadata?.full_name || data.user!.email || '',
        });
        document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=604800; SameSite=Lax`;
        router.replace(profile?.role === 'superadmin' ? '/admin' : '/dashboard');
        router.refresh();
      }
    } catch {
      setError('خطایی در برقراری ارتباط رخ داد. دوباره تلاش کنید.');
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
          <p className="text-xs text-slate-500">ورود به پنل مدیریت نوبت‌دهی</p>
        </div>

        <Card className="shadow-lg border-slate-200/80">
          <CardHeader>
            <CardTitle>ورود به حساب کاربری</CardTitle>
            <CardDescription>برای ورود، ایمیل و رمز عبور خود را وارد کنید</CardDescription>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button type="submit" size="lg" className="w-full mt-2" isLoading={loading}>
                ورود به سیستم
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                حساب کاربری ندارید؟{' '}
                <Link href="/register" className="font-bold text-blue-600 hover:underline">
                  ثبت‌نام کنید
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
