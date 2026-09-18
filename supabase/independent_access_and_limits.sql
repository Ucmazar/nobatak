-- Nobatak: independent user/business suspension and per-user business quota.
-- Replaces the earlier business_suspension.sql rules; run this entire file once.
BEGIN;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_businesses integer DEFAULT 1;
ALTER TABLE public.profiles ALTER COLUMN max_businesses SET DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_max_businesses_nonnegative') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_max_businesses_nonnegative CHECK (max_businesses IS NULL OR max_businesses >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.suspension_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin' AND is_active IS NOT FALSE);
$$;
CREATE OR REPLACE FUNCTION public.suspension_owner_enabled(owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = owner AND is_active IS NOT FALSE);
$$;
CREATE OR REPLACE FUNCTION public.suspension_business_enabled(business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses WHERE id = business AND is_active IS NOT FALSE);
$$;
CREATE OR REPLACE FUNCTION public.suspension_can_manage(business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.suspension_is_admin() OR EXISTS (SELECT 1 FROM public.businesses b
    WHERE b.id = business AND b.owner_id = auth.uid() AND b.is_active IS NOT FALSE
    AND public.suspension_owner_enabled(b.owner_id));
$$;

-- Give active admins the required permissions even on older installations.
DROP POLICY IF EXISTS "Superadmin can view all profiles" ON public.profiles;
CREATE POLICY "Superadmin can view all profiles" ON public.profiles FOR SELECT USING (public.suspension_is_admin());
DROP POLICY IF EXISTS "Superadmin can update all profiles" ON public.profiles;
CREATE POLICY "Superadmin can update all profiles" ON public.profiles FOR UPDATE USING (public.suspension_is_admin()) WITH CHECK (public.suspension_is_admin());
DROP POLICY IF EXISTS "Superadmin can view all businesses" ON public.businesses;
CREATE POLICY "Superadmin can view all businesses" ON public.businesses FOR SELECT USING (public.suspension_is_admin());
DROP POLICY IF EXISTS "Superadmin can update all businesses" ON public.businesses;
CREATE POLICY "Superadmin can update all businesses" ON public.businesses FOR UPDATE USING (public.suspension_is_admin()) WITH CHECK (public.suspension_is_admin());

DROP POLICY IF EXISTS "Suspension visibility" ON public.businesses;
CREATE POLICY "Suspension visibility" ON public.businesses AS RESTRICTIVE FOR SELECT
  USING (public.suspension_is_admin() OR auth.uid() = owner_id OR public.suspension_business_enabled(id));
DROP POLICY IF EXISTS "Suspension insert" ON public.businesses;
CREATE POLICY "Suspension insert" ON public.businesses AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.suspension_is_admin() OR (auth.uid() = owner_id AND is_active IS NOT FALSE AND public.suspension_owner_enabled(owner_id)));
DROP POLICY IF EXISTS "Suspension update" ON public.businesses;
CREATE POLICY "Suspension update" ON public.businesses AS RESTRICTIVE FOR UPDATE
  USING (public.suspension_can_manage(id))
  WITH CHECK (public.suspension_is_admin() OR (auth.uid() = owner_id AND is_active IS NOT FALSE AND public.suspension_owner_enabled(owner_id)));
DROP POLICY IF EXISTS "Suspension delete" ON public.businesses;
CREATE POLICY "Suspension delete" ON public.businesses AS RESTRICTIVE FOR DELETE USING (public.suspension_can_manage(id));

-- Public queues depend only on the business status, not on its owner's dashboard access.
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['services','staff','appointments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Suspension access" ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS "Suspension read" ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS "Suspension create" ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS "Suspension change" ON public.%I', target);
    EXECUTE format('DROP POLICY IF EXISTS "Suspension remove" ON public.%I', target);
    EXECUTE format('CREATE POLICY "Suspension read" ON public.%I AS RESTRICTIVE FOR SELECT USING (public.suspension_is_admin() OR public.suspension_business_enabled(business_id))', target);
    EXECUTE format('CREATE POLICY "Suspension change" ON public.%I AS RESTRICTIVE FOR UPDATE USING (public.suspension_can_manage(business_id)) WITH CHECK (public.suspension_can_manage(business_id))', target);
    IF target = 'appointments' THEN
      -- Preserve the public booking/cancellation flow for active businesses.
      EXECUTE format('CREATE POLICY "Suspension create" ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK (public.suspension_is_admin() OR public.suspension_business_enabled(business_id))', target);
      EXECUTE format('CREATE POLICY "Suspension remove" ON public.%I AS RESTRICTIVE FOR DELETE USING (public.suspension_is_admin() OR public.suspension_business_enabled(business_id))', target);
    ELSE
      EXECUTE format('CREATE POLICY "Suspension create" ON public.%I AS RESTRICTIVE FOR INSERT WITH CHECK (public.suspension_can_manage(business_id))', target);
      EXECUTE format('CREATE POLICY "Suspension remove" ON public.%I AS RESTRICTIVE FOR DELETE USING (public.suspension_can_manage(business_id))', target);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guard_business_suspension()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) THEN RETURN NEW; END IF;
  IF NOT public.suspension_is_admin() AND (NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    RAISE EXCEPTION 'Only an active superadmin can change business suspension or ownership' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_business_suspension ON public.businesses;
CREATE TRIGGER guard_business_suspension BEFORE UPDATE ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.guard_business_suspension();

CREATE OR REPLACE FUNCTION public.guard_profile_suspension()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres','supabase_admin')) THEN RETURN NEW; END IF;
  IF NOT public.suspension_is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IS DISTINCT FROM 'user' OR NEW.is_active IS DISTINCT FROM true OR NEW.max_businesses IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Only an active superadmin can set account privileges or business limits' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.id IS DISTINCT FROM OLD.id OR NEW.max_businesses IS DISTINCT FROM OLD.max_businesses THEN
      RAISE EXCEPTION 'Only an active superadmin can change account privileges or business limits' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_profile_suspension ON public.profiles;
CREATE TRIGGER guard_profile_suspension BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_suspension();

-- Serialize creations per owner so concurrent requests cannot both use the last slot.
CREATE OR REPLACE FUNCTION public.enforce_business_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE allowed_count integer; existing_count integer; owner_role text; owner_active boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN RETURN NEW; END IF;
  SELECT max_businesses, role, is_active INTO allowed_count, owner_role, owner_active
    FROM public.profiles WHERE id = NEW.owner_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Business owner does not exist' USING ERRCODE = '23503'; END IF;
  IF owner_active = false AND NOT public.suspension_is_admin() THEN
    RAISE EXCEPTION 'ACCOUNT_DISABLED' USING ERRCODE = '42501';
  END IF;
  IF owner_role = 'superadmin' OR allowed_count IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO existing_count FROM public.businesses WHERE owner_id = NEW.owner_id;
  IF existing_count >= allowed_count THEN
    RAISE EXCEPTION 'BUSINESS_LIMIT_REACHED: %', allowed_count USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_business_limit ON public.businesses;
CREATE TRIGGER enforce_business_limit BEFORE INSERT OR UPDATE OF owner_id ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.enforce_business_limit();
NOTIFY pgrst, 'reload schema';
COMMIT;
