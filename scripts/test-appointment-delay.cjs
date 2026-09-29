const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const root = process.env.NOBATAK_TEST_ROOT || path.join(__dirname, '..');
  const biz = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const staffA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const staffB = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const ids = {
    done: '00000000-0000-0000-0000-000000000001',
    late: '00000000-0000-0000-0000-000000000002',
    next: '00000000-0000-0000-0000-000000000003',
    last: '00000000-0000-0000-0000-000000000004',
    other: '00000000-0000-0000-0000-000000000005',
  };
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE businesses(id uuid PRIMARY KEY, no_show_grace_minutes integer NOT NULL DEFAULT 5, is_active boolean DEFAULT true, opening_time time DEFAULT '00:00');
    CREATE TABLE services(id uuid PRIMARY KEY, duration_minutes integer NOT NULL DEFAULT 20);
    CREATE TABLE appointments(
      id uuid PRIMARY KEY, business_id uuid NOT NULL, service_id uuid, staff_id uuid,
      customer_name text NOT NULL, queue_number integer NOT NULL, status text NOT NULL,
      estimated_wait_minutes integer NOT NULL DEFAULT 0,
      appointment_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE SCHEMA cron;
    CREATE TABLE cron.job(name text PRIMARY KEY, schedule text, command text);
    CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
      INSERT INTO cron.job VALUES($1,$2,$3)
      ON CONFLICT(name) DO UPDATE SET schedule=$2,command=$3 RETURNING 1::bigint
    $$;
    INSERT INTO businesses(id) VALUES('${biz}');
    INSERT INTO appointments VALUES
      ('${ids.done}','${biz}',NULL,'${staffA}','احمد',1,'completed',0,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date,now()-interval '40 minutes'),
      ('${ids.late}','${biz}',NULL,'${staffA}','فهیم',2,'waiting',0,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date,now()-interval '30 minutes'),
      ('${ids.next}','${biz}',NULL,'${staffA}','علی',3,'waiting',0,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date,now()-interval '20 minutes'),
      ('${ids.last}','${biz}',NULL,'${staffA}','حسن',4,'waiting',0,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date,now()-interval '10 minutes'),
      ('${ids.other}','${biz}',NULL,'${staffB}','مرتضی',5,'waiting',0,(statement_timestamp() AT TIME ZONE 'Asia/Kabul')::date,now()-interval '10 minutes');
  `);
  const migration = fs.readFileSync(path.join(root, 'supabase/appointment_delay_management.sql'), 'utf8')
    .replace('CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;', '');
  await db.exec(migration);
  await db.exec(migration);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM cron.job')).rows[0].n, 1);

  await db.query('UPDATE appointments SET late_deadline_at=now()-interval \'1 minute\' WHERE id=$1', [ids.late]);
  let result = (await db.query('SELECT process_late_appointments() AS result')).rows[0].result;
  assert.equal(Number(result.processed), 1);
  let rows = (await db.query('SELECT id,queue_number,late_count FROM appointments ORDER BY queue_number')).rows;
  assert.deepEqual(rows.filter(row => [ids.late, ids.next].includes(row.id)).map(row => [row.id, row.queue_number, row.late_count]), [[ids.next, 2, 0], [ids.late, 3, 1]]);
  assert.equal(rows.find(row => row.id === ids.other).queue_number, 5);

  await db.query("UPDATE appointments SET status='completed' WHERE id=$1", [ids.next]);
  await db.query('SELECT process_late_appointments()');
  await db.query('UPDATE appointments SET late_deadline_at=now()-interval \'1 minute\' WHERE id=$1', [ids.late]);
  result = (await db.query('SELECT process_late_appointments() AS result')).rows[0].result;
  assert.equal(Number(result.processed), 1);
  rows = (await db.query('SELECT id,queue_number,late_count FROM appointments ORDER BY queue_number')).rows;
  assert.deepEqual(rows.filter(row => [ids.late, ids.last].includes(row.id)).map(row => [row.id, row.queue_number, row.late_count]), [[ids.last, 3, 0], [ids.late, 4, 2]]);

  await db.query("UPDATE appointments SET status='completed' WHERE id=$1", [ids.last]);
  await db.query('SELECT process_late_appointments()');
  await db.query('UPDATE appointments SET late_deadline_at=now()-interval \'20 minutes\' WHERE id=$1', [ids.late]);
  result = (await db.query('SELECT process_late_appointments() AS result')).rows[0].result;
  assert.equal(Number(result.processed), 0);
  assert.equal(Number((await db.query('SELECT late_count FROM appointments WHERE id=$1', [ids.late])).rows[0].late_count), 2);

  await db.query("UPDATE appointments SET status='serving',late_deadline_at=now()-interval '1 minute' WHERE id=$1", [ids.other]);
  result = (await db.query('SELECT process_late_appointments() AS result')).rows[0].result;
  assert.equal(Number(result.processed), 0);
  assert.equal((await db.query('SELECT late_deadline_at FROM appointments WHERE id=$1', [ids.other])).rows[0].late_deadline_at, null);

  await db.close();
  console.log('PASS: one-step swaps, repeated delay count, last-in-queue preservation, staff isolation, serving exclusion, persisted estimates and idempotent cron registration.');
})().catch(error => { console.error(error); process.exit(1); });
