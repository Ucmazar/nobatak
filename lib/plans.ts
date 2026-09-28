export function planErrorMessage(message: string): string {
  if (message.includes('PLAN_FEATURE_UNAVAILABLE')) return 'تنظیم ظرفیت هر کارمند در پلن رایگان فعال نیست.';
  if (message.includes('PLAN_RESOURCE_LIMIT:services')) return 'تعداد خدمات فعال به سقف تعیین‌شدهٔ این حساب رسیده است.';
  if (message.includes('PLAN_RESOURCE_LIMIT:staff')) return 'تعداد کارمندان فعال به سقف تعیین‌شدهٔ این حساب رسیده است.';
  return message;
}
