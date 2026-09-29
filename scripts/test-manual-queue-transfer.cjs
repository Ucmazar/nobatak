const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const root = process.env.NOBATAK_TEST_ROOT || path.join(__dirname, '..');
  const owner = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const business = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const staff = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const ids = [1, 2, 3, 4].map(n => `00000000-0000-0000-0000-00000000000${n}`);
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT current_setting('request.jwt.claim.sub', true)::uuid$$;
    CREATE TABLE profiles(id uuid PRIMARY KEY, role text NOT NULL, is_active boolean DEFAULT true);
    CREATE TABLE businesses(id uuid PRIMARY KEY, owner_id uuid NOT NULL, is_active boolean DEFAULT true);
    CREATE TABLE services(id uuid PRIMARY KEY, duration_minutes integer NOT NULL DEFAULT 20);
    CREATE TABLE appointments(
      id uuid PRIMARY KEY, business_id uuid NOT NULL, service_id uuid, staff_id uuid,
      customer_name text NOT NULL, queue_number integer NOT NULL, status text NOT NULL,
      estimated_wait_minutes integer NOT NULL DEFAULT 0, appointment_date date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), late_deadline_at timestamptz
    );
    INSERT INTO profiles VALUES ('${owner}','user',true);
    INSERT INTO businesses VALUES ('${business}','${owner}',true);
    INSERT INTO appointments(id,business_id,staff_id,customer_name,queue_number,status,appointment_date,created_at) VALUES
      ('${ids[0]}','${business}','${staff}','احمد',1,'waiting','2026-09-30','2026-09-30 08:00Z'),
      ('${ids[1]}','${business}','${staff}','فهیم',2,'waiting','2026-09-30','2026-09-30 08:01Z'),
      ('${ids[2]}','${business}','${staff}','علی',3,'waiting','2026-09-30','2026-09-30 08:02Z'),
      ('${ids[3]}','${business}','${staff}','حسن',4,'waiting','2026-09-30','2026-09-30 08:03Z');
    SELECT set_config('request.jwt.claim.sub','${owner}',false);
  `);
  await db.exec(fs.readFileSync(path.join(root, 'supabase', 'appointment_delay_management.sql'), 'utf8'));
  const result = (await db.query(`SELECT move_appointment_back('${ids[1]}', 2) AS result`)).rows[0].result;
  assert.equal(result.moved, 2);
  const rows = (await db.query('SELECT customer_name,queue_number,late_count FROM appointments ORDER BY queue_number')).rows;
  assert.deepEqual(rows.map(row => row.customer_name), ['احمد', 'علی', 'حسن', 'فهیم']);
  assert.equal(rows.find(row => row.customer_name === 'فهیم').late_count, 2);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='appointments' AND column_name='late_deadline_at'")).rows[0].count, 0);
  console.log('manual queue transfer SQL passed');
})().catch(error => { console.error(error); process.exit(1); });
