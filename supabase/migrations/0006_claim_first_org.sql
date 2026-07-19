-- ============================================================================
-- ATLAS v0 — Migración 0006: registro autoservicio con arranque seguro
--
-- La app no tiene registro abierto a una organización: cualquiera puede
-- crear una CUENTA, pero solo el PRIMER usuario de la instancia reclama la
-- organización (y queda admin). Todo registro posterior queda sin membresía
-- — no ve ni escribe nada bajo RLS — hasta ser invitado por el admin.
-- ============================================================================

begin;

create or replace function public.claim_first_org()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_full    text;
  v_orgname text;
  v_org     uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;

  select
    u.email,
    coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1)),
    coalesce(nullif(u.raw_user_meta_data->>'org_name', ''), 'Mi organización')
    into v_email, v_full, v_orgname
  from auth.users u
  where u.id = v_uid;

  -- Perfil propio (idempotente)
  insert into profiles (id, full_name, email)
  values (v_uid, v_full, v_email)
  on conflict (id) do nothing;

  -- Ya es miembro de alguna organización: no-op
  select om.org_id into v_org
  from organization_memberships om
  where om.profile_id = v_uid
  limit 1;
  if v_org is not null then
    return v_org;
  end if;

  -- La instancia ya tiene dueño: se necesita invitación
  if exists (select 1 from organization_memberships) then
    raise exception 'La organización ya tiene miembros; pide una invitación al administrador.';
  end if;

  -- Primer usuario: crea la organización y queda admin
  insert into organizations (name) values (v_orgname) returning id into v_org;
  insert into organization_memberships (org_id, profile_id, is_admin)
  values (v_org, v_uid, true);

  return v_org;
end;
$$;

revoke execute on function public.claim_first_org() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.claim_first_org() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.claim_first_org() to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_first_org() to service_role;
  end if;
end $$;

commit;
