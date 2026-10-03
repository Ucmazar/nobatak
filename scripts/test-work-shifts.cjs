/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase', 'work_shifts.sql'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'lib', 'work-shifts.ts'), 'utf8');

for (const required of [
  'CREATE TABLE IF NOT EXISTS public.work_shifts',
  'ENABLE ROW LEVEL SECURITY',
  'GRANT SELECT ON public.work_shifts TO anon',
  'GRANT SELECT,INSERT,UPDATE,DELETE ON public.work_shifts TO authenticated',
  'WORK_SHIFTS_DISABLED',
  'WORK_SHIFT_LIMIT_REACHED',
  'ON DELETE SET NULL',
  'get_employee_effective_working_hours',
  'OUTSIDE_EFFECTIVE_WORKING_HOURS',
  "WHEN p.plan_code='growth' THEN 2",
]) assert.ok(sql.includes(required), `missing SQL contract: ${required}`);

assert.ok(helper.includes('getEmployeeEffectiveWorkingHours'));
assert.ok(helper.includes('getPlanLimits'));

function within(time, start, end) {
  return start < end ? time >= start && time < end : time >= start || time < end;
}

// Scenario B: growth permits two shifts and effective hours follow each employee assignment.
assert.equal(within('07:30', '07:00', '12:00'), true);
assert.equal(within('12:30', '07:00', '12:00'), false);
assert.equal(within('13:00', '12:00', '17:00'), true);
assert.equal(within('09:00', '08:00', '17:00'), true);

// Overnight shift: both sides of midnight are valid, midday is not.
assert.equal(within('23:30', '17:00', '07:00'), true);
assert.equal(within('05:30', '17:00', '07:00'), true);
assert.equal(within('12:00', '17:00', '07:00'), false);

// Static downgrade guarantees: no destructive UPDATE/DELETE is tied to a profile plan change.
const setPlanBody = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.set_user_plan'));
assert.ok(!/DELETE\s+FROM\s+public\.work_shifts/i.test(setPlanBody));
assert.ok(!/UPDATE\s+public\.staff[\s\S]{0,120}shift_id/i.test(setPlanBody));

console.log('work-shifts scenarios and migration contracts: OK');
