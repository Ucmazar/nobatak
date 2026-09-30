export function planErrorMessage(message: string): string {
  if (message.includes('PLAN_FEATURE_UNAVAILABLE')) return 'تنظیم ظرفیت هر کارمند در پلن رایگان فعال نیست.';
  if (message.includes('PLAN_RESOURCE_LIMIT:services')) return 'سقف خدمات فعال این حساب تکمیل شده است. برای افزودن خدمت جدید، یکی از خدمات فعال را غیرفعال کنید یا از مدیر نوبت بخواهید سقف پلن را افزایش دهد.';
  if (message.includes('PLAN_RESOURCE_LIMIT:staff')) return 'سقف کارمندان فعال این حساب تکمیل شده است. برای افزودن کارمند جدید، یکی از کارمندان فعال را غیرفعال کنید یا از مدیر نوبت بخواهید سقف پلن را افزایش دهد.';
  return message;
}
