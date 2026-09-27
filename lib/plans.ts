export function planErrorMessage(message: string): string {
  if (message.includes('FREE_PLAN_RESOURCE_LIMIT:services')) return 'پلن رایگان حداکثر ۳ خدمت فعال دارد. ابتدا یکی از خدمات قبلی را غیرفعال کنید.';
  if (message.includes('FREE_PLAN_RESOURCE_LIMIT:staff')) return 'پلن رایگان حداکثر ۱ کارمند فعال دارد. ابتدا کارمند قبلی را غیرفعال کنید.';
  if (message.includes('FREE_PLAN_BUSINESS_LIMIT')) return 'پلن رایگان شامل یک کسب‌وکار است.';
  return message;
}
