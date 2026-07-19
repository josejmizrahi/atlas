/**
 * Conecta una fuente de evidencia (gmail/gdrive) con Google OAuth y guarda
 * el refresh token en Vault vía store_source_secret (migración 0005).
 * Tooling de operador con service key — nunca corre en la app.
 *
 * Requisitos:
 *  - Credencial OAuth "Desktop app" en Google Cloud Console con los scopes
 *    gmail.readonly y drive.readonly habilitados en la pantalla de consent.
 *  - GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en el entorno.
 *  - NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY apuntando al
 *    proyecto destino (local por default vía .env.local; exporta las del
 *    proyecto remoto para conectar producción).
 *
 * Uso: npx tsx scripts/connect-google.ts --source <evidence_source_id>
 */
import { config } from "dotenv";
config({ path: ".env.local" }); // sin override: permite apuntar a remoto por env

import http from "node:http";
import { createClient } from "@supabase/supabase-js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const sourceId = arg("source");
  if (!sourceId) {
    console.error("Uso: npx tsx scripts/connect-google.ts --source <evidence_source_id>");
    process.exit(1);
  }
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el entorno");
    process.exit(1);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const { data: source, error: srcErr } = await admin
    .from("evidence_sources")
    .select("id, kind, label")
    .eq("id", sourceId)
    .single();
  if (srcErr || !source) {
    console.error(`Fuente ${sourceId} no encontrada: ${srcErr?.message}`);
    process.exit(1);
  }

  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
    }).toString();

  console.log(`\nConectando "${source.label}" (${source.kind})`);
  console.log("\n1. Abre esta URL en tu navegador y autoriza:\n");
  console.log(authUrl);
  console.log(`\n2. Esperando el callback en ${REDIRECT} …\n`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        c
          ? "<h3>Listo. Puedes cerrar esta pestaña y volver a la terminal.</h3>"
          : `<h3>Error: ${err}</h3>`
      );
      server.close();
      if (c) resolve(c);
      else reject(new Error(err ?? "sin código"));
    });
    server.listen(PORT);
  });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT,
    }),
  });
  const tokens = (await tokenRes.json()) as {
    refresh_token?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokens.refresh_token) {
    console.error(`Intercambio de código falló: ${tokens.error ?? tokenRes.status}`);
    process.exit(1);
  }

  const { error: storeErr } = await admin.rpc("store_source_secret", {
    p_source: sourceId,
    p_secret: tokens.refresh_token,
  });
  if (storeErr) {
    console.error(`No se pudo guardar en Vault: ${storeErr.message}`);
    process.exit(1);
  }

  console.log("✓ Refresh token guardado en Vault y fuente vinculada.");
  console.log("  Ya puedes sincronizar desde la pantalla de Fuentes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
