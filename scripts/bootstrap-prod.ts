/**
 * Bootstrap del proyecto REMOTO: crea el usuario operador, su perfil, la
 * organización y la membresía admin. Tooling de operador con service key —
 * se corre una sola vez por entorno; nunca es parte de la app.
 *
 * Uso:
 *   export NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=<service key del proyecto>
 *   export ATLAS_EMAIL=jose@...  ATLAS_PASSWORD=...  ATLAS_ORG="Quimibond Capital"
 *   npx tsx scripts/bootstrap-prod.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" }); // sin override: el entorno exportado gana

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ATLAS_EMAIL;
const password = process.env.ATLAS_PASSWORD;
const orgName = process.env.ATLAS_ORG ?? "Quimibond Capital";

if (!url || !serviceKey || !email || !password) {
  console.error(
    "Faltan variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ATLAS_EMAIL, ATLAS_PASSWORD"
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function fail(label: string, error: { message: string } | null) {
  if (error) {
    console.error(`Bootstrap falló en ${label}: ${error.message}`);
    process.exit(1);
  }
}

// Búsqueda determinística: recorre todas las páginas del admin API
// (listUsers no filtra por email; una sola página no basta a escala).
async function findUserIdByEmail(target: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === target.toLowerCase()
    );
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
}

async function main() {
  // 1. Usuario (idempotente)
  let userId: string;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    if (!createErr.message.includes("already been registered")) throw createErr;
    const existingId = await findUserIdByEmail(email!);
    if (!existingId) throw new Error("Usuario no encontrado tras conflicto");
    userId = existingId;
    console.log(`Usuario ya existía: ${email}`);
  } else {
    userId = created.user.id;
    console.log(`Usuario creado: ${email}`);
  }

  // 2. Perfil
  fail(
    "profiles",
    (
      await admin.from("profiles").upsert({
        id: userId,
        full_name: email!.split("@")[0],
        email,
      })
    ).error
  );

  // 3. Organización (por nombre, idempotente)
  const { data: existingOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("name", orgName)
    .maybeSingle();
  let orgId: string;
  if (existingOrg) {
    orgId = existingOrg.id;
    console.log(`Organización ya existía: ${orgName}`);
  } else {
    const { data: org, error } = await admin
      .from("organizations")
      .insert({ name: orgName })
      .select("id")
      .single();
    fail("organizations", error);
    orgId = org!.id;
    console.log(`Organización creada: ${orgName}`);
  }

  // 4. Membresía admin
  fail(
    "organization_memberships",
    (
      await admin
        .from("organization_memberships")
        .upsert(
          { org_id: orgId, profile_id: userId, is_admin: true },
          { onConflict: "org_id,profile_id" }
        )
    ).error
  );

  console.log("\n✓ Bootstrap listo.");
  console.log(`  Entra con ${email} y crea tu primer deal desde la app.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
