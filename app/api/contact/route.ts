import { createHash } from 'node:crypto';
export const runtime='nodejs';
export const maxDuration=30;
const buckets=new Map<string,{count:number;until:number}>();
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'درخواست مجاز نیست.'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return reply({error:'درخواست معتبر نیست.'},415);
 if(Number(request.headers.get('content-length')||0)>24000)return reply({error:'پیام طولانی است.'},413);
 const now=Date.now();for(const [key,value] of buckets)if(value.until<now)buckets.delete(key);
 // Best-effort per-instance abuse protection; configure hosting WAF limits for production.
 const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
 const bucketKey=createHash('sha256').update(ip).digest('hex');const bucket=buckets.get(bucketKey)||{count:0,until:now+600000};
 if(bucket.count>=5||buckets.size>=10000)return reply({error:'درخواست‌های زیادی فرستاده شده؛ چند دقیقه بعد دوباره تلاش کنید.'},429);
 bucket.count++;buckets.set(bucketKey,bucket);
 try{
  const reader=request.body?.getReader();if(!reader)return reply({error:'پیام خالی است.'},400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>24000){await reader.cancel();return reply({error:'پیام طولانی است.'},413);}chunks.push(value);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!body||typeof body!=='object')return reply({error:'اطلاعات فرم معتبر نیست.'},400);
  const {name,email,message,topic,website,requestId}=body;
  if(typeof name!=='string'||name.trim().length<2||name.length>100||typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof message!=='string'||message.trim().length<10||message.length>4000||typeof topic!=='string'||!['پرسش دربارهٔ نوبت','مشکل فنی','پیشنهاد و همکاری','حریم خصوصی و اطلاعات حساب'].includes(topic)||website||typeof requestId!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(requestId))return reply({error:'نام، ایمیل و متن پیام را به‌درستی وارد کنید.'},400);
  const key=process.env.RESEND_API_KEY,from=process.env.CONTACT_FROM_EMAIL;
  if(!key||!from)return reply({error:'ارسال فرم فعلاً در دسترس نیست. لطفاً از واتساپ یا ایمیل مستقیم استفاده کنید.'},503);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`contact-${requestId}`},body:JSON.stringify({from,to:['fahimullahrasty@gmail.com'],reply_to:email.trim(),subject:`نوبت | ${topic}`,text:`نام: ${name.trim()}\nایمیل: ${email.trim()}\nموضوع: ${topic}\n\n${message.trim()}`}),signal:AbortSignal.timeout(10000)});
  const result=await response.json();if(!response.ok||typeof result.id!=='string')return reply({error:'ارسال پیام تأیید نشد؛ دوباره تلاش کنید یا با واتساپ تماس بگیرید.'},502);
  return reply({success:true});
 }catch(error){return reply({error:error instanceof SyntaxError?'اطلاعات فرم معتبر نیست.':'پاسخ سرویس ایمیل دریافت نشد. دوباره تلاش کنید یا از واتساپ استفاده کنید.'},error instanceof SyntaxError?400:502);}
}
