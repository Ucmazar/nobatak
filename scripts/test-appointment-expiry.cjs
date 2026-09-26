const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 // pg_cron is not included in embedded PostgreSQL: stub only its schedule registration.
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE TABLE appointments(id int PRIMARY KEY, appointment_date date NOT NULL,status text);
 CREATE SCHEMA cron; CREATE TABLE cron.job(name text PRIMARY KEY,schedule text,command text);
 CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
 INSERT INTO cron.job VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET schedule=$2,command=$3 RETURNING 1::bigint $$;
 INSERT INTO appointments VALUES
 (1,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date-1,'waiting'),
 (2,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date-15,'serving'),
 (3,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date-1,'completed'),
 (4,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date-1,'cancelled'),
 (5,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date,'waiting'),
 (6,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date+1,'waiting'),
 (7,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date,'serving');`);
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/auto_cancel_expired_appointments.sql'),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;','');
 await db.exec(sql);await db.exec(sql);
 assert.deepEqual((await db.query('SELECT status FROM appointments ORDER BY id')).rows.map(x=>x.status),['cancelled','cancelled','completed','cancelled','waiting','waiting','serving']);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM cron.job')).rows[0].n,1);
 assert.equal((await db.query('SELECT cancel_expired_appointments() AS n')).rows[0].n,0);
 await assert.rejects(db.exec("UPDATE appointments SET status='waiting' WHERE id=1"),/APPOINTMENT_DATE_EXPIRED/);
 await assert.rejects(db.exec("INSERT INTO appointments VALUES(8,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date-1,'serving')"),/APPOINTMENT_DATE_EXPIRED/);
 await db.exec("SET ROLE authenticated");await assert.rejects(db.query('SELECT public.cancel_expired_appointments()'),/permission denied/);await db.exec('RESET ROLE');
 const boundaries=(await db.query(`SELECT ('2026-09-26 19:29:59+00'::timestamptz AT TIME ZONE 'Asia/Kabul')::date::text AS before,('2026-09-26 19:30:00+00'::timestamptz AT TIME ZONE 'Asia/Kabul')::date::text AS after`)).rows[0];
 assert.equal(boundaries.before,'2026-09-26');assert.equal(boundaries.after,'2026-09-27');
 await db.close();console.log('PASS overdue cancellation, today/future/completed preservation, repeatability, reactivation guard, permissions and Kabul midnight. Cron execution requires hosted Supabase.');
})().catch(e=>{console.error(e);process.exit(1)});
