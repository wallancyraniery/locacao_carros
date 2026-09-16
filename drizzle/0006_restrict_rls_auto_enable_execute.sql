DO $$
DECLARE
  exposed_role text;
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NULL THEN
    RETURN;
  END IF;

  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

  FOREACH exposed_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = exposed_role) THEN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM %I',
        exposed_role
      );
    END IF;
  END LOOP;
END
$$;
