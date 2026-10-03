-- Manual subscription and payment management for Nobatak.
-- Apply after plan_feature_access.sql, business_suspension.sql and work_shifts.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.subscription_plan_catalog (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_-]*$'),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  default_amount numeric(14,2) CHECK (default_amount IS NULL OR default_amount >= 0),
  currency text NOT NULL DEFAULT 'AFN' CHECK (currency ~ '^[A-Z]{3}$'),
  duration_months integer CHECK (duration_months IS NULL OR duration_months BETWEEN 1 AND 120),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(limits) = 'object'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.subscription_plan_catalog(code,name,default_amount,currency,duration_months,limits)
VALUES
 ('free','رایگان',0,'AFN',NULL,'{"max_businesses":1,"max_services":3,"max_staff":1,"max_daily_appointments":10,"advanced_scheduling":false,"work_shifts_enabled":false,"max_work_shifts":0}'::jsonb),
 ('growth','رشد',490,'AFN',1,'{"max_businesses":3,"max_services":20,"max_staff":10,"max_daily_appointments":100,"advanced_scheduling":true,"work_shifts_enabled":true,"max_work_shifts":2}'::jsonb),
 ('custom','اختصاصی',NULL,'AFN',NULL,'{}'::jsonb)
ON CONFLICT (code) DO UPDATE SET name=excluded.name, limits=excluded.limits, updated_at=now();

CREATE TABLE IF NOT EXISTS public.business_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  plan_code text NOT NULL REFERENCES public.subscription_plan_catalog(code),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','suspended','cancelled')),
  started_at timestamptz NOT NULL,
  expires_at timestamptz,
  custom_limits jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(custom_limits) = 'object'),
  status_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > started_at)
);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.business_subscriptions(id) ON DELETE SET NULL,
  plan_code text NOT NULL REFERENCES public.subscription_plan_catalog(code),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'AFN' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','bank_transfer','hesabpay','hawala','other')),
  custom_payment_method text,
  payment_status text NOT NULL CHECK (payment_status IN ('pending','paid','cancelled','refunded')),
  paid_at timestamptz,
  subscription_start_at timestamptz NOT NULL,
  subscription_end_at timestamptz NOT NULL,
  reference_number text,
  note text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subscription_end_at > subscription_start_at),
  CHECK ((payment_method='other' AND length(trim(coalesce(custom_payment_method,'')))>0) OR payment_method<>'other'),
  CHECK ((payment_status='paid' AND paid_at IS NOT NULL) OR payment_status<>'paid')
);

