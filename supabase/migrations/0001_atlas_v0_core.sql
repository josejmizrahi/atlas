-- ============================================================================
-- ATLAS v0 — TRANSACTION OBSERVATORY
-- Migración 0001: esquema núcleo sobre las cinco primitivas
-- Target: Supabase (PostgreSQL 15+)
--
-- Principios que este esquema hace cumplir a nivel de base de datos:
--   1. Los eventos son inmutables (trigger que bloquea UPDATE/DELETE).
--   2. El estado actual se deriva de assertions, nunca se edita en el lugar.
--   3. Toda inferencia de IA se distingue de un hecho confirmado (status).
--   4. Cada deal es un tenant lógico hermético (RLS por deal_memberships).
--   5. La sensibilidad se evalúa por fila, no solo por rol.
--   6. aggregate_metrics NO tiene deal_id: la agregación es irreversible
--      por diseño del esquema, no por promesa.
--   7. La versión de plantilla queda congelada por deal (comparabilidad).
--
-- NOTA SUPABASE: profiles.id referencia auth.users(id) y las políticas RLS
-- usan auth.uid(). En un entorno local de prueba, crear stubs (ver harness).
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- Esquema privado para funciones helper (no expuesto por PostgREST)
create schema if not exists atlas;

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

create type actor_kind as enum ('person', 'organization');

create type deal_status as enum ('active', 'paused', 'dropped', 'closed', 'integrating', 'archived');

-- Rol de un usuario de la plataforma dentro de un deal (no confundir con
-- el rol de negocio de un actor, que vive en deal_actors.role)
create type deal_role as enum ('owner', 'scribe', 'analyst', 'advisor', 'viewer', 'ai_agent');

-- Niveles de sensibilidad por fila. restricted = dinámica familiar,
-- estrategia de negociación, opiniones sobre personas.
create type sensitivity_level as enum ('standard', 'sensitive', 'restricted');

-- Clasificación de gobierno del dato, obligatoria desde la creación
create type data_classification as enum (
  'deal_confidential',      -- nunca sale del deal
  'reusable_candidate',     -- candidato a anonimización (solo campos autorizados)
  'anonymized_aggregate',   -- resultado ya irreversible
  'platform_operational'    -- logs, jobs, auditoría
);

create type asset_kind as enum (
  'target_company', 'equity_stake', 'document', 'offer', 'loi', 'spa',
  'financial_model', 'contract', 'nda', 'bank_account', 'spv',
  'condition_precedent', 'other'
);

create type asset_status as enum ('draft', 'active', 'signed', 'satisfied', 'expired', 'archived');

create type event_kind as enum (
  'email_received', 'email_sent', 'document_uploaded', 'document_shared',
  'request_sent', 'request_answered', 'meeting_held', 'call_held',
  'offer_submitted', 'offer_revised', 'approval_granted', 'approval_denied',
  'nda_signed', 'loi_signed', 'contract_signed', 'access_granted',
  'transfer_confirmed', 'stage_changed', 'note_added', 'correction', 'other'
);

-- Origen del registro: capturado a mano, ingerido de una fuente, o inferido por IA
create type record_origin as enum ('manual', 'ingested', 'inferred');

create type participant_role as enum ('initiator', 'receiver', 'participant', 'approver', 'witness');

create type evidence_kind as enum ('email', 'file', 'whatsapp_export', 'meeting_minute', 'note', 'link', 'other');

create type source_kind as enum ('manual', 'gmail', 'gdrive', 'whatsapp', 'api');

create type job_status as enum ('pending', 'processing', 'done', 'failed');

-- Ciclo de vida de una afirmación sobre un campo
create type assertion_status as enum ('observed', 'inferred', 'confirmed', 'disputed', 'superseded');

create type validation_status as enum ('pending', 'confirmed', 'corrected', 'rejected', 'deferred');

create type request_status as enum ('open', 'partially_answered', 'answered', 'withdrawn');

create type decision_status as enum ('proposed', 'approved', 'rejected', 'deferred', 'superseded');

-- Taxonomía canónica de fricción (sección 7 de la plantilla maestra)
create type friction_category as enum (
  'info_unavailable', 'info_disordered', 'info_incorrect', 'info_duplicated',
  'no_owner', 'no_authorization', 'misaligned_incentives', 'negotiation',
  'third_party_dependency', 'legal_requirement', 'bank_requirement',
  'signature', 'money_transfer', 'version_churn', 'context_loss', 'trust'
);

create type linked_object_type as enum ('event', 'asset', 'assertion', 'decision', 'request', 'deal_actor');

-- ============================================================================
-- 2. IDENTIDAD Y TENANCY
-- ============================================================================

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Perfil 1:1 con auth.users de Supabase
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text,
  created_at  timestamptz not null default now()
);

create table organization_memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (org_id, profile_id)
);

-- ============================================================================
-- 3. VERSIONAMIENTO DE PLANTILLA
-- Regla crítica: la definición usada por un deal nunca se edita
-- retroactivamente. Un deal apunta a una template_version publicada.
-- ============================================================================

