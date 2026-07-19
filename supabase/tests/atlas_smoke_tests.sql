-- ============================================================
-- SMOKE TESTS Atlas v0
-- ============================================================
\set ON_ERROR_STOP on

-- Rol de app sin privilegios de superusuario (simula 'authenticated')
drop role if exists app_user;
create role app_user login;
grant usage on schema public, atlas, auth to app_user;
grant execute on function auth.uid() to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant execute on all functions in schema public to app_user;
grant execute on all functions in schema atlas to app_user;

-- Datos base (como superusuario)
insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- Jose (owner)
  ('22222222-2222-2222-2222-222222222222'),  -- Analista (scribe)
  ('33333333-3333-3333-3333-333333333333'),  -- Banco (viewer, standard)
  ('44444444-4444-4444-4444-444444444444');  -- Extraño (sin membresía)

insert into organizations (id, name) values
  ('aaaa0000-0000-0000-0000-000000000001', 'Quimibond Capital');

insert into profiles (id, full_name, email) values
  ('11111111-1111-1111-1111-111111111111', 'Jose', 'jose@qb.mx'),
  ('22222222-2222-2222-2222-222222222222', 'Analista', 'ana@qb.mx'),
  ('33333333-3333-3333-3333-333333333333', 'Banco', 'banco@bbva.mx'),
  ('44444444-4444-4444-4444-444444444444', 'Extraño', 'x@x.mx');

insert into organization_memberships (org_id, profile_id, is_admin) values
  ('aaaa0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', true),
  ('aaaa0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', false);

insert into deals (id, org_id, codename, template_version_id, current_stage_key, created_by) values
  ('dddd0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001',
   'PROYECTO-NORTE', 'a0000000-0000-0000-0000-000000000010', 'due_diligence',
   '11111111-1111-1111-1111-111111111111');

insert into deal_memberships (deal_id, profile_id, role, max_sensitivity) values
  ('dddd0000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner',  'restricted'),
  ('dddd0000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'scribe', 'sensitive'),
  ('dddd0000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer', 'standard');

insert into actors (id, org_id, kind, display_name) values
  ('ac000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', 'organization', 'Comprador SPV'),
  ('ac000000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000001', 'organization', 'Target Norte SA');

insert into deal_actors (deal_id, actor_id, role) values
  ('dddd0000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000001', 'comprador'),
  ('dddd0000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002', 'vendedor');

insert into events (id, deal_id, kind, stage_key, occurred_at, summary, origin) values
  ('e0000000-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-000000000001',
   'email_received', 'due_diligence', now() - interval '6 days',
   'Target Norte envió estados financieros 2024 por correo', 'ingested');

insert into requests (id, deal_id, title, requested_by_actor, requested_from_actor, requested_at) values
  ('f0000000-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-000000000001',
   'Balanza de comprobación 2024',
   'ac000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-000000000002',
   now() - interval '6 days');

insert into decisions (deal_id, title, requested_at, sensitivity) values
  ('dddd0000-0000-0000-0000-000000000001', 'Estrategia de negociación earn-out',
   now() - interval '2 days', 'restricted');

-- ============================================================
-- TEST 1: los eventos son inmutables
-- ============================================================
\echo '--- TEST 1: inmutabilidad de eventos (debe fallar el UPDATE) ---'
do $$
begin
  begin
    update events set summary = 'hackeado' where id = 'e0000000-0000-0000-0000-000000000001';
    raise exception 'FALLO: el evento se pudo editar';
  exception when others then
    if sqlerrm like '%inmutables%' then
      raise notice 'OK: UPDATE bloqueado (%)', sqlerrm;
    else
      raise;
    end if;
  end;
  begin
    delete from events where id = 'e0000000-0000-0000-0000-000000000001';
    raise exception 'FALLO: el evento se pudo borrar';
  exception when others then
    if sqlerrm like '%inmutables%' then
      raise notice 'OK: DELETE bloqueado';
    else
      raise;
    end if;
  end;
end $$;

-- ============================================================
-- TEST 2: assert_field con supersede + v_current_state (como app_user)
-- ============================================================
\echo '--- TEST 2: ciclo de assertions inferred -> corregida -> confirmed ---'
set role app_user;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';  -- el scribe

-- La IA infiere la causa de espera
select assert_field(
  'dddd0000-0000-0000-0000-000000000001', 'request',
  'f0000000-0000-0000-0000-000000000001', 'wait_cause',
  '"info_disordered"'::jsonb, 'inferred', 0.72, 'claude-scribe-v1', null,
  'Inferido del hilo de correos') as inferencia_ia \gset

-- El humano corrige con otro valor (supersede automático)
select assert_field(
  'dddd0000-0000-0000-0000-000000000001', 'request',
  'f0000000-0000-0000-0000-000000000001', 'wait_cause',
  '"info_unavailable"'::jsonb, 'observed', null, null, null,
  'El vendedor confirmó que el archivo no existe') as correccion \gset

select public.confirm_assertion(:'correccion');

\echo 'Estado vigente (debe ser info_unavailable / confirmed):'
select field_key, value, status, confidence
from v_current_state
where subject_id = 'f0000000-0000-0000-0000-000000000001';

\echo 'Historial completo (la inferencia debe estar superseded):'
select value, status, asserted_by_agent from field_assertions
where subject_id = 'f0000000-0000-0000-0000-000000000001' order by created_at;

-- ============================================================
-- TEST 3: RLS — un extraño no ve nada
-- ============================================================
\echo '--- TEST 3: RLS de tenancy (el extraño debe ver 0 filas) ---'
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select count(*) as deals_visibles_extrano from deals;
select count(*) as eventos_visibles_extrano from events;

-- ============================================================
-- TEST 4: RLS — techo de sensibilidad
-- El banco (viewer, standard) ve el deal pero NO la decisión restricted
-- ============================================================
\echo '--- TEST 4: sensibilidad (banco ve deal y eventos, no la decisión restricted) ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
select count(*) as deals_visibles_banco from deals;
select count(*) as eventos_visibles_banco from events;
select count(*) as decisiones_visibles_banco from decisions;   -- debe ser 0

\echo 'El owner sí ve la decisión restricted (debe ser 1):'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select count(*) as decisiones_visibles_owner from decisions;

-- ============================================================
-- TEST 5: el viewer no puede escribir eventos
-- ============================================================
\echo '--- TEST 5: viewer no puede insertar eventos (debe fallar) ---'
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  begin
    insert into events (deal_id, kind, occurred_at, summary)
    values ('dddd0000-0000-0000-0000-000000000001', 'note_added', now(), 'nota del banco');
    raise exception 'FALLO: el viewer pudo escribir';
  exception when insufficient_privilege or check_violation then
    raise notice 'OK: escritura de viewer bloqueada';
  when others then
    if sqlerrm like '%row-level security%' then
      raise notice 'OK: escritura de viewer bloqueada por RLS';
    else raise; end if;
  end;
end $$;

-- ============================================================
-- TEST 6: vistas operativas
-- ============================================================
\echo '--- TEST 6: v_open_requests y v_deal_metrics (como owner) ---'
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select title, requested_from, days_waiting, status from v_open_requests;
select codename, actor_count, event_count, open_requests, pending_decisions from v_deal_metrics;

reset role;
\echo '=== TODOS LOS SMOKE TESTS TERMINARON ==='
