-- ============================================================================
-- ATLAS v0 — Migración 0005: secretos de fuentes de evidencia en Vault
--
-- Los conectores (Gmail/Drive) necesitan un refresh token de OAuth por
-- fuente. El principio de 0001 aplica: la configuración NO sensible vive en
-- evidence_sources.config; los secretos van en Vault. Estas dos funciones
-- son el único puente, y SOLO service_role (workers, tooling) puede
-- ejecutarlas. Ni anon ni authenticated ven jamás un secreto.
-- ============================================================================

begin;

-- Guarda (o rota) el secreto de una fuente y anota el nombre en config.
create or replace function public.store_source_secret(p_source uuid, p_secret text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_existing uuid;
begin
  if not exists (select 1 from evidence_sources s where s.id = p_source) then
    raise exception 'Fuente de evidencia inexistente';
  end if;

  v_name := 'evidence_source_' || p_source::text;

  select id into v_existing from vault.secrets where name = v_name;
  if v_existing is not null then
    perform vault.update_secret(v_existing, p_secret);
  else
    perform vault.create_secret(p_secret, v_name);
  end if;

  update evidence_sources
     set config = coalesce(config, '{}'::jsonb)
                  || jsonb_build_object('vault_secret', v_name)
   where id = p_source;
end;
$$;

-- Lee el secreto de una fuente (para el worker de ingesta).
create or replace function public.read_source_secret(p_source uuid)
returns text
language sql security definer set search_path = public
as $$
  select ds.decrypted_secret
  from vault.decrypted_secrets ds
  where ds.name = 'evidence_source_' || p_source::text;
$$;

revoke execute on function public.store_source_secret(uuid, text) from public;
revoke execute on function public.read_source_secret(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.store_source_secret(uuid, text) from anon;
    revoke execute on function public.read_source_secret(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.store_source_secret(uuid, text) from authenticated;
    revoke execute on function public.read_source_secret(uuid) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.store_source_secret(uuid, text) to service_role;
    grant execute on function public.read_source_secret(uuid) to service_role;
  end if;
end $$;

commit;
