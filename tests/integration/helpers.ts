/**
 * Helpers para tests de integración contra la base LOCAL (supabase start).
 * Crea usuarios y datos de prueba con la service key (tooling de test),
 * pero cada aserción de RLS se ejecuta con un cliente ANON autenticado,
 * exactamente como operaría el frontend.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// override: el entorno de la sesión puede traer llaves de OTRO proyecto
// Supabase; los tests corren SIEMPRE contra la base local de supabase start.
config({ path: ".env.local", override: true });

export const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const TEST = {
  ORG_ID: "aaaa0000-0000-0000-0000-000000001001",
  DEAL_ID: "dddd0000-0000-0000-0000-000000001001",
  COMPRADOR_ID: "ac000000-0000-0000-0000-000000001001",
  VENDEDOR_ID: "ac000000-0000-0000-0000-000000001002",
  REQUEST_ID: "f0000000-0000-0000-0000-000000001001",
  EVENT_ID: "e0000000-0000-0000-0000-000000001001",
  TEMPLATE_VERSION_ID: "a0000000-0000-0000-0000-000000000010",
  users: {
    owner: { email: "owner@test.local", password: "test-pass-123" },
    viewer: { email: "viewer@test.local", password: "test-pass-123" },
    outsider: { email: "outsider@test.local", password: "test-pass-123" },
  },
};

async function ensureUser(email: string, password: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (!error) return data.user.id;
  if (!error.message.includes("already been registered")) throw error;
  const { data: list, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) throw listErr;
  const u = list.users.find((x) => x.email === email);
  if (!u) throw new Error(`Usuario ${email} no encontrado`);
  return u.id;
}

export interface TestUsers {
  ownerId: string;
  viewerId: string;
  outsiderId: string;
}

/** Crea (idempotente) los usuarios y el escenario base del deal de prueba. */
export async function seedScenario(): Promise<TestUsers> {
  const ownerId = await ensureUser(
    TEST.users.owner.email,
    TEST.users.owner.password
  );
  const viewerId = await ensureUser(
    TEST.users.viewer.email,
    TEST.users.viewer.password
  );
  const outsiderId = await ensureUser(
    TEST.users.outsider.email,
    TEST.users.outsider.password
  );

  const fail = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`${label}: ${error.message}`);
  };

  fail(
    "profiles",
    (
      await admin.from("profiles").upsert([
        { id: ownerId, full_name: "Owner Test", email: TEST.users.owner.email },
        { id: viewerId, full_name: "Viewer Test", email: TEST.users.viewer.email },
        {
          id: outsiderId,
          full_name: "Outsider Test",
          email: TEST.users.outsider.email,
        },
      ])
    ).error
  );

  fail(
    "organizations",
    (
      await admin
        .from("organizations")
        .upsert({ id: TEST.ORG_ID, name: "Org Test" })
    ).error
  );

  fail(
    "organization_memberships",
    (
      await admin
        .from("organization_memberships")
        .upsert(
          { org_id: TEST.ORG_ID, profile_id: ownerId, is_admin: true },
          { onConflict: "org_id,profile_id" }
        )
    ).error
  );

  fail(
    "deals",
    (
      await admin.from("deals").upsert({
        id: TEST.DEAL_ID,
        org_id: TEST.ORG_ID,
        codename: "PROYECTO-TEST",
        template_version_id: TEST.TEMPLATE_VERSION_ID,
        current_stage_key: "due_diligence",
        created_by: ownerId,
      })
    ).error
  );

  fail(
    "deal_memberships",
    (
      await admin.from("deal_memberships").upsert(
        [
          {
            deal_id: TEST.DEAL_ID,
            profile_id: ownerId,
            role: "owner",
            max_sensitivity: "restricted",
          },
          {
            deal_id: TEST.DEAL_ID,
            profile_id: viewerId,
            role: "viewer",
            max_sensitivity: "standard",
          },
        ],
        { onConflict: "deal_id,profile_id" }
      )
    ).error
  );

  fail(
    "actors",
    (
      await admin.from("actors").upsert([
        {
          id: TEST.COMPRADOR_ID,
          org_id: TEST.ORG_ID,
          kind: "organization",
          display_name: "Comprador Test",
        },
        {
          id: TEST.VENDEDOR_ID,
          org_id: TEST.ORG_ID,
          kind: "organization",
          display_name: "Vendedor Test",
        },
      ])
    ).error
  );

  fail(
    "deal_actors",
    (
      await admin.from("deal_actors").upsert(
        [
          {
            deal_id: TEST.DEAL_ID,
            actor_id: TEST.COMPRADOR_ID,
            role: "comprador",
          },
          { deal_id: TEST.DEAL_ID, actor_id: TEST.VENDEDOR_ID, role: "vendedor" },
        ],
        { onConflict: "deal_id,actor_id,role" }
      )
    ).error
  );

  const { data: ev } = await admin
    .from("events")
    .select("id")
    .eq("id", TEST.EVENT_ID)
    .maybeSingle();
  if (!ev) {
    fail(
      "events",
      (
        await admin.from("events").insert({
          id: TEST.EVENT_ID,
          deal_id: TEST.DEAL_ID,
          kind: "email_received",
          stage_key: "due_diligence",
          occurred_at: new Date(Date.now() - 6 * 864e5).toISOString(),
          summary: "Evento de prueba: EEFF 2024 recibidos",
          origin: "ingested",
        })
      ).error
    );
  }

  fail(
    "requests",
    (
      await admin.from("requests").upsert({
        id: TEST.REQUEST_ID,
        deal_id: TEST.DEAL_ID,
        title: "Balanza de comprobación 2024",
        requested_by_actor: TEST.COMPRADOR_ID,
        requested_from_actor: TEST.VENDEDOR_ID,
        requested_at: new Date(Date.now() - 6 * 864e5).toISOString(),
      })
    ).error
  );

  // Decisión restricted: visible solo con techo de sensibilidad suficiente
  const { data: dec } = await admin
    .from("decisions")
    .select("id")
    .eq("deal_id", TEST.DEAL_ID)
    .eq("title", "Estrategia earn-out (restricted)")
    .maybeSingle();
  if (!dec) {
    fail(
      "decisions",
      (
        await admin.from("decisions").insert({
          deal_id: TEST.DEAL_ID,
          title: "Estrategia earn-out (restricted)",
          requested_at: new Date().toISOString(),
          sensitivity: "restricted",
        })
      ).error
    );
  }

  return { ownerId, viewerId, outsiderId };
}

/** Cliente anon autenticado como un usuario de prueba (opera bajo RLS). */
export async function signIn(
  who: keyof typeof TEST.users
): Promise<SupabaseClient> {
  const client = createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword(TEST.users[who]);
  if (error) throw new Error(`signIn(${who}): ${error.message}`);
  return client;
}
