import type { PaymentMethod, PaymentStatus, SubscriptionStatus } from '@/types/database';

export const statusLabels: Record<SubscriptionStatus, string> = { active: 'فعال', expired: 'منقضی', suspended: 'تعلیق', cancelled: 'لغو' };
export const paymentStatusLabels: Record<PaymentStatus, string> = { pending: 'در انتظار', paid: 'پرداخت‌شده', cancelled: 'لغوشده', refunded: 'برگشت‌شده' };
export const methodLabels: Record<PaymentMethod, string> = { cash: 'نقدی', bank_transfer: 'انتقال بانکی', hesabpay: 'حساب‌پی', hawala: 'حواله', other: 'سایر' };
export const formatMoney = (amount: number, currency = 'AFN') => `${Number(amount).toLocaleString('fa-AF')} ${currency}`;
export const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('fa-AF', { dateStyle: 'medium', timeZone: 'Asia/Kabul' }).format(new Date(value)) : 'بدون انقضا';
export const remainingDays = (value: string | null) => value ? Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 86400000)) : null;