create table schema_templates (
  id    uuid primary key default gen_random_uuid(),
  key   text not null unique,          -- 'acquisition_observatory'
  name  text not null
);

create table template_versions (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references schema_templates (id) on delete cascade,
  version       text not null,          -- '1.0', '1.2', '2.0'
  stages        jsonb not null,         -- [{key, name, position}, ...]
  fields        jsonb not null default '[]'::jsonb,  -- definición de campos por etapa
  published_at  timestamptz,            -- null = borrador; publicada = inmutable
  created_at    timestamptz not null default now(),
  unique (template_id, version)
);

-- Capa canónica para análisis longitudinal entre versiones
create table canonical_concepts (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,     -- 'friction.information.unavailable'
  description text
);

create table field_mappings (
  id                   uuid primary key default gen_random_uuid(),
  template_version_id  uuid not null references template_versions (id) on delete cascade,
  source_field         text not null,   -- 'delay_reason:seller_data_missing'
  canonical_concept_id uuid not null references canonical_concepts (id),
  note                 text,
  unique (template_version_id, source_field)
);

-- ============================================================================
-- 4. DEALS (el tenant lógico)
-- ============================================================================

create table deals (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations (id),
  codename             text not null,   -- nombre interno; el target real es un actor
  status               deal_status not null default 'active',
  template_version_id  uuid not null references template_versions (id),
  current_stage_key    text,            -- validado contra template_versions.stages
  currency             text not null default 'MXN',
  opened_at            date not null default current_date,
  closed_at            date,
  drop_reason          text,
  created_by           uuid references profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (org_id, codename)
);

create table deal_memberships (
  id               uuid primary key default gen_random_uuid(),
  deal_id          uuid not null references deals (id) on delete cascade,
  profile_id       uuid not null references profiles (id) on delete cascade,
  role             deal_role not null,
  -- Techo de sensibilidad que este miembro puede ver dentro del deal.
  -- Ej.: el banco entra como 'viewer' con max_sensitivity 'standard'
  -- y jamás ve dinámica familiar aunque esté en el deal.
  max_sensitivity  sensitivity_level not null default 'standard',
  added_by         uuid references profiles (id),
  created_at       timestamptz not null default now(),
  unique (deal_id, profile_id)
);

-- ============================================================================
-- 5. PRIMITIVA 1: ACTORES
-- Registro de actores por organización compradora (no global de plataforma:
-- los contactos de un tenant no se comparten con otro).
-- ============================================================================

create table actors (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id),
  kind         actor_kind not null,
  display_name text not null,
  legal_name   text,
  tax_id       text,                    -- RFC u homólogo por jurisdicción
  contact      jsonb not null default '{}'::jsonb,
  sensitivity  sensitivity_level not null default 'standard',
  created_at   timestamptz not null default now()
);

-- Participación de un actor en un deal, con rol de negocio
create table deal_actors (
  id                 uuid primary key default gen_random_uuid(),
  deal_id            uuid not null references deals (id) on delete cascade,
  actor_id           uuid not null references actors (id),
  role               text not null,     -- 'vendedor', 'abogado_comprador', 'banco'... (catálogo en template)
  represents         text,              -- a qué parte representa
  decision_authority text,              -- qué puede decidir
  entered_at         date,
  exited_at          date,
  channel            text,              -- correo, whatsapp, presencial
  fee_estimate       numeric(14,2),
  delay_risk         smallint check (delay_risk between 1 and 5),
  sensitivity        sensitivity_level not null default 'standard',
  created_at         timestamptz not null default now(),
  unique (deal_id, actor_id, role)
);

-- ============================================================================
-- 6. PRIMITIVA 2: ACTIVOS
-- Un documento no es un "archivo": es un activo con dueño, versiones,
-- sensibilidad, relaciones y eventos.
-- ============================================================================

