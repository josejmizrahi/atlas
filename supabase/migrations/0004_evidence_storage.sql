-- ============================================================================
-- ATLAS v0 — Migración 0004: almacenamiento de evidencia
--
-- Bucket privado 'evidence'. Convención de ruta: <deal_id>/<archivo>.
-- El acceso a objetos hereda el RLS del deal: leer exige membresía,
-- escribir exige rol escritor. Nada es público.
-- ============================================================================

begin;

-- Higiene pendiente de 0003: en el hosted, los default privileges otorgan
-- EXECUTE a anon sobre funciones nuevas (inofensivo aquí porque create_deal
-- exige auth.uid(), pero se revoca por principio: anon no ejecuta nada).
revoke execute on function public.create_deal(uuid, text, uuid, text) from anon;

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

-- Extrae el deal_id de la carpeta raíz de la ruta; null si no es un uuid
-- (evita que un path malformado rompa la evaluación de la política).
create or replace function atlas.deal_id_from_path(p_name text)
returns uuid
language plpgsql immutable
as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists p_storage_evidence_sel on storage.objects;
create policy p_storage_evidence_sel on storage.objects for select
  using (
    bucket_id = 'evidence'
    and atlas.is_deal_member(atlas.deal_id_from_path(name))
  );

drop policy if exists p_storage_evidence_ins on storage.objects;
create policy p_storage_evidence_ins on storage.objects for insert
  with check (
    bucket_id = 'evidence'
    and atlas.can_write(atlas.deal_id_from_path(name))
  );

-- Sin UPDATE/DELETE: la evidencia, como los eventos, no se reescribe.

commit;
