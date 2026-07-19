-- ============================================================================
-- ATLAS v0 — Migración 0003: función create_deal
--
-- Problema que resuelve: las políticas de 0001 producen un huevo-y-gallina
-- al crear un deal como usuario normal. p_deals_ins permite el INSERT
-- (miembro de la org), pero p_dealmem_ins exige rol 'owner' en el deal —
-- y quien acaba de crearlo aún no tiene membresía, así que nadie puede
-- convertirse en su primer miembro y el deal queda invisible para siempre.
--
-- Solución: creación atómica deal + membresía owner en una función
-- SECURITY DEFINER que valida membresía de la organización. Los triggers
-- de auditoría aplican igual.
-- ============================================================================

begin;

create or replace function public.create_deal(
  p_org uuid,
  p_codename text,
  p_template_version uuid,
  p_stage text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_deal uuid;
begin
  if auth.uid() is null then
    raise exception 'Se requiere un usuario autenticado';
  end if;

  if not atlas.is_org_member(p_org) then
    raise exception 'No eres miembro de la organización';
  end if;

  if p_codename is null or length(trim(p_codename)) = 0 then
    raise exception 'El codename es obligatorio';
  end if;

  -- La versión de plantilla debe existir y estar publicada (comparabilidad)
  if not exists (
    select 1 from template_versions tv
    where tv.id = p_template_version and tv.published_at is not null
  ) then
    raise exception 'template_version inexistente o no publicada';
  end if;

  insert into deals (org_id, codename, template_version_id, current_stage_key, created_by)
  values (p_org, trim(p_codename), p_template_version, p_stage, auth.uid())
  returning id into v_deal;

  insert into deal_memberships (deal_id, profile_id, role, max_sensitivity, added_by)
  values (v_deal, auth.uid(), 'owner', 'restricted', auth.uid());

  return v_deal;
end;
$$;

-- Postgres otorga EXECUTE a PUBLIC por default en funciones nuevas;
-- se restringe explícitamente: nada para anon.
revoke execute on function public.create_deal(uuid, text, uuid, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.create_deal(uuid, text, uuid, text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_deal(uuid, text, uuid, text) to service_role;
  end if;
end $$;

commit;
