-- Apply to the existing Nobatak tables in the Supabase SQL Editor.
-- Atomic, idempotent addition: existing permissive policies cannot bypass these restrictions.
BEGIN;

-- Older installations may not have the account/business status columns yet.
-- IF NOT EXISTS preserves existing roles and suspension states.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.suspension_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'superadmin' AND is_active IS NOT FALSE);
$$;

CREATE OR REPLACE FUNCTION public.suspension_owner_enabled(owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = owner
    AND p.is_active IS NOT FALSE AND (p.role = 'superadmin' OR NOT EXISTS (
      SELECT 1 FROM public.businesses b WHERE b.owner_id = owner AND b.is_active = false
    )));
$$;

CREATE OR REPLACE FUNCTION public.suspension_business_enabled(business uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business
    AND b.is_active IS NOT FALSE AND public.suspension_owner_enabled(b.owner_id));
$$;

-- Keep owners able to read the status of their suspended business for the notice.
DROP POLICY IF EXISTS "Suspension visibility" ON public.businesses;
CREATE POLICY "Suspension visibility" ON public.businesses AS RESTRICTIVE FOR SELECT
  USING (public.suspension_is_admin() OR auth.uid() = owner_id
    OR public.suspension_business_enabled(id));

DROP POLICY IF EXISTS "Suspension insert" ON public.businesses;
CREATE POLICY "Suspension insert" ON public.businesses AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.suspension_is_admin() OR
    (auth.uid() = owner_id AND is_active IS NOT FALSE AND public.suspension_owner_enabled(owner_id)));
DROP POLICY IF EXISTS "Suspension update" ON public.businesses;
CREATE POLICY "Suspension update" ON public.businesses AS RESTRICTIVE FOR UPDATE
  USING (public.suspension_is_admin() OR
    (auth.uid() = owner_id AND public.suspension_business_enabled(id)))
  WITH CHECK (public.suspension_is_admin() OR
    (auth.uid() = owner_id AND is_active IS NOT FALSE AND public.suspension_owner_enabled(owner_id)));
DROP POLICY IF EXISTS "Suspension delete" ON public.businesses;
CREATE POLICY "Suspension delete" ON public.businesses AS RESTRICTIVE FOR DELETE
  USING (public.suspension_is_admin() OR
    (auth.uid() = owner_id AND public.suspension_business_enabled(id)));

DO $$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['services', 'staff', 'appointments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Suspension access" ON public.%I', target);
    EXECUTE format('CREATE POLICY "Suspension access" ON public.%I AS RESTRICTIVE FOR ALL
      USING (public.suspension_is_admin() OR public.suspension_business_enabled(business_id))
      WITH CHECK (public.suspension_is_admin() OR public.suspension_business_enabled(business_id))', target);
  END LOOP;
END;
$$;

-- A business owner must not undo suspension or transfer a suspended business.
CREATE OR REPLACE FUNCTION public.guard_business_suspension()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
    RETURN NEW;
  END IF;
  IF NOT public.suspension_is_admin() AND
    (NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    RAISE EXCEPTION 'Only an active superadmin can change business suspension or ownership' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_business_suspension ON public.businesses;
CREATE TRIGGER guard_business_suspension BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_business_suspension();

-- Existing self-profile update policies must not allow role escalation or self-reactivation.
CREATE OR REPLACE FUNCTION public.guard_profile_suspension()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.role() = 'service_role' OR (auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
    RETURN NEW;
  END IF;
  IF NOT public.suspension_is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IS DISTINCT FROM 'user' OR NEW.is_active IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Only an active superadmin can set account privileges' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Only an active superadmin can change account privileges' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_profile_suspension ON public.profiles;
CREATE TRIGGER guard_profile_suspension BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_suspension();

COMMIT;
