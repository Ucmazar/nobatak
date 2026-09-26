const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async()=>{
 const db=new PGlite();const root=process.env.NOBATAK_TEST_ROOT || path.join(__dirname,'..');
 const migration=name=>fs.readFileSync(path.join(root,'supabase',name),'utf8');
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth;CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text,is_active boolean);
 CREATE TABLE businesses(id uuid PRIMARY KEY,owner_id uuid,name text,is_active boolean,max_daily_appointments integer DEFAULT 20);
 CREATE TABLE staff(id uuid PRIMARY KEY,business_id uuid,is_active boolean,max_daily_appointments integer);
 CREATE TABLE appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid,appointment_date date,status text,customer_name text,queue_number int,staff_id uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE telegram_subscriptions(appointment_id uuid PRIMARY KEY,chat_id text,enabled boolean);
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;GRANT SELECT ON businesses TO anon,authenticated;
 INSERT INTO profiles VALUES('11111111-1111-1111-1111-111111111111','user',true);
 INSERT INTO businesses(id,owner_id,name,is_active) VALUES('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Shop',true);
 INSERT INTO staff VALUES('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true,2);`);
 await db.exec(migration('daily_booking_control.sql'));await db.exec(migration('staff_daily_capacity.sql'));
 const biz='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',staff='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 const day=(await db.query(`SELECT (now() AT TIME ZONE 'Asia/Kabul')::date::text AS d`)).rows[0].d;
 // Unlimited while creating source fixtures, then restore real limit.
 await db.exec('UPDATE staff SET max_daily_appointments=0');
 for(const [name,offset,status,number] of [['A',0,'waiting',1],['B',0,'serving',2],['Done',0,'completed',3],['Cancelled',0,'cancelled',4],['Tomorrow1',1,'waiting',1],['Tomorrow2',1,'waiting',2],['Later',3,'waiting',7],['FutureSource',6,'waiting',1],['FutureExisting',7,'waiting',7]]) {
 await db.query(`INSERT INTO appointments(business_id,staff_id,appointment_date,status,customer_name,queue_number) VALUES($1,$2,$3::date+$4::int,$5,$6,$7)`,[biz,staff,day,offset,status,name,number]);}
 await db.exec('UPDATE staff SET max_daily_appointments=2');
 await db.query(`INSERT INTO business_day_closures(business_id,booking_date,is_closed,reason) VALUES($1,$2::date+2,true,'Holiday')`,[biz,day]);
 await db.exec("INSERT INTO telegram_subscriptions SELECT id,'chat',true FROM appointments WHERE customer_name IN ('A','B')");
 const transfer=fs.readFileSync(path.join(__dirname,'../supabase/booking_day_transfer.sql'),'utf8');await db.exec(transfer);await db.exec(transfer);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",['11111111-1111-1111-1111-111111111111']);
 const id='99999999-9999-9999-9999-999999999999';
 const call=(date=day,closed=true,req=id)=>db.query('SELECT set_business_day_with_transfer($1,$2,$3,$4,$5) AS r',[biz,date,closed,'رخصتی عمومی',req]);
 await db.exec('SET ROLE authenticated');const result=(await call()).rows[0].r;assert.equal(result.moved,5);assert.equal(result.queued,2);assert.deepEqual((await call()).rows[0].r,result);
 await assert.rejects(call(day,false),/REQUEST_CONFLICT/);
 await db.exec('RESET ROLE');const rows=(await db.query('SELECT customer_name,status,queue_number,(appointment_date-$1::date)::int AS offset FROM appointments',[day])).rows;const get=name=>rows.find(r=>r.customer_name===name);
 assert.equal(get('A').offset,1);assert.equal(get('A').queue_number,1);assert.equal(get('B').offset,1);assert.equal(get('B').queue_number,2);assert.equal(get('Tomorrow1').offset,3);assert.equal(get('Tomorrow2').offset,3);assert.equal(get('Later').offset,4);assert.equal(get('B').status,'waiting');assert.equal(get('Done').offset,0);assert.equal(get('Done').status,'completed');assert.equal(get('Cancelled').status,'cancelled');assert.equal(get('Later').queue_number,1);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM daily_cancellation_notices')).rows[0].n,2);
 // Selected future date is honored. Invalid staff causes full rollback of the closure.
 const future=(await db.query('SELECT ($1::date+6)::text AS d',[day])).rows[0].d;
 await db.exec('UPDATE staff SET is_active=false');await assert.rejects(call(future,true,'88888888-8888-8888-8888-888888888888'),/INVALID_STAFF/);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM business_day_closures WHERE booking_date=$1',[future])).rows[0].n,0);
 await db.exec('UPDATE staff SET is_active=true');await call(future,true,'88888888-8888-8888-8888-888888888888');
 assert.equal((await db.query("SELECT appointment_date=($1::date+1) AS moved FROM appointments WHERE customer_name='FutureSource'",[future])).rows[0].moved,true);
 assert.equal((await db.query("SELECT queue_number FROM appointments WHERE customer_name='FutureSource'")).rows[0].queue_number,8);
 assert.equal((await db.query("SELECT queue_number FROM appointments WHERE customer_name='FutureExisting'")).rows[0].queue_number,7);
 await call(day,false,'77777777-7777-7777-7777-777777777777');assert.equal((await db.query("SELECT count(*)::int AS n FROM appointments WHERE appointment_date=$1 AND status IN ('waiting','serving')",[day])).rows[0].n,0);
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",['22222222-2222-2222-2222-222222222222']);await assert.rejects(call(),/NOT_AUTHORIZED/);
 await db.close();console.log('PASS: selected day, cascading full days/closed destination skip, capacity, append queue order, preserved history, idempotency, transactional rollback, authorization and reopen.');
})().catch(e=>{console.error(e);process.exit(1)});
