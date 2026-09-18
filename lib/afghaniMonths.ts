/**
 * تقویم شمسی افغانستان — ماه‌ها و تبدیل تاریخ
 * Afghan Solar Calendar (Shamsi) — Month names and date conversion
 *
 * تمام نام‌ها مطابق تقویم رسمی افغانستان است.
 * نام ماه‌های شمسی در افغانستان با ایران متفاوت است.
 */

// نام ماه‌های رسمی تقویم افغانستان (شمسی)
export const AFGHANI_MONTHS: string[] = [
  'حمل',   // ۱ — Hamal
  'ثور',   // ۲ — Saur
  'جوزا',  // ۳ — Jawza
  'سرطان', // ۴ — Saratan
  'اسد',   // ۵ — Asad
  'سنبله', // ۶ — Sonbola
  'میزان', // ۷ — Mizan
  'عقرب',  // ۸ — Aqrab
  'قوس',   // ۹ — Qaws
  'جدی',   // ۱۰ — Jadi
  'دلو',   // ۱۱ — Dalwa
  'حوت',   // ۱۲ — Hut
];

// نام روزهای هفته به دری
export const DARI_WEEKDAYS: string[] = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
  'شنبه',
];

/**
 * تبدیل عدد به ارقام فارسی/دری
 */
export function toPersianDigits(num: number | string): string {
  return num.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[parseInt(d)]);
}

/**
 * تبدیل تاریخ میلادی به شمسی (جلالی)
 * الگوریتم استاندارد تبدیل گریگوری به جلالی
 * @returns [سال شمسی, ماه شمسی (۱-۱۲), روز شمسی (۱-۳۱)]
 */
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const jMonthDays = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

  const g_y = gy - 1600;
  const g_m = gm - 1;
  const g_d = gd - 1;

  // تعداد روزهای گذشته از ابتدای سال ۱۶۰۰ میلادی
  let g_d_no =
    365 * g_y +
    Math.floor((g_y + 3) / 4) -
    Math.floor((g_y + 99) / 100) +
    Math.floor((g_y + 399) / 400);

  // اضافه کردن روزهای ماه‌های گذشته همان سال
  const isLeapG =
    (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const gMonthDays = [31, isLeapG ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let i = 0; i < g_m; ++i) g_d_no += gMonthDays[i];
  g_d_no += g_d;

  // تبدیل به شمسی
  let j_d_no = g_d_no - 79;

  const j_np = Math.floor(j_d_no / 12053);
  j_d_no %= 12053;

  let jy = 979 + 33 * j_np + 4 * Math.floor(j_d_no / 1461);
  j_d_no %= 1461;

  if (j_d_no >= 366) {
    jy += Math.floor((j_d_no - 1) / 365);
    j_d_no = (j_d_no - 1) % 365;
  }

  let jm = 0;
  for (let i = 0; i < 11 && j_d_no >= jMonthDays[i]; ++i) {
    j_d_no -= jMonthDays[i];
    jm++;
  }

  return [jy, jm + 1, j_d_no + 1];
}

/**
 * فرمت‌بندی تاریخ به سبک افغانستان
 * @param date شیء Date میلادی
 * @param short اگر true باشد، فقط روز و ماه (بدون سال)
 * @returns مثال: "۲۰ سنبله ۱۴۰۵" یا در حالت short: "۲۰ سنبله"
 */
export function formatAfghaniDate(date: Date, short = false): string {
  const [jy, jm, jd] = toJalali(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
  const monthName = AFGHANI_MONTHS[jm - 1];
  if (short) return `${toPersianDigits(jd)} ${monthName}`;
  return `${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
}

/**
 * تبدیل ISO date string (YYYY-MM-DD) به نمایش تاریخ افغانستان
 * @param isoDate رشته تاریخ مثل "2026-09-11"
 * @param short اگر true، بدون سال
 * @returns مثال: "۲۰ سنبله ۱۴۰۵"
 */
export function isoToAfghaniDate(isoDate: string, short = false): string {
  const parts = isoDate.split('-');
  if (parts.length < 3) return isoDate;
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  return formatAfghaniDate(d, short);
}

/**
 * نام ماه افغانستان بر اساس شماره ماه شمسی
 * @param jalaliMonth شماره ماه شمسی (۱ تا ۱۲)
 */
export function getAfghaniMonthName(jalaliMonth: number): string {
  return AFGHANI_MONTHS[jalaliMonth - 1] ?? '';
}

/**
 * نام روز هفته به دری
 * @param date شیء Date
 */
export function getDariWeekday(date: Date): string {
  // 0=Sunday, 1=Monday, ..., 6=Saturday
  const jsDay = date.getDay();
  // در تقویم دری: 0=یکشنبه(Sun), 1=دوشنبه(Mon), ..., 6=شنبه(Sat)
  return DARI_WEEKDAYS[jsDay];
}

/**
 * ساخت لیست ۷ روز آینده با نام ماه‌های افغانستان
 * جایگزین تابع getUpcomingDays در صفحات dashboard و q/[slug]
 */
export function getUpcomingDaysAfghani(count = 7): Array<{
  isoDate: string;
  label: string;
  dayName: string;
  formattedDate: string;
  isToday: boolean;
}> {
  const days = [];
  const [year, month, day] = getKabulTodayISO().split('-').map(Number);
  const now = new Date(year, month - 1, day);

  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    // نام روز هفته به دری
    const dayName = getDariWeekday(d);

    // تاریخ شمسی افغانستان (کوتاه: روز + ماه)
    const formattedDate = formatAfghaniDate(d, true);

    let label = `${dayName} (${formattedDate})`;
    if (i === 0) label = `امروز (${dayName})`;
    if (i === 1) label = `فردا (${dayName})`;

    days.push({
      isoDate,
      label,
      dayName,
      formattedDate,
      isToday: i === 0,
    });
  }

  return days;
}

// Reverse conversion for the Afghan date controls. Invalid days return null.
export function jalaliToISO(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1200 || year > 1600 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return null;
  let low = Math.floor(Date.UTC(year + 621, 0, 1) / 86400000);
  let high = Math.floor(Date.UTC(year + 623, 0, 1) / 86400000);
  const wanted = year * 10000 + month * 100 + day;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const date = new Date(mid * 86400000);
    const [jy, jm, jd] = toJalali(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    const actual = jy * 10000 + jm * 100 + jd;
    if (actual === wanted) return date.toISOString().slice(0, 10);
    if (actual < wanted) low = mid + 1; else high = mid - 1;
  }
  return null;
}
export function getKabulTodayISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kabul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
