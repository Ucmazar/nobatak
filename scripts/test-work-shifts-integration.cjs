/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');

(async()=>{
 const db=new PGlite(),root=process.env.NOBATAK_TEST_ROOT||path.join(__dirname,'..');
 const free='11111111-1111-1111-1111-111111111111',growth='22222222-2222-2222-2222-222222222222';
 const custom='33333333-3333-3333-3333-333333333333',unlimited='44444444-4444-4444-4444-444444444444',admin='99999999-9999-9999-9999-999999999999';
 const freeBiz='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',growthBiz='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
 const customBiz='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',unlimitedBiz='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4';
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_role::text$$;
 CREATE TABLE profiles(id uuid PRIMARY KEY,role text DEFAULT 'user',is_active boolean DEFAULT true,plan_code text DEFAULT 'free',plan_expires_on date,max_businesses integer DEFAULT 1,max_services_per_business integer DEFAULT 3,max_staff_per_business integer DEFAULT 1,max_daily_appointments_per_business integer DEFAULT 10);
 CREATE TABLE businesses(id uuid PRIMARY KEY,owner_id uuid REFERENCES profiles(id),is_active boolean DEFAULT true,opening_time time,closing_time time);
 CREATE TABLE staff(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid REFERENCES businesses(id),name text DEFAULT 'کارمند',is_active boolean DEFAULT true,max_daily_appointments integer DEFAULT 0);
 CREATE TABLE appointments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid REFERENCES businesses(id),staff_id uuid REFERENCES staff(id),appointment_date date DEFAULT date '2099-01-01',status text DEFAULT 'waiting');
 CREATE TABLE business_day_closures(business_id uuid REFERENCES businesses(id),booking_date date,is_closed boolean,reason text DEFAULT '');
 CREATE FUNCTION update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=now();RETURN NEW;END$$;
 CREATE FUNCTION suspension_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='superadmin' AND is_active IS NOT FALSE)$$;
 CREATE FUNCTION guard_free_plan() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;
 CREATE TRIGGER guard_free_plan BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION guard_free_plan();
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon,authenticated;
 INSERT INTO profiles(id,role,plan_code,plan_expires_on) VALUES
 ('${free}','user','free',null),('${growth}','user','growth','2099-12-31'),('${custom}','user','custom','2099-12-31'),('${unlimited}','user','custom','2099-12-31'),('${admin}','superadmin','legacy',null);
 INSERT INTO businesses(id,owner_id,opening_time,closing_time) VALUES
 ('${freeBiz}','${free}','08:00','17:00'),('${growthBiz}','${growth}','08:00','17:00'),('${customBiz}','${custom}','08:00','17:00'),('${unlimitedBiz}','${unlimited}','08:00','17:00');`);
 const migration=fs.readFileSync(path.join(root,'supabase','work_shifts.sql'),'utf8');
 await db.exec(migration);await db.exec(migration);
 const asUser=async id=>{await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('SET ROLE authenticated');};
 const insertShift=(biz,name,start='07:00',end='12:00')=>db.query('INSERT INTO work_shifts(business_id,name,start_time,end_time) VALUES($1,$2,$3,$4) RETURNING id',[biz,name,start,end]);

 // A — free: disabled and all employees resolve to business hours.
 await asUser(free);await assert.rejects(insertShift(freeBiz,'غیرمجاز'),/WORK_SHIFTS_DISABLED/);
 const freeStaff=(await db.query('INSERT INTO staff(business_id) VALUES($1) RETURNING id',[freeBiz])).rows[0].id;
 let hours=(await db.query('SELECT source,start_time::text,end_time::text FROM get_employee_effective_working_hours($1,$2)',[freeStaff,freeBiz])).rows[0];
 assert.deepEqual(hours,{source:'business',start_time:'08:00:00',end_time:'17:00:00'});

 // B — growth: two shifts, assignments, general fallback, third rejected.
 await asUser(growth);const morning=(await insertShift(growthBiz,'صبح')).rows[0].id;const evening=(await insertShift(growthBiz,'عصر','12:00','17:00')).rows[0].id;
 await assert.rejects(insertShift(growthBiz,'سوم'),/WORK_SHIFT_LIMIT_REACHED:2/);
 const staffMorning=(await db.query('INSERT INTO staff(business_id,shift_id) VALUES($1,$2) RETURNING id',[growthBiz,morning])).rows[0].id;
 const staffEvening=(await db.query('INSERT INTO staff(business_id,shift_id) VALUES($1,$2) RETURNING id',[growthBiz,evening])).rows[0].id;
 const staffGeneral=(await db.query('INSERT INTO staff(business_id) VALUES($1) RETURNING id',[growthBiz])).rows[0].id;
 for(const [id,start,end] of [[staffMorning,'07:00:00','12:00:00'],[staffEvening,'12:00:00','17:00:00'],[staffGeneral,'08:00:00','17:00:00']]){
  hours=(await db.query('SELECT start_time::text,end_time::text FROM get_employee_effective_working_hours($1,$2)',[id,growthBiz])).rows[0];assert.deepEqual(hours,{start_time:start,end_time:end});
 }
 await db.query("INSERT INTO appointments(business_id,staff_id,appointment_time) VALUES($1,$2,'08:00')",[growthBiz,staffMorning]);
 await assert.rejects(db.query("INSERT INTO appointments(business_id,staff_id,appointment_time) VALUES($1,$2,'13:00')",[growthBiz,staffMorning]),/OUTSIDE_EFFECTIVE_WORKING_HOURS/);

 // C/D — custom finite and unlimited limits set only by Superadmin.
 await asUser(admin);await db.query("SELECT set_user_plan($1,'custom',1,3,10,100,'2099-12-31',true,5)",[custom]);
 await db.query("SELECT set_user_plan($1,'custom',1,3,10,100,'2099-12-31',true,null)",[unlimited]);
 await asUser(custom);for(let i=1;i<=5;i++)await insertShift(customBiz,'سفارشی '+i);await assert.rejects(insertShift(customBiz,'ششم'),/WORK_SHIFT_LIMIT_REACHED:5/);
 await asUser(unlimited);for(let i=1;i<=8;i++)await insertShift(unlimitedBiz,'نامحدود '+i);

 // E — downgrade 5 -> growth preserves rows and employee links, blocks new rows.
 await asUser(custom);const customShift=(await db.query('SELECT id FROM work_shifts WHERE business_id=$1 ORDER BY created_at LIMIT 1',[customBiz])).rows[0].id;
 const customStaff=(await db.query('INSERT INTO staff(business_id,shift_id) VALUES($1,$2) RETURNING id',[customBiz,customShift])).rows[0].id;
 await asUser(admin);await db.query("SELECT set_user_plan($1,'growth',1,3,1,10,'2099-12-31',true,2)",[custom]);
 await asUser(custom);
 assert.equal((await db.query('SELECT count(*)::int n FROM work_shifts WHERE business_id=$1',[customBiz])).rows[0].n,5);
 assert.equal((await db.query('SELECT shift_id FROM staff WHERE id=$1',[customStaff])).rows[0].shift_id,customShift);
 await assert.rejects(insertShift(customBiz,'پس از کاهش'),/WORK_SHIFT_LIMIT_REACHED:2/);

 // F — free fallback preserves data and links, then reactivation restores the shift.
 await asUser(admin);await db.query("SELECT set_user_plan($1,'free',1,3,1,10,null,false,0)",[custom]);
 await asUser(custom);
 assert.equal((await db.query('SELECT count(*)::int n FROM work_shifts WHERE business_id=$1',[customBiz])).rows[0].n,5);
 assert.equal((await db.query('SELECT shift_id FROM staff WHERE id=$1',[customStaff])).rows[0].shift_id,customShift);
 hours=(await db.query('SELECT source,start_time::text,end_time::text FROM get_employee_effective_working_hours($1,$2)',[customStaff,customBiz])).rows[0];assert.deepEqual(hours,{source:'business',start_time:'08:00:00',end_time:'17:00:00'});
 await asUser(admin);await db.query("SELECT set_user_plan($1,'growth',1,3,1,10,'2099-12-31',true,2)",[custom]);
 await asUser(custom);
 hours=(await db.query('SELECT source FROM get_employee_effective_working_hours($1,$2)',[customStaff,customBiz])).rows[0];assert.equal(hours.source,'shift');

 // Overnight boundaries and delete-to-null behavior.
 await asUser(unlimited);const night=(await insertShift(unlimitedBiz,'شب','17:00','07:00')).rows[0].id;
 const nightStaff=(await db.query('INSERT INTO staff(business_id,shift_id) VALUES($1,$2) RETURNING id',[unlimitedBiz,night])).rows[0].id;
 await db.query("INSERT INTO appointments(business_id,staff_id,appointment_time) VALUES($1,$2,'23:00'),($1,$2,'05:00')",[unlimitedBiz,nightStaff]);
 await assert.rejects(db.query("INSERT INTO appointments(business_id,staff_id,appointment_time) VALUES($1,$2,'12:00')",[unlimitedBiz,nightStaff]),/OUTSIDE_EFFECTIVE_WORKING_HOURS/);
 await db.query('DELETE FROM work_shifts WHERE id=$1',[night]);assert.equal((await db.query('SELECT shift_id FROM staff WHERE id=$1',[nightStaff])).rows[0].shift_id,null);

 // Authenticated owners cannot read another business's active shifts.
 await asUser(free);assert.equal((await db.query('SELECT count(*)::int n FROM work_shifts WHERE business_id=$1',[growthBiz])).rows[0].n,0);
 console.log('work-shifts integration scenarios A-F: OK');
})().catch(error=>{console.error(error);process.exit(1)});
