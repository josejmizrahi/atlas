-- ============================================================================
-- ATLAS v0 — Migración 0002: grants para service_role
--
-- La 0001 solo otorga privilegios a 'authenticated'. El rol service_role
-- (Edge Functions del scribe, workers de ingesta, tooling de seed local)
-- necesita privilegios de tabla propios: en Postgres los grants son
-- independientes de RLS (service_role la bypassa, pero sin GRANT no llega
-- ni a la tabla). Los triggers (p. ej. inmutabilidad de events) aplican
-- igual a service_role.
--
-- Deliberadamente NO se otorga nada a 'anon': ningún dato de Atlas es
-- público; el frontend siempre opera autenticado.
-- ============================================================================

begin;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema public to service_role;
    grant usage on schema atlas to service_role;
    grant select, insert, update, delete on all tables in schema public to service_role;
    grant usage, select on all sequences in schema public to service_role;
    grant execute on all functions in schema public to service_role;
    grant execute on all functions in schema atlas to service_role;
  end if;
end $$;

commit;
