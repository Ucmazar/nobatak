export function planErrorMessage(message: string): string {
  if (message.includes('WORK_SHIFTS_DISABLED')) return 'شیفت کاری در پلن فعلی فعال نیست.';
  if (message.includes('WORK_SHIFT_LIMIT_REACHED')) return 'سقف تعداد شیفت‌های پلن تکمیل شده است.';
  if (message.includes('INVALID_STAFF_SHIFT')) return 'شیفت انتخاب‌شده برای این کارمند معتبر نیست.';
  if (message.includes('OUTSIDE_EFFECTIVE_WORKING_HOURS')) return 'زمان نوبت خارج از ساعت کاری این کارمند است.';
  if (message.includes('PLAN_FEATURE_UNAVAILABLE')) return 'تنظیم ظرفیت هر کارمند در پلن رایگان فعال نیست.';
  if (message.includes('PLAN_RESOURCE_LIMIT:services')) return 'سقف خدمات فعال این حساب تکمیل شده است. برای افزودن خدمت جدید، یکی از خدمات فعال را غیرفعال کنید یا از مدیر نوبت بخواهید سقف پلن را افزایش دهد.';
  if (message.includes('PLAN_RESOURCE_LIMIT:staff')) return 'سقف کارمندان فعال این حساب تکمیل شده است. برای افزودن کارمند جدید، یکی از کارمندان فعال را غیرفعال کنید یا از مدیر نوبت بخواهید سقف پلن را افزایش دهد.';
  return message;
}
