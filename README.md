# Atlas v0 — Transaction Observatory

Observatorio de transacciones para adquisiciones de empresas privadas (M&A middle market, México). Su único trabajo en v0 es **observar y reconstruir** transacciones reales, no ejecutarlas.

## Arquitectura (innegociable)

- **Cinco primitivas**: actores, activos, eventos, reglas/decisiones, permisos. Nada de tablas ad-hoc por feature.
- **Eventos inmutables**: trigger que bloquea UPDATE/DELETE. Las correcciones son eventos nuevos + assertions.
- **Estado actual** solo desde `v_current_state` (confirmed > observed > inferred). Nunca mezclar hechos confirmados con inferencias de IA.
- **Escrituras de IA** vía `assert_field(...)` con `p_agent` (ej. `claude-scribe-v1`) y status `inferred` + confidence. Validación humana vía `confirm_assertion(...)`.
- **Tenancy hermético por deal** vía RLS (`deal_memberships` + techo de sensibilidad por fila). El frontend siempre opera como usuario autenticado bajo RLS; nunca service_role en el cliente.
- **Clasificación**: todo lo del deal es `deal_confidential`. `aggregate_metrics` no tiene `deal_id` a propósito.
- **Captura < 30 s**: qué ocurrió, quién, cuándo, evidencia. El resto lo infiere la IA.

## Stack

- **Backend**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind, `@supabase/ssr`
- **IA**: Anthropic API (scribe en Edge Functions / worker, nunca en el cliente)

## Desarrollo local

Requisitos: Node 22+, Docker.

```bash
npm install
npx supabase start          # levanta Postgres/Auth/REST locales y aplica supabase/migrations/
cp .env.example .env.local  # completa con las llaves que imprime supabase start
npm run seed                # usuario dev + org + deal de ejemplo
npm run dev                 # http://localhost:3000  (jose@dev.local / atlas-dev-123)
```

## Verificación

```bash
npm run test:integration    # Vitest contra la base local: RLS, sensibilidad, assertions
# Smoke tests SQL del esquema (como superusuario del contenedor):
docker cp supabase/tests/atlas_smoke_tests.sql supabase_db_atlas:/tmp/smoke.sql
docker exec supabase_db_atlas psql -U supabase_admin -d postgres -f /tmp/smoke.sql
```

## Migraciones

- `supabase/migrations/0001_atlas_v0_core.sql` — esquema núcleo (30 tablas, 4 vistas, RLS, triggers, funciones). **Aplicada; no se edita.**
- `supabase/migrations/0002_grants_service_role.sql` — grants para `service_role` (scribe/workers/tooling). La 0001 solo otorgaba a `authenticated`.
- Cambios nuevos al esquema = migración nueva (`0003+`), nunca editar las aplicadas.
- Regenerar tipos tras cambios: `npm run gen:types`.

## Alcance v0

Seis capacidades: crear deal, incorporar actores, recibir evidencia, reconstruir cronología con IA, identificar solicitudes/dependencias/esperas, retrospectiva semanal. **No** incluye: data room, firmas, SPVs, capital calls, marketplace, tokenización, ni agentes que deciden.
