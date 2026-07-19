/**
 * Seed de desarrollo para la base LOCAL (supabase start).
 *
 * Crea: usuario dev, organización, deal de ejemplo, actores y datos mínimos
 * para ver la app funcionando. Usa la service key SOLO como tooling local;
 * la app nunca la toca.
 *
 * Uso: npm run seed
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// override: el entorno de la sesión puede traer llaves de OTRO proyecto
// Supabase; para tooling local, .env.local siempre gana.
config({ path: ".env.local", override: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY (ver .env.local)");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fail(label: string, error: { message: string } | null) {
  if (error) {
    console.error(`Seed falló en ${label}: ${error.message}`);
    process.exit(1);
  }
}

const DEV_EMAIL = "jose@dev.local";
const DEV_PASSWORD = "atlas-dev-123";
const TEMPLATE_VERSION_ID = "a0000000-0000-0000-0000-000000000010"; // seed de 0001

async function main() {
  // 1. Usuario dev (idempotente)
  let userId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
  });

  if (createErr) {
    if (!createErr.message.includes("already been registered")) throw createErr;
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) throw listErr;
    const existing = list.users.find((u) => u.email === DEV_EMAIL);
    if (!existing) throw new Error("Usuario dev no encontrado tras conflicto");
    userId = existing.id;
  } else {
    userId = created.user.id;
  }

  // 2. Perfil
  fail(
    "profiles",
    (
      await admin.from("profiles").upsert({
        id: userId,
        full_name: "Jose (dev)",
        email: DEV_EMAIL,
      })
    ).error
  );

  // 3. Organización + membresía admin
  const ORG_ID = "aaaa0000-0000-0000-0000-0000000000a1";
  fail(
    "organizations",
    (
      await admin
        .from("organizations")
        .upsert({ id: ORG_ID, name: "Quimibond Capital (dev)" })
    ).error
  );
  fail(
    "organization_memberships",
    (
      await admin
        .from("organization_memberships")
        .upsert(
          { org_id: ORG_ID, profile_id: userId, is_admin: true },
          { onConflict: "org_id,profile_id" }
        )
    ).error
  );

  // 4. Deal de ejemplo
  const DEAL_ID = "dddd0000-0000-0000-0000-0000000000d1";
  fail(
    "deals",
    (
      await admin.from("deals").upsert({
        id: DEAL_ID,
        org_id: ORG_ID,
        codename: "PROYECTO-DEMO",
        template_version_id: TEMPLATE_VERSION_ID,
        current_stage_key: "due_diligence",
        created_by: userId,
      })
    ).error
  );
  fail("deal_memberships", (await admin.from("deal_memberships").upsert(
    {
      deal_id: DEAL_ID,
      profile_id: userId,
      role: "owner",
      max_sensitivity: "restricted",
    },
    { onConflict: "deal_id,profile_id" }
  )).error);

  // 5. Actores y participación en el deal
  const COMPRADOR_ID = "ac000000-0000-0000-0000-0000000000a1";
  const VENDEDOR_ID = "ac000000-0000-0000-0000-0000000000a2";
  fail("actors", (await admin.from("actors").upsert([
    {
      id: COMPRADOR_ID,
      org_id: ORG_ID,
      kind: "organization",
      display_name: "Comprador SPV (dev)",
    },
    {
      id: VENDEDOR_ID,
      org_id: ORG_ID,
      kind: "organization",
      display_name: "Target Demo SA",
    },
  ])).error);
  fail("deal_actors", (await admin.from("deal_actors").upsert(
    [
      { deal_id: DEAL_ID, actor_id: COMPRADOR_ID, role: "comprador" },
      { deal_id: DEAL_ID, actor_id: VENDEDOR_ID, role: "vendedor" },
    ],
    { onConflict: "deal_id,actor_id,role" }
  )).error);

  // 6. Un evento y una solicitud abierta para ver algo en la UI
  const { data: existingEvents } = await admin
    .from("events")
    .select("id")
    .eq("deal_id", DEAL_ID)
    .limit(1);
  if (!existingEvents || existingEvents.length === 0) {
    fail(
      "events",
      (
        await admin.from("events").insert({
          deal_id: DEAL_ID,
          kind: "email_received",
          stage_key: "due_diligence",
          occurred_at: new Date(Date.now() - 6 * 864e5).toISOString(),
          summary: "Target Demo envió estados financieros 2024 por correo",
          origin: "ingested",
        })
      ).error
    );
  }
  fail(
    "requests",
    (
      await admin.from("requests").upsert({
        id: "f0000000-0000-0000-0000-0000000000f1",
        deal_id: DEAL_ID,
        title: "Balanza de comprobación 2024",
        requested_by_actor: COMPRADOR_ID,
        requested_from_actor: VENDEDOR_ID,
        requested_at: new Date(Date.now() - 6 * 864e5).toISOString(),
      })
    ).error
  );

  console.log("Seed listo.");
  console.log(`  Usuario:    ${DEV_EMAIL}`);
  console.log(`  Contraseña: ${DEV_PASSWORD}`);
  console.log(`  Deal:       PROYECTO-DEMO (${DEAL_ID})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