create table assets (
  id                 uuid primary key default gen_random_uuid(),
  deal_id            uuid not null references deals (id) on delete cascade,
  kind               asset_kind not null,
  title              text not null,
  description        text,
  status             asset_status not null default 'active',
  owner_actor_id     uuid references actors (id),
  custodian_actor_id uuid references actors (id),
  sensitivity        sensitivity_level not null default 'standard',
  classification     data_classification not null default 'deal_confidential',
  created_by         uuid references profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table asset_versions (
  id                        uuid primary key default gen_random_uuid(),
  asset_id                  uuid not null references assets (id) on delete cascade,
  version_no                integer not null,
  storage_path              text,       -- ruta en Supabase Storage
  content_hash              text,
  mime_type                 text,
  size_bytes                bigint,
  created_from_evidence_id  uuid,       -- FK diferida a evidence_items (se agrega abajo)
  created_at                timestamptz not null default now(),
  unique (asset_id, version_no)
);

-- Relaciones entre activos: duplica, deriva de, requiere
create table asset_relations (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals (id) on delete cascade,
  from_asset  uuid not null references assets (id) on delete cascade,
  to_asset    uuid not null references assets (id) on delete cascade,
  relation    text not null check (relation in ('duplicates', 'derives_from', 'requires', 'supersedes')),
  created_at  timestamptz not null default now(),
  check (from_asset <> to_asset)
);

-- ============================================================================
-- 7. PRIMITIVA 3: EVENTOS (inmutables)
-- ============================================================================

create table events (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references deals (id) on delete cascade,
  kind         event_kind not null,
  stage_key    text,                    -- etapa vigente al ocurrir
  occurred_at  timestamptz not null,
  recorded_at  timestamptz not null default now(),
  summary      text not null,           -- "Novalan envió EEFF 2024 por correo"
  payload      jsonb not null default '{}'::jsonb,
  origin       record_origin not null default 'manual',
  confidence   numeric(4,3) check (confidence between 0 and 1),  -- solo si origin='inferred'
  sensitivity  sensitivity_level not null default 'standard',
  recorded_by  uuid references profiles (id)
);

create table event_participants (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references events (id) on delete cascade,
  actor_id  uuid not null references actors (id),
  role      participant_role not null,
  unique (event_id, actor_id, role)
);

create table event_asset_links (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null references events (id) on delete cascade,
  asset_id  uuid not null references assets (id) on delete cascade,
  link_role text not null default 'subject' check (link_role in ('subject', 'produced', 'requested', 'referenced')),
  unique (event_id, asset_id, link_role)
);

-- ============================================================================
-- 8. EVIDENCIA
-- ============================================================================

create table evidence_sources (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id),
  kind        source_kind not null,
  label       text not null,
  -- Configuración NO sensible (carpetas, filtros). Los secretos van en Vault.
  config      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table evidence_items (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null references deals (id) on delete cascade,
  source_id      uuid references evidence_sources (id),
  kind           evidence_kind not null,
  external_ref   text,                  -- message-id de Gmail, file-id de Drive
  storage_path   text,
  content_hash   text,
  captured_at    timestamptz,           -- cuándo ocurrió/se recibió originalmente
  ingested_at    timestamptz not null default now(),
  classification data_classification not null default 'deal_confidential',
  sensitivity    sensitivity_level not null default 'standard',
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

alter table asset_versions
  add constraint asset_versions_evidence_fk
  foreign key (created_from_evidence_id) references evidence_items (id);

create table evidence_links (
  id           uuid primary key default gen_random_uuid(),
  evidence_id  uuid not null references evidence_items (id) on delete cascade,
  linked_type  linked_object_type not null,
  linked_id    uuid not null,
  created_at   timestamptz not null default now(),
  unique (evidence_id, linked_type, linked_id)
);

create table ingestion_jobs (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references evidence_sources (id),
  deal_id      uuid references deals (id),
  status       job_status not null default 'pending',
  started_at   timestamptz,
  finished_at  timestamptz,
  stats        jsonb not null default '{}'::jsonb,
  error        text
);

-- ============================================================================
-- 9. RECONSTRUCCIÓN POR IA: ASSERTIONS
-- El corazón del observatory. Todo campo reconstruido es una afirmación
-- con estado, confianza, autor y evidencia. Nunca se mezcla un hecho
-- confirmado con una inferencia: se consulta v_current_state.
-- ============================================================================

create table field_assertions (
  id                   uuid primary key default gen_random_uuid(),
  deal_id              uuid not null references deals (id) on delete cascade,
  subject_type         text not null,   -- 'event', 'request', 'deal', 'asset', 'deal_actor'
  subject_id           uuid not null,
  field_key            text not null,   -- 'wait_cause', 'receiver_actor_id', 'stage_key'
  value                jsonb not null,
  status               assertion_status not null,
  confidence           numeric(4,3) check (confidence between 0 and 1),
  asserted_by_profile  uuid references profiles (id),
  asserted_by_agent    text,            -- identificador y versión del agente/modelo
  based_on_evidence_id uuid references evidence_items (id),
  supersedes_id        uuid references field_assertions (id),
  note                 text,
  created_at           timestamptz not null default now(),
  check (asserted_by_profile is not null or asserted_by_agent is not null)
);

-- Cola de validación humana (retrospectiva semanal de 15 minutos)
create table validation_tasks (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references deals (id) on delete cascade,
  assertion_id  uuid references field_assertions (id) on delete cascade,
  question      text not null,          -- "¿Quién es el responsable del vendedor para esta solicitud?"
  priority      smallint not null default 3 check (priority between 1 and 5),
  status        validation_status not null default 'pending',
  retro_week    date,                   -- lunes de la semana de retrospectiva
  resolved_by   uuid references profiles (id),
  resolved_at   timestamptz,
  resolution    text,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 10. FLUJO: SOLICITUDES, DEPENDENCIAS, DECISIONES
-- Aquí vive la métrica central: tiempo activo vs. tiempo de espera.
-- ============================================================================

create table requests (
  id                  uuid primary key default gen_random_uuid(),
  deal_id             uuid not null references deals (id) on delete cascade,
  title               text not null,
  detail              text,
  asset_id            uuid references assets (id),            -- qué se pide
  requested_by_actor  uuid not null references actors (id),
  requested_from_actor uuid not null references actors (id),
  requested_at        timestamptz not null,
  due_at              timestamptz,
  first_response_at   timestamptz,
  satisfied_at        timestamptz,
  status              request_status not null default 'open',
  wait_cause          friction_category,
  sensitivity         sensitivity_level not null default 'standard',
  origin              record_origin not null default 'manual',
  created_at          timestamptz not null default now()
);

create table request_responses (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references requests (id) on delete cascade,
  responded_at   timestamptz not null,
  evidence_id    uuid references evidence_items (id),
  quality        smallint check (quality between 1 and 5),
  clarifications integer not null default 0,
  note           text
);

create table dependencies (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references deals (id) on delete cascade,
  blocked_type  linked_object_type not null,
  blocked_id    uuid not null,
  blocks_on_type linked_object_type not null,
  blocks_on_id  uuid not null,
  description   text,
  cause         friction_category,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- PRIMITIVA 4 (mitad registrada en v0): decisiones.
-- Las reglas ejecutables llegan en v1; en v0 se observa cómo se decide.
create table decisions (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references deals (id) on delete cascade,
  title             text not null,
  description       text,
  proposed_by_actor uuid references actors (id),
  authority_actor   uuid references actors (id),
  alternatives      jsonb not null default '[]'::jsonb,
  requested_at      timestamptz not null,
  resolved_at       timestamptz,
  outcome           decision_status not null default 'proposed',
  impact_amount     numeric(16,2),
  impact_days       integer,
  rule_candidate    boolean not null default false,  -- ¿podría resolverse con reglas predefinidas?
  sensitivity       sensitivity_level not null default 'sensitive',
  created_at        timestamptz not null default now()
);

-- ============================================================================
-- 11. GOBIERNO DEL DATO Y AGREGACIÓN IRREVERSIBLE
-- ============================================================================

create table anonymization_jobs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id),
  requested_by        uuid not null references profiles (id),
  authorized_by       uuid not null references profiles (id),
  template_version_id uuid references template_versions (id),
  spec                jsonb not null,   -- campos autorizados, agrupaciones, umbral k
  status              job_status not null default 'pending',
  k_threshold         smallint not null default 5,  -- mínimo de deals por celda
  started_at          timestamptz,
  finished_at         timestamptz,
  error               text,
  created_at          timestamptz not null default now()
);

-- IMPORTANTE: sin deal_id, sin actor_id, sin FK a nada identificable.
-- La irreversibilidad es estructural.
create table aggregate_metrics (
  id              uuid primary key default gen_random_uuid(),
  metric_key      text not null,        -- 'stage.due_diligence.median_days'
  dimensions      jsonb not null default '{}'::jsonb,  -- valores ya generalizados
  value           numeric not null,
  sample_size     integer not null check (sample_size >= 1),
  produced_by_job uuid not null references anonymization_jobs (id),
  produced_at     timestamptz not null default now()
);

-- Auditoría de escrituras (trigger genérico). La auditoría de lecturas
-- se hace en la capa API / pgAudit, no aquí.
create table audit_log (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_id     uuid,                    -- auth.uid() si existe
  action       text not null,           -- INSERT / UPDATE / DELETE / EXPORT
  object_type  text not null,
  object_id    uuid,
  deal_id      uuid,
  details      jsonb
);

-- ============================================================================
-- 12. FUNCIONES HELPER (esquema privado)
-- ============================================================================

-- Membresía de deal. SECURITY DEFINER para evitar recursión de RLS
-- sobre deal_memberships (patrón estándar de Supabase).
create or replace function atlas.is_deal_member(p_deal uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from deal_memberships dm
    where dm.deal_id = p_deal and dm.profile_id = auth.uid()
  );
$$;

create or replace function atlas.deal_role(p_deal uuid)
returns deal_role
language sql stable security definer set search_path = public
as $$
  select dm.role from deal_memberships dm
  where dm.deal_id = p_deal and dm.profile_id = auth.uid();
$$;

create or replace function atlas.sens_rank(p sensitivity_level)
returns smallint language sql immutable
as $$
  select case p
    when 'standard'   then 1::smallint
    when 'sensitive'  then 2::smallint
    when 'restricted' then 3::smallint
  end;
$$;

-- ¿El usuario actual puede ver una fila con esta sensibilidad en este deal?
create or replace function atlas.can_view(p_deal uuid, p_sens sensitivity_level)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from deal_memberships dm
    where dm.deal_id = p_deal
      and dm.profile_id = auth.uid()
      and atlas.sens_rank(dm.max_sensitivity) >= atlas.sens_rank(p_sens)
  );
$$;

-- ¿Puede escribir? (owner, scribe, analyst y el agente de IA registran;
-- advisor y viewer solo leen)
create or replace function atlas.can_write(p_deal uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select atlas.deal_role(p_deal) in ('owner', 'scribe', 'analyst', 'ai_agent');
$$;

create or replace function atlas.is_org_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from organization_memberships om
    where om.org_id = p_org and om.profile_id = auth.uid()
  );
$$;

-- updated_at automático
create or replace function atlas.touch_updated_at()
returns trigger language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_deals_touch  before update on deals  for each row execute function atlas.touch_updated_at();
create trigger trg_assets_touch before update on assets for each row execute function atlas.touch_updated_at();

-- INMUTABILIDAD DE EVENTOS: la corrección es un evento nuevo (kind='correction')
-- más una assertion que reemplaza el campo; nunca se edita la historia.
create or replace function atlas.forbid_mutation()
returns trigger language plpgsql
as $$
begin
  raise exception 'Los eventos son inmutables. Registra un evento de corrección y una assertion.';
end;
$$;

create trigger trg_events_immutable
  before update or delete on events
  for each row execute function atlas.forbid_mutation();

-- Auditoría genérica de escrituras
create or replace function atlas.audit_write()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_deal uuid;
  v_id   uuid;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
    begin v_deal := old.deal_id; exception when others then v_deal := null; end;
    insert into audit_log (actor_id, action, object_type, object_id, deal_id, details)
    values (auth.uid(), tg_op, tg_table_name, v_id, v_deal, to_jsonb(old));
    return old;
  else
    v_id := new.id;
    begin v_deal := new.deal_id; exception when others then v_deal := null; end;
    insert into audit_log (actor_id, action, object_type, object_id, deal_id, details)
    values (auth.uid(), tg_op, tg_table_name, v_id, v_deal,
            case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
                 else to_jsonb(new) end);
    return new;
  end if;
end;
$$;

create trigger trg_audit_events      after insert on events                       for each row execute function atlas.audit_write();
create trigger trg_audit_assertions  after insert or update on field_assertions   for each row execute function atlas.audit_write();
create trigger trg_audit_decisions   after insert or update on decisions          for each row execute function atlas.audit_write();
create trigger trg_audit_assets      after insert or update or delete on assets   for each row execute function atlas.audit_write();
create trigger trg_audit_memberships after insert or update or delete on deal_memberships for each row execute function atlas.audit_write();

-- assert_field: registra una afirmación y reemplaza la vigente del mismo campo.
-- SECURITY INVOKER: corre bajo el RLS del usuario que la llama.
create or replace function public.assert_field(
  p_deal uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_field_key text,
  p_value jsonb,
  p_status assertion_status,
  p_confidence numeric default null,
  p_agent text default null,
  p_evidence uuid default null,
  p_note text default null
) returns uuid
language plpgsql
as $$
declare
  v_prev uuid;
  v_new  uuid;
begin
  if p_status = 'superseded' then
    raise exception 'superseded no se asigna directamente; es resultado de reemplazo';
  end if;

  select id into v_prev
  from field_assertions
  where deal_id = p_deal and subject_type = p_subject_type
    and subject_id = p_subject_id and field_key = p_field_key
    and status <> 'superseded'
  order by created_at desc
  limit 1;

  insert into field_assertions
    (deal_id, subject_type, subject_id, field_key, value, status, confidence,
     asserted_by_profile, asserted_by_agent, based_on_evidence_id, supersedes_id, note)
  values
    (p_deal, p_subject_type, p_subject_id, p_field_key, p_value, p_status, p_confidence,
     case when p_agent is null then auth.uid() end, p_agent, p_evidence, v_prev, p_note)
  returning id into v_new;

  if v_prev is not null then
    update field_assertions set status = 'superseded' where id = v_prev;
  end if;

  return v_new;
end;
$$;

-- confirm_assertion: una persona valida una inferencia y cierra su tarea
create or replace function public.confirm_assertion(p_assertion uuid)
returns void
language plpgsql
as $$
begin
  update field_assertions
     set status = 'confirmed'
   where id = p_assertion and status in ('inferred', 'observed', 'disputed');

  if not found then
    raise exception 'Assertion inexistente, superseded o sin permiso';
  end if;

  update validation_tasks
     set status = 'confirmed', resolved_by = auth.uid(), resolved_at = now()
   where assertion_id = p_assertion and status = 'pending';
end;
$$;

-- ============================================================================
-- 13. ÍNDICES
-- ============================================================================

create index idx_deal_memberships_profile on deal_memberships (profile_id);
create index idx_actors_org              on actors (org_id);
create index idx_deal_actors_deal        on deal_actors (deal_id);
create index idx_assets_deal             on assets (deal_id, kind);
create index idx_asset_versions_asset    on asset_versions (asset_id);
create index idx_events_deal_time        on events (deal_id, occurred_at);
create index idx_events_payload          on events using gin (payload);
create index idx_event_participants_evt  on event_participants (event_id);
create index idx_event_participants_act  on event_participants (actor_id);
create index idx_evidence_deal           on evidence_items (deal_id, ingested_at);
create index idx_evidence_hash           on evidence_items (content_hash);
create index idx_evidence_links_obj      on evidence_links (linked_type, linked_id);
create index idx_assertions_subject      on field_assertions (deal_id, subject_type, subject_id, field_key);
create index idx_assertions_pending      on validation_tasks (deal_id, retro_week) where status = 'pending';
create index idx_requests_deal_open      on requests (deal_id) where status in ('open', 'partially_answered');
create index idx_requests_from_actor     on requests (requested_from_actor);
create index idx_dependencies_deal       on dependencies (deal_id) where resolved_at is null;
create index idx_decisions_deal          on decisions (deal_id);
create index idx_audit_deal_time         on audit_log (deal_id, at);

-- ============================================================================
-- 14. ROW LEVEL SECURITY
-- Patrón: SELECT exige membresía + techo de sensibilidad;
-- INSERT/UPDATE exigen rol escritor; DELETE casi siempre prohibido.
-- ============================================================================

alter table organizations            enable row level security;
alter table profiles                 enable row level security;
alter table organization_memberships enable row level security;
alter table schema_templates         enable row level security;
alter table template_versions        enable row level security;
alter table canonical_concepts       enable row level security;
alter table field_mappings           enable row level security;
alter table deals                    enable row level security;
alter table deal_memberships         enable row level security;
alter table actors                   enable row level security;
alter table deal_actors              enable row level security;
alter table assets                   enable row level security;
alter table asset_versions           enable row level security;
alter table asset_relations          enable row level security;
alter table events                   enable row level security;
alter table event_participants       enable row level security;
alter table event_asset_links        enable row level security;
alter table evidence_sources         enable row level security;
alter table evidence_items           enable row level security;
alter table evidence_links           enable row level security;
alter table ingestion_jobs           enable row level security;
alter table field_assertions         enable row level security;
alter table validation_tasks         enable row level security;
alter table requests                 enable row level security;
alter table request_responses        enable row level security;
alter table dependencies             enable row level security;
alter table decisions                enable row level security;
alter table anonymization_jobs       enable row level security;
alter table aggregate_metrics        enable row level security;
alter table audit_log                enable row level security;

-- Identidad
create policy p_profiles_self_sel on profiles for select using (id = auth.uid());
create policy p_profiles_self_upd on profiles for update using (id = auth.uid());
create policy p_profiles_self_ins on profiles for insert with check (id = auth.uid());

create policy p_orgs_sel on organizations for select using (atlas.is_org_member(id));
create policy p_orgmem_sel on organization_memberships for select using (atlas.is_org_member(org_id));

-- Plantillas y conceptos canónicos: legibles por cualquier usuario autenticado
create policy p_templates_sel on schema_templates   for select using (auth.uid() is not null);
create policy p_tversions_sel on template_versions  for select using (auth.uid() is not null);
create policy p_concepts_sel  on canonical_concepts for select using (auth.uid() is not null);
create policy p_fieldmap_sel  on field_mappings     for select using (auth.uid() is not null);

-- Deals
create policy p_deals_sel on deals for select using (atlas.is_deal_member(id));
create policy p_deals_ins on deals for insert with check (atlas.is_org_member(org_id));
create policy p_deals_upd on deals for update using (atlas.deal_role(id) in ('owner', 'scribe'));

create policy p_dealmem_sel on deal_memberships for select using (atlas.is_deal_member(deal_id));
create policy p_dealmem_ins on deal_memberships for insert with check (atlas.deal_role(deal_id) = 'owner');
create policy p_dealmem_upd on deal_memberships for update using (atlas.deal_role(deal_id) = 'owner');
create policy p_dealmem_del on deal_memberships for delete using (atlas.deal_role(deal_id) = 'owner');

-- Actores: visibles para miembros de la organización
create policy p_actors_sel on actors for select using (atlas.is_org_member(org_id));
create policy p_actors_ins on actors for insert with check (atlas.is_org_member(org_id));
create policy p_actors_upd on actors for update using (atlas.is_org_member(org_id));

create policy p_dealactors_sel on deal_actors for select
  using (atlas.can_view(deal_id, sensitivity));
create policy p_dealactors_ins on deal_actors for insert with check (atlas.can_write(deal_id));
create policy p_dealactors_upd on deal_actors for update using (atlas.can_write(deal_id));

-- Activos
create policy p_assets_sel on assets for select using (atlas.can_view(deal_id, sensitivity));
create policy p_assets_ins on assets for insert with check (atlas.can_write(deal_id));
create policy p_assets_upd on assets for update using (atlas.can_write(deal_id));

create policy p_assetver_sel on asset_versions for select
  using (exists (select 1 from assets a where a.id = asset_id and atlas.can_view(a.deal_id, a.sensitivity)));
create policy p_assetver_ins on asset_versions for insert
  with check (exists (select 1 from assets a where a.id = asset_id and atlas.can_write(a.deal_id)));

create policy p_assetrel_sel on asset_relations for select using (atlas.is_deal_member(deal_id));
create policy p_assetrel_ins on asset_relations for insert with check (atlas.can_write(deal_id));

-- Eventos: sin política de UPDATE/DELETE — inmutables también vía RLS
create policy p_events_sel on events for select using (atlas.can_view(deal_id, sensitivity));
create policy p_events_ins on events for insert with check (atlas.can_write(deal_id));

create policy p_evtpart_sel on event_participants for select
  using (exists (select 1 from events e where e.id = event_id and atlas.can_view(e.deal_id, e.sensitivity)));
create policy p_evtpart_ins on event_participants for insert
  with check (exists (select 1 from events e where e.id = event_id and atlas.can_write(e.deal_id)));

create policy p_evtasset_sel on event_asset_links for select
  using (exists (select 1 from events e where e.id = event_id and atlas.can_view(e.deal_id, e.sensitivity)));
create policy p_evtasset_ins on event_asset_links for insert
  with check (exists (select 1 from events e where e.id = event_id and atlas.can_write(e.deal_id)));

-- Evidencia
create policy p_evsrc_sel on evidence_sources for select using (atlas.is_org_member(org_id));
create policy p_evsrc_ins on evidence_sources for insert with check (atlas.is_org_member(org_id));
create policy p_evsrc_upd on evidence_sources for update using (atlas.is_org_member(org_id));

create policy p_evitems_sel on evidence_items for select using (atlas.can_view(deal_id, sensitivity));
create policy p_evitems_ins on evidence_items for insert with check (atlas.can_write(deal_id));

create policy p_evlinks_sel on evidence_links for select
  using (exists (select 1 from evidence_items ev where ev.id = evidence_id and atlas.can_view(ev.deal_id, ev.sensitivity)));
create policy p_evlinks_ins on evidence_links for insert
  with check (exists (select 1 from evidence_items ev where ev.id = evidence_id and atlas.can_write(ev.deal_id)));

create policy p_ingjobs_sel on ingestion_jobs for select
  using (exists (select 1 from evidence_sources s where s.id = source_id and atlas.is_org_member(s.org_id)));

-- Assertions y validación
create policy p_assert_sel on field_assertions for select using (atlas.is_deal_member(deal_id));
create policy p_assert_ins on field_assertions for insert with check (atlas.can_write(deal_id));
create policy p_assert_upd on field_assertions for update using (atlas.can_write(deal_id));

create policy p_valtasks_sel on validation_tasks for select using (atlas.is_deal_member(deal_id));
create policy p_valtasks_ins on validation_tasks for insert with check (atlas.can_write(deal_id));
create policy p_valtasks_upd on validation_tasks for update using (atlas.can_write(deal_id));

-- Flujo
create policy p_requests_sel on requests for select using (atlas.can_view(deal_id, sensitivity));
create policy p_requests_ins on requests for insert with check (atlas.can_write(deal_id));
create policy p_requests_upd on requests for update using (atlas.can_write(deal_id));

create policy p_reqresp_sel on request_responses for select
  using (exists (select 1 from requests r where r.id = request_id and atlas.can_view(r.deal_id, r.sensitivity)));
create policy p_reqresp_ins on request_responses for insert
  with check (exists (select 1 from requests r where r.id = request_id and atlas.can_write(r.deal_id)));

create policy p_deps_sel on dependencies for select using (atlas.is_deal_member(deal_id));
create policy p_deps_ins on dependencies for insert with check (atlas.can_write(deal_id));
create policy p_deps_upd on dependencies for update using (atlas.can_write(deal_id));

create policy p_decisions_sel on decisions for select using (atlas.can_view(deal_id, sensitivity));
create policy p_decisions_ins on decisions for insert with check (atlas.can_write(deal_id));
create policy p_decisions_upd on decisions for update
  using (atlas.deal_role(deal_id) in ('owner', 'scribe'));

-- Gobierno: anonimización solo por admins de la org; métricas agregadas
-- legibles por miembros de la org (ya no contienen nada identificable)
create policy p_anonjobs_sel on anonymization_jobs for select using (atlas.is_org_member(org_id));
create policy p_anonjobs_ins on anonymization_jobs for insert
  with check (exists (select 1 from organization_memberships om
                      where om.org_id = anonymization_jobs.org_id
                        and om.profile_id = auth.uid() and om.is_admin));

create policy p_aggmetrics_sel on aggregate_metrics for select
  using (exists (select 1 from anonymization_jobs j
                 where j.id = produced_by_job and atlas.is_org_member(j.org_id)));

-- audit_log: sin políticas => solo service_role (bypassa RLS) puede leer.
-- El equipo de producto NUNCA lee datos de deals: solo tablas operational.

-- ============================================================================
-- 15. VISTAS (security_invoker: respetan el RLS del consultante)
-- ============================================================================

-- Estado actual: la mejor afirmación vigente por campo.
-- Prioridad: confirmed > observed > inferred; disputed se marca, no gana.
create or replace view v_current_state
with (security_invoker = true) as
select distinct on (deal_id, subject_type, subject_id, field_key)
  deal_id, subject_type, subject_id, field_key, value, status, confidence,
  asserted_by_profile, asserted_by_agent, based_on_evidence_id, created_at
from field_assertions
where status <> 'superseded'
order by deal_id, subject_type, subject_id, field_key,
  case status when 'confirmed' then 3 when 'observed' then 2 when 'inferred' then 1 else 0 end desc,
  created_at desc;

-- Solicitudes abiertas con días de espera — la tarjeta principal de la UI
create or replace view v_open_requests
with (security_invoker = true) as
select
  r.id, r.deal_id, r.title,
  ab.display_name  as requested_by,
  af.display_name  as requested_from,
  r.requested_at, r.due_at, r.status, r.wait_cause,
  extract(day from now() - r.requested_at)::int                    as days_waiting,
  extract(day from coalesce(r.first_response_at, now()) - r.requested_at)::int as days_to_first_response
from requests r
join actors ab on ab.id = r.requested_by_actor
join actors af on af.id = r.requested_from_actor
where r.status in ('open', 'partially_answered');

-- Línea de tiempo reconstruida del deal
create or replace view v_deal_timeline
with (security_invoker = true) as
select
  e.id, e.deal_id, e.occurred_at, e.kind, e.stage_key, e.summary,
  e.origin, e.confidence, e.sensitivity,
  (select count(*) from evidence_links l where l.linked_type = 'event' and l.linked_id = e.id) as evidence_count,
  (select count(*) from validation_tasks vt
    join field_assertions fa on fa.id = vt.assertion_id
    where fa.subject_type = 'event' and fa.subject_id = e.id and vt.status = 'pending') as pending_validations
from events e;

-- Métricas maestras por deal (sección 11 de la plantilla)
create or replace view v_deal_metrics
with (security_invoker = true) as
select
  d.id as deal_id,
  d.codename,
  d.status,
  d.current_stage_key,
  d.opened_at,
  (select count(*) from deal_actors da where da.deal_id = d.id)                  as actor_count,
  (select count(*) from assets a where a.deal_id = d.id and a.kind = 'document') as document_count,
  (select count(*) from events e where e.deal_id = d.id)                          as event_count,
  (select count(*) from requests r where r.deal_id = d.id)                        as request_count,
  (select count(*) from requests r where r.deal_id = d.id
     and r.status in ('open','partially_answered'))                               as open_requests,
  (select coalesce(avg(extract(day from r.satisfied_at - r.requested_at)), 0)::numeric(8,1)
     from requests r where r.deal_id = d.id and r.satisfied_at is not null)       as avg_days_per_request,
  (select count(*) from decisions x where x.deal_id = d.id and x.resolved_at is null) as pending_decisions,
  (select count(*) from validation_tasks vt where vt.deal_id = d.id and vt.status = 'pending') as pending_validations
from deals d;

-- ============================================================================
-- 16. GRANTS (Supabase). Guardado para no fallar en Postgres local.
-- ============================================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    grant usage on schema atlas to authenticated;
    grant execute on all functions in schema atlas to authenticated;
  end if;
end $$;

-- ============================================================================
-- 17. SEED: plantilla v1.0 y conceptos canónicos
-- ============================================================================

insert into schema_templates (id, key, name)
values ('a0000000-0000-0000-0000-000000000001', 'acquisition_observatory', 'Acquisition Observatory');

insert into template_versions (id, template_id, version, stages, published_at)
values (
  'a0000000-0000-0000-0000-000000000010',
  'a0000000-0000-0000-0000-000000000001',
  '1.0',
  '[
    {"key": "originacion",     "name": "Originación",                "position": 1},
    {"key": "evaluacion",      "name": "Evaluación inicial",         "position": 2},
    {"key": "oferta_loi",      "name": "Oferta y LOI",               "position": 3},
    {"key": "due_diligence",   "name": "Due diligence",              "position": 4},
    {"key": "financiamiento",  "name": "Financiamiento",             "position": 5},
    {"key": "capital_spv",     "name": "Capital del SPV",            "position": 6},
    {"key": "documentacion",   "name": "Documentación definitiva",   "position": 7},
    {"key": "cierre",          "name": "Cierre",                     "position": 8},
    {"key": "integracion",     "name": "Integración",                "position": 9}
  ]'::jsonb,
  now()
);

insert into canonical_concepts (key, description) values
  ('friction.information.unavailable', 'La información necesaria no existe o no está disponible'),
  ('friction.information.disordered',  'La información existe pero está desordenada'),
  ('friction.information.incorrect',   'La información entregada es incorrecta'),
  ('friction.information.duplicated',  'El mismo dato se pidió o capturó más de una vez'),
  ('friction.ownership.no_owner',      'Nadie es responsable de responder'),
  ('friction.ownership.no_authorization', 'Falta una autorización para continuar'),
  ('friction.incentives.misaligned',   'Los incentivos de las partes no están alineados'),
  ('friction.negotiation',             'Negociación sustantiva entre las partes'),
  ('friction.dependency.third_party',  'Dependencia de un tercero externo'),
  ('friction.requirement.legal',       'Requisito legal o regulatorio'),
  ('friction.requirement.bank',        'Requisito bancario'),
  ('friction.execution.signature',     'Proceso de firma'),
  ('friction.execution.money_transfer','Transferencia de fondos'),
  ('friction.execution.version_churn', 'Cambios de versión de documentos'),
  ('friction.context.loss',            'Pérdida de contexto entre actores o sistemas'),
  ('friction.trust',                   'Falta de confianza entre las partes');

commit;
