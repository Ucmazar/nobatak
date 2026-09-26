// Run with PGLITE_MODULE pointing to an isolated @electric-sql/pglite installation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
async function main(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,role text,is_active boolean);
 CREATE TABLE public.businesses(id uuid PRIMARY KEY,owner_id uuid,name text,is_active boolean);
 CREATE TABLE public.appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid REFERENCES businesses(id),appointment_date date,status text,customer_name text,queue_number int,staff_id uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE public.telegram_subscriptions(appointment_id uuid PRIMARY KEY,chat_id text,enabled boolean);
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 GRANT SELECT ON businesses TO anon,authenticated;
 INSERT INTO profiles VALUES('11111111-1111-1111-1111-111111111111','user',true),('22222222-2222-2222-2222-222222222222','user',true),('33333333-3333-3333-3333-333333333333','superadmin',true);
 INSERT INTO businesses VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Shop A',true),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Shop B',true);`);
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/daily_booking_control.sql'),'utf8');
 await db.exec(sql);await db.exec(sql);
 const today=(await db.query(`SELECT (now() AT TIME ZONE 'Asia/Kabul')::date::text AS day`)).rows[0].day;
 const biz='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const user='11111111-1111-1111-1111-111111111111';
 let index=0;
 const requestId=()=>`99999999-9999-9999-9999-${String(++index).padStart(12,'0')}`;
 async function asUser(id=user){await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated');}
 async function call(closed,reason,cancel,id=requestId()){return (await db.query('SELECT public.set_business_day_booking($1,$2,$3,$4,$5) AS result',[biz,closed,reason,cancel,id])).rows[0].result;}
 await db.query(`INSERT INTO appointments(id,business_id,appointment_date,status,customer_name,queue_number) VALUES
 ('10000000-0000-0000-0000-000000000001',$1,$2,'waiting','A',1),
 ('10000000-0000-0000-0000-000000000002',$1,$2,'serving','B',2),
 ('10000000-0000-0000-0000-000000000003',$1,$2,'completed','C',3),
 ('10000000-0000-0000-0000-000000000004',$1,$2::date+1,'waiting','Tomorrow',1),
 ('10000000-0000-0000-0000-000000000005','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',$2,'waiting','Other shop',1),
 ('10000000-0000-0000-0000-000000000006',$1,$2::date-1,'waiting','Yesterday',1)`,[biz,today]);
 await db.exec(`INSERT INTO telegram_subscriptions VALUES('10000000-0000-0000-0000-000000000001','chat-a',true),('10000000-0000-0000-0000-000000000002','chat-b',true),('10000000-0000-0000-0000-000000000004','chat-tomorrow',true);`);
 await asUser();await assert.rejects(call(true,'',false),/REASON_REQUIRED/);
 await asUser('22222222-2222-2222-2222-222222222222');await assert.rejects(call(true,'رخصتی',true),/NOT_AUTHORIZED/);
 await asUser();const stopped=await call(true,'رخصتی',false);assert.equal(stopped.cancelled,0);
 await db.exec('RESET ROLE');await assert.rejects(db.query(`INSERT INTO appointments(business_id,appointment_date,status,customer_name,queue_number) VALUES($1,$2,'waiting','Late',4)`,[biz,today]),/BOOKING_CLOSED/);
 await db.query(`INSERT INTO appointments(business_id,appointment_date,status,customer_name,queue_number) VALUES($1,$2::date+1,'waiting','Future',2)`,[biz,today]);
 await asUser();await call(false,'',false);
 const id=requestId(),result=await call(true,'مریضی',true,id);assert.equal(result.cancelled,2);assert.equal(result.queued,2);
 assert.deepEqual(await call(true,'مریضی',true,id),result);
 await assert.rejects(call(true,'دلیل دیگر',true,id),/REQUEST_CONFLICT/);
 const summary=(await db.query('SELECT daily_notice_summary($1) AS result',[biz])).rows[0].result;assert.equal(summary.pending,2);
 await assert.rejects(db.query('SELECT * FROM daily_cancellation_notices'),/permission denied/);
 await assert.rejects(db.query(`UPDATE business_day_closures SET is_closed=false`),/permission denied/);
 await db.exec('RESET ROLE');
 const rows=(await db.query('SELECT customer_name,status FROM appointments ORDER BY customer_name')).rows;
 for(const name of ['Tomorrow','Yesterday','Other shop','Future'])assert.equal(rows.find(r=>r.customer_name===name).status,'waiting');
 assert.equal(rows.find(r=>r.customer_name==='C').status,'completed');
 const notices=(await db.query('SELECT message FROM daily_cancellation_notices')).rows;assert.ok(notices.every(n=>n.message.includes('مریضی')&&n.message.includes('لغو')));
 await assert.rejects(db.query("UPDATE appointments SET status='waiting' WHERE customer_name='A'"),/BOOKING_CLOSED/);
 await db.exec('SET ROLE service_role');
 const claimed1=(await db.query('SELECT * FROM claim_daily_notices($1,1)',[biz])).rows;
 const claimed2=(await db.query('SELECT * FROM claim_daily_notices($1,1)',[biz])).rows;
 assert.equal(claimed1.length,1);assert.equal(claimed2.length,1);assert.notEqual(claimed1[0].id,claimed2[0].id);
 assert.equal((await db.query('SELECT * FROM claim_daily_notices(NULL,20)')).rows.length,0);
 await db.query("UPDATE daily_cancellation_notices SET status='failed',last_error='offline' WHERE id=$1",[claimed1[0].id]);
 const retry=(await db.query('SELECT * FROM claim_daily_notices(NULL,20)')).rows;assert.equal(retry.length,1);assert.equal(retry[0].attempts,2);
 await asUser();await call(false,'',false);
 await db.exec('RESET ROLE');assert.equal((await db.query("SELECT status FROM appointments WHERE customer_name='A'")).rows[0].status,'cancelled');
 // Atomic rollback: a failing outbox insert must also undo cancellations and closure.
 await db.query(`INSERT INTO appointments(id,business_id,appointment_date,status,customer_name,queue_number) VALUES('10000000-0000-0000-0000-000000000007',$1,$2,'waiting','Atomic',7)`,[biz,today]);
 await db.exec("INSERT INTO telegram_subscriptions VALUES('10000000-0000-0000-0000-000000000007','atomic',true); ALTER TABLE daily_cancellation_notices ADD CONSTRAINT test_failure CHECK (chat_id<>'atomic');");
 await asUser();await assert.rejects(call(true,'رخصتی',true),/test_failure/);
 await db.exec('RESET ROLE');assert.equal((await db.query("SELECT status FROM appointments WHERE customer_name='Atomic'")).rows[0].status,'waiting');
 assert.equal((await db.query('SELECT is_closed FROM business_day_closures WHERE business_id=$1',[biz])).rows[0].is_closed,false);
 await db.exec('ALTER TABLE daily_cancellation_notices DROP CONSTRAINT test_failure;');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/performance_indexes.sql'),'utf8').replaceAll(' CONCURRENTLY',''));
 await db.close();console.log('PASS: migration rerun, ownership, required reason, today-only scope, booking/reopening, atomic rollback, idempotency, private outbox, independent claims and failure retry; index DDL');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