CREATE TABLE IF NOT EXISTS public.subscription_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.business_subscriptions(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
  action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_payments_business_created_idx ON public.subscription_payments(business_id,created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_payments_status_paid_idx ON public.subscription_payments(payment_status,paid_at DESC);
CREATE INDEX IF NOT EXISTS business_subscriptions_expiry_idx ON public.business_subscriptions(status,expires_at);
CREATE INDEX IF NOT EXISTS subscription_audit_business_idx ON public.subscription_audit_logs(business_id,created_at DESC);

ALTER TABLE public.subscription_plan_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_catalog_read ON public.subscription_plan_catalog;
CREATE POLICY plan_catalog_read ON public.subscription_plan_catalog FOR SELECT TO authenticated USING (is_active OR public.suspension_is_admin());
DROP POLICY IF EXISTS plan_catalog_admin_write ON public.subscription_plan_catalog;
CREATE POLICY plan_catalog_admin_write ON public.subscription_plan_catalog FOR ALL TO authenticated USING (public.suspension_is_admin()) WITH CHECK (public.suspension_is_admin());

DROP POLICY IF EXISTS subscriptions_admin_only ON public.business_subscriptions;
CREATE POLICY subscriptions_admin_only ON public.business_subscriptions FOR ALL TO authenticated USING (public.suspension_is_admin()) WITH CHECK (public.suspension_is_admin());
DROP POLICY IF EXISTS payments_admin_only ON public.subscription_payments;
CREATE POLICY payments_admin_only ON public.subscription_payments FOR ALL TO authenticated USING (public.suspension_is_admin()) WITH CHECK (public.suspension_is_admin());
DROP POLICY IF EXISTS subscription_audit_admin_only ON public.subscription_audit_logs;
CREATE POLICY subscription_audit_admin_only ON public.subscription_audit_logs FOR ALL TO authenticated USING (public.suspension_is_admin()) WITH CHECK (public.suspension_is_admin());

CREATE OR REPLACE FUNCTION public.effective_subscription_status(p_status text,p_expires_at timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE WHEN p_status='active' AND p_expires_at IS NOT NULL AND p_expires_at<=now() THEN 'expired' ELSE p_status END
$$;

CREATE OR REPLACE FUNCTION public.subscription_remaining_days(p_expires_at timestamptz)
RETURNS integer LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT CASE WHEN p_expires_at IS NULL THEN NULL ELSE greatest(0,ceil(extract(epoch FROM (p_expires_at-now()))/86400.0)::integer) END
$$;

-- Backfill each existing business from its owner's legacy profile plan without fabricating payments.
INSERT INTO public.business_subscriptions(business_id,plan_code,status,started_at,expires_at,custom_limits)
SELECT b.id,
 CASE WHEN p.plan_code IN ('growth','custom') THEN p.plan_code ELSE 'free' END,
 CASE WHEN p.plan_code IN ('growth','custom') AND p.plan_expires_on IS NOT NULL
        AND ((p.plan_expires_on+1)::timestamp AT TIME ZONE 'Asia/Kabul')<=now() THEN 'expired' ELSE 'active' END,
 b.created_at,
 CASE WHEN p.plan_code IN ('growth','custom') AND p.plan_expires_on IS NOT NULL
      THEN (p.plan_expires_on+1)::timestamp AT TIME ZONE 'Asia/Kabul' ELSE NULL END,
 jsonb_strip_nulls(jsonb_build_object('max_businesses',p.max_businesses,'max_services',p.max_services_per_business,
   'max_staff',p.max_staff_per_business,'max_daily_appointments',p.max_daily_appointments_per_business,
   'work_shifts_enabled',p.work_shifts_enabled,'max_work_shifts',p.max_work_shifts))
FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
ON CONFLICT (business_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.business_effective_plan_limits(p_business uuid)
RETURNS TABLE(plan_code text,effective_status text,started_at timestamptz,expires_at timestamptz,remaining_days integer,
 max_businesses integer,max_services integer,max_staff integer,max_daily_appointments integer,
 advanced_scheduling boolean,work_shifts_enabled boolean,max_work_shifts integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.business_subscriptions%ROWTYPE; base jsonb; free_limits jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.businesses b WHERE b.id=p_business AND (b.is_active IS NOT FALSE OR b.owner_id=auth.uid() OR public.suspension_is_admin())) THEN
   RAISE EXCEPTION 'SUBSCRIPTION_NOT_AUTHORIZED' USING ERRCODE='42501';
 END IF;
 SELECT * INTO s FROM public.business_subscriptions WHERE business_id=p_business;
 SELECT limits INTO free_limits FROM public.subscription_plan_catalog WHERE code='free';
 IF s.id IS NULL OR public.effective_subscription_status(s.status,s.expires_at)<>'active' THEN
   plan_code:='free'; effective_status:=coalesce(public.effective_subscription_status(s.status,s.expires_at),'active');
   started_at:=s.started_at; expires_at:=s.expires_at; remaining_days:=public.subscription_remaining_days(s.expires_at); base:=free_limits;
 ELSE
   plan_code:=s.plan_code; effective_status:='active'; started_at:=s.started_at; expires_at:=s.expires_at;
   remaining_days:=public.subscription_remaining_days(s.expires_at);
   SELECT limits INTO base FROM public.subscription_plan_catalog WHERE code=s.plan_code;
   base:=coalesce(base,'{}'::jsonb)||coalesce(s.custom_limits,'{}'::jsonb);
 END IF;
 max_businesses:=coalesce((base->>'max_businesses')::integer,1);
 max_services:=coalesce((base->>'max_services')::integer,3);
 max_staff:=coalesce((base->>'max_staff')::integer,1);
 max_daily_appointments:=coalesce((base->>'max_daily_appointments')::integer,10);
 advanced_scheduling:=coalesce((base->>'advanced_scheduling')::boolean,false);
 work_shifts_enabled:=coalesce((base->>'work_shifts_enabled')::boolean,false);
 max_work_shifts:=coalesce((base->>'max_work_shifts')::integer,0);
 RETURN NEXT;
END $$;

CREATE OR REPLACE FUNCTION public.record_manual_subscription_payment(
 p_business uuid,p_plan text,p_amount numeric,p_currency text,p_method text,p_custom_method text,p_status text,
 p_paid_at timestamptz,p_start_at timestamptz,p_duration_months integer,p_custom_end_at timestamptz,
 p_reference text,p_note text,p_custom_limits jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.business_subscriptions%ROWTYPE; payment_id uuid; actual_start timestamptz; actual_end timestamptz; v_subscription_id uuid;
BEGIN
 IF NOT public.suspension_is_admin() THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=p_business) THEN RAISE EXCEPTION 'BUSINESS_NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscription_plan_catalog WHERE code=p_plan AND is_active) THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF p_amount<0 OR upper(p_currency)!~'^[A-Z]{3}$' OR p_method NOT IN ('cash','bank_transfer','hesabpay','hawala','other')
    OR p_status NOT IN ('pending','paid','cancelled','refunded') THEN RAISE EXCEPTION 'INVALID_PAYMENT'; END IF;
 IF p_method='other' AND length(trim(coalesce(p_custom_method,'')))=0 THEN RAISE EXCEPTION 'CUSTOM_METHOD_REQUIRED'; END IF;
 IF p_duration_months IS NULL AND p_custom_end_at IS NULL THEN RAISE EXCEPTION 'DURATION_REQUIRED'; END IF;
 SELECT * INTO s FROM public.business_subscriptions WHERE business_id=p_business FOR UPDATE;
 actual_start:=p_start_at;
 IF p_custom_end_at IS NOT NULL THEN actual_end:=p_custom_end_at;
 ELSE
   IF p_duration_months NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'INVALID_DURATION'; END IF;
   IF p_status='paid' AND s.id IS NOT NULL AND public.effective_subscription_status(s.status,s.expires_at) IN ('active','suspended') AND s.expires_at>actual_start
     THEN actual_start:=s.expires_at; END IF;
   actual_end:=actual_start+make_interval(months=>p_duration_months);
 END IF;
 IF actual_end<=actual_start THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_DATES'; END IF;
 INSERT INTO public.subscription_payments(business_id,subscription_id,plan_code,amount,currency,payment_method,custom_payment_method,
   payment_status,paid_at,subscription_start_at,subscription_end_at,reference_number,note,created_by)
 VALUES(p_business,s.id,p_plan,p_amount,upper(p_currency),p_method,nullif(trim(p_custom_method),''),p_status,
   CASE WHEN p_status='paid' THEN coalesce(p_paid_at,now()) ELSE NULL END,actual_start,actual_end,nullif(trim(p_reference),''),nullif(trim(p_note),''),auth.uid())
 RETURNING id INTO payment_id;
 IF p_status='paid' THEN
   INSERT INTO public.business_subscriptions(business_id,plan_code,status,started_at,expires_at,custom_limits,status_reason)
   VALUES(p_business,p_plan,'active',actual_start,actual_end,coalesce(p_custom_limits,'{}'::jsonb),NULL)
   ON CONFLICT (business_id) DO UPDATE SET plan_code=excluded.plan_code,status='active',
     started_at=CASE WHEN business_subscriptions.expires_at>p_start_at THEN business_subscriptions.started_at ELSE excluded.started_at END,
     expires_at=excluded.expires_at,custom_limits=excluded.custom_limits,status_reason=NULL,updated_at=now()
   RETURNING id INTO v_subscription_id;
   UPDATE public.subscription_payments SET subscription_id=v_subscription_id WHERE id=payment_id;
   INSERT INTO public.subscription_audit_logs(business_id,subscription_id,payment_id,action,actor_id,details)
   VALUES(p_business,v_subscription_id,payment_id,'subscription_activated',auth.uid(),jsonb_build_object('plan',p_plan,'start',actual_start,'end',actual_end));
 END IF;
 INSERT INTO public.subscription_audit_logs(business_id,subscription_id,payment_id,action,actor_id,details)
 VALUES(p_business,coalesce(v_subscription_id,s.id),payment_id,'payment_created',auth.uid(),jsonb_build_object('status',p_status,'amount',p_amount,'currency',upper(p_currency)));
 RETURN payment_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_business_subscription_status(p_business uuid,p_status text,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 IF NOT public.suspension_is_admin() THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 IF p_status NOT IN ('active','suspended','cancelled') THEN RAISE EXCEPTION 'INVALID_SUBSCRIPTION_STATUS'; END IF;
 UPDATE public.business_subscriptions SET status=CASE WHEN p_status='active' AND expires_at<=now() THEN 'expired' ELSE p_status END,
   status_reason=nullif(trim(p_reason),''),updated_at=now() WHERE business_id=p_business RETURNING id INTO sid;
 IF sid IS NULL THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_FOUND'; END IF;
 INSERT INTO public.subscription_audit_logs(business_id,subscription_id,action,actor_id,details)
 VALUES(p_business,sid,'subscription_status_changed',auth.uid(),jsonb_build_object('status',p_status,'reason',p_reason));
END $$;

CREATE OR REPLACE FUNCTION public.update_manual_payment(p_payment uuid,p_method text,p_custom_method text,p_reference text,p_note text,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pay public.subscription_payments%ROWTYPE;
BEGIN
 IF NOT public.suspension_is_admin() THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 SELECT * INTO pay FROM public.subscription_payments WHERE id=p_payment FOR UPDATE;
 IF pay.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 IF p_method NOT IN ('cash','bank_transfer','hesabpay','hawala','other') OR p_status NOT IN ('pending','paid','cancelled','refunded') THEN RAISE EXCEPTION 'INVALID_PAYMENT'; END IF;
 IF pay.payment_status<>'paid' AND p_status='paid' THEN RAISE EXCEPTION 'USE_NEW_PAID_PAYMENT'; END IF;
 IF pay.payment_status='paid' AND p_status<>'paid' THEN RAISE EXCEPTION 'PAID_STATUS_IMMUTABLE'; END IF;
 UPDATE public.subscription_payments SET payment_method=p_method,custom_payment_method=nullif(trim(p_custom_method),''),
   reference_number=nullif(trim(p_reference),''),note=nullif(trim(p_note),''),payment_status=p_status,updated_at=now() WHERE id=p_payment;
 INSERT INTO public.subscription_audit_logs(business_id,subscription_id,payment_id,action,actor_id,details)
 VALUES(pay.business_id,pay.subscription_id,p_payment,'payment_updated',auth.uid(),jsonb_build_object('old_status',pay.payment_status,'new_status',p_status));
END $$;

CREATE OR REPLACE FUNCTION public.sync_expired_business_subscriptions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed integer;
BEGIN
 IF auth.role()<>'service_role' AND NOT public.suspension_is_admin() THEN RAISE EXCEPTION 'SUBSCRIPTION_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
 UPDATE public.business_subscriptions SET status='expired',updated_at=now() WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=now();
 GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed;
END $$;

-- Existing feature gates now resolve from the business subscription, falling back to free on expiry/suspension/cancellation.
CREATE OR REPLACE FUNCTION public.business_has_advanced_scheduling(p_business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT l.advanced_scheduling FROM public.business_effective_plan_limits(p_business) l
   WHERE EXISTS(SELECT 1 FROM public.businesses b JOIN public.profiles p ON p.id=b.owner_id
     WHERE b.id=p_business AND b.is_active IS NOT FALSE AND p.is_active IS NOT FALSE)),false)
$$;
CREATE OR REPLACE FUNCTION public.business_plan_daily_quota(p_business uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT max_daily_appointments FROM public.business_effective_plan_limits(p_business)
$$;
CREATE OR REPLACE FUNCTION public.business_work_shift_limits(p_business uuid)
RETURNS TABLE(enabled boolean,max_shifts integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT work_shifts_enabled,max_work_shifts FROM public.business_effective_plan_limits(p_business)
$$;

CREATE OR REPLACE FUNCTION public.enforce_free_resources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; cap integer; limits record; owner_role text;
BEGIN
 IF NOT NEW.is_active THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.is_active AND OLD.business_id=NEW.business_id THEN RETURN NEW; END IF;
 PERFORM 1 FROM public.businesses WHERE id=NEW.business_id FOR UPDATE;
 SELECT p.role INTO owner_role FROM public.profiles p JOIN public.businesses b ON b.owner_id=p.id WHERE b.id=NEW.business_id;
 IF owner_role='superadmin' THEN RETURN NEW; END IF;
 SELECT * INTO limits FROM public.business_effective_plan_limits(NEW.business_id);
 cap:=CASE WHEN TG_TABLE_NAME='services' THEN limits.max_services ELSE limits.max_staff END;
 IF TG_TABLE_NAME='services' THEN SELECT count(*) INTO n FROM public.services WHERE business_id=NEW.business_id AND is_active AND id<>NEW.id;
 ELSE SELECT count(*) INTO n FROM public.staff WHERE business_id=NEW.business_id AND is_active AND id<>NEW.id; END IF;
 IF n>=cap THEN RAISE EXCEPTION 'PLAN_RESOURCE_LIMIT:%',TG_TABLE_NAME; END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.record_manual_subscription_payment(uuid,text,numeric,text,text,text,text,timestamptz,timestamptz,integer,timestamptz,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_business_subscription_status(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.update_manual_payment(uuid,text,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.sync_expired_business_subscriptions() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_subscription_payment(uuid,text,numeric,text,text,text,text,timestamptz,timestamptz,integer,timestamptz,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_subscription_status(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_manual_payment(uuid,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_effective_plan_limits(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.business_work_shift_limits(uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.sync_expired_business_subscriptions() TO service_role;

COMMENT ON TABLE public.subscription_payments IS 'Immutable financial history; cancelled/refunded rows are preserved and never deleted.';
COMMENT ON FUNCTION public.sync_expired_business_subscriptions() IS 'Optional maintenance helper. Access checks use effective expiration at read time and never depend on this function being scheduled.';
