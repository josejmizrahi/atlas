// Edge Function de ingesta automática (Gmail / Google Drive). Deno runtime.
// POST { source_id } con Authorization: Bearer <jwt de usuario>.
// El JWT prueba membresía de la org bajo RLS; el trabajo corre con service
// key. Secretos: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en secrets de la
// función; el refresh token por fuente vive en Vault (migración 0005).
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  base64UrlToBytes,
  buildDriveQuery,
  GOOGLE_EXPORTS,
  ingestItems,
  subjectFromRfc822,
  type FetchedItem,
  type SourceRow,
} from "./core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

const MAX_ITEMS = 25;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth de Google falló: ${data.error ?? res.status}`);
  }
  return data.access_token as string;
}

async function gapi(token: string, url: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new Error(`Google API ${res.status} en ${new URL(url).pathname}`);
  }
  return res;
}

async function fetchGmail(token: string, query: string): Promise<FetchedItem[]> {
  const list = await (
    await gapi(
      token,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${MAX_ITEMS}`
    )
  ).json();
  const ids: string[] = (list.messages ?? []).map((m: { id: string }) => m.id);

  const items: FetchedItem[] = [];
  for (const id of ids) {
    const msg = await (
      await gapi(
        token,
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=raw`
      )
    ).json();
    const bytes = base64UrlToBytes(String(msg.raw ?? ""));
    const rawText = new TextDecoder().decode(bytes.slice(0, 4096));
    items.push({
      external_ref: `gmail:${id}`,
      filename: `${subjectFromRfc822(rawText).replace(/[^\wáéíóúñÁÉÍÓÚÑ .-]/g, "_") || "correo"}.eml`,
      mime: "message/rfc822",
      bytes,
      captured_at: msg.internalDate
        ? new Date(Number(msg.internalDate)).toISOString()
        : null,
      kind: "email",
    });
  }
  return items;
}

async function fetchDrive(token: string, folderId: string): Promise<FetchedItem[]> {
  const q = encodeURIComponent(buildDriveQuery(folderId));
  const list = await (
    await gapi(
      token,
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime)&pageSize=${MAX_ITEMS}`
    )
  ).json();

  const items: FetchedItem[] = [];
  for (const f of list.files ?? []) {
    const exportCfg = GOOGLE_EXPORTS[f.mimeType as string];
    let bytes: Uint8Array;
    let mime: string;
    let filename: string = f.name;
    if (exportCfg) {
      const res = await gapi(
        token,
        `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=${encodeURIComponent(exportCfg.mime)}`
      );
      bytes = new Uint8Array(await res.arrayBuffer());
      mime = exportCfg.mime;
      filename = `${f.name}${exportCfg.ext}`;
    } else {
      const res = await gapi(
        token,
        `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`
      );
      bytes = new Uint8Array(await res.arrayBuffer());
      mime = f.mimeType ?? "application/octet-stream";
    }
    items.push({
      external_ref: `gdrive:${f.id}`,
      filename,
      mime,
      bytes,
      captured_at: f.modifiedTime ?? null,
      kind: "file",
    });
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST requerido" });
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return json(500, {
      error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET no configurados en secrets",
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Falta Authorization" });

  let sourceId: string;
  try {
    const body = await req.json();
    sourceId = String(body.source_id ?? "");
    if (!sourceId) throw new Error("source_id requerido");
  } catch (e) {
    return json(400, { error: `Body inválido: ${(e as Error).message}` });
  }

  // Membresía de la org bajo RLS con la sesión del llamante
  const userDb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: visible } = await userDb
    .from("evidence_sources")
    .select("id")
    .eq("id", sourceId)
    .maybeSingle();
  if (!visible) return json(404, { error: "Fuente inexistente o sin acceso" });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const { data: source, error: srcErr } = await db
      .from("evidence_sources")
      .select("id, org_id, kind, label, config, is_active")
      .eq("id", sourceId)
      .single();
    if (srcErr || !source) throw new Error("Fuente no encontrada");
    if (!source.is_active) throw new Error("La fuente está desactivada");

    const config = (source.config ?? {}) as Record<string, unknown>;
    const dealId = String(config.deal_id ?? "");
    if (!dealId) throw new Error("La fuente no tiene deal_id en config");

    const { data: refreshToken, error: secErr } = await db.rpc(
      "read_source_secret",
      { p_source: source.id }
    );
    if (secErr || !refreshToken) {
      throw new Error(
        "La fuente no tiene credencial de Google conectada (scripts/connect-google.ts)"
      );
    }

    const token = await refreshAccessToken(String(refreshToken));

    let items: FetchedItem[];
    if (source.kind === "gmail") {
      const query = String(config.query ?? "");
      if (!query) throw new Error("La fuente Gmail no tiene query en config");
      items = await fetchGmail(token, query);
    } else if (source.kind === "gdrive") {
      const folderId = String(config.folder_id ?? "");
      if (!folderId) throw new Error("La fuente Drive no tiene folder_id en config");
      items = await fetchDrive(token, folderId);
    } else {
      throw new Error(`Kind de fuente no soportado: ${source.kind}`);
    }

    const { jobId, stats, newEvidenceIds } = await ingestItems(
      db,
      source as SourceRow,
      dealId,
      items,
      {
        sha256: sha256Hex,
        upload: async (path, bytes, mime) => {
          const { error } = await db.storage
            .from("evidence")
            .upload(path, bytes as BufferSource as ArrayBuffer, { contentType: mime });
          if (error) throw new Error(error.message);
        },
      }
    );

    // Encola el scribe por cada evidencia nueva (mejor esfuerzo; si no hay
    // ANTHROPIC_API_KEY el item queda 'pending' y se analiza después).
    let analyzed = 0;
    for (const evidenceId of newEvidenceIds) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/scribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
          body: JSON.stringify({ evidence_id: evidenceId }),
        });
        if (res.ok) analyzed++;
      } catch {
        // el estado queda en metadata.scribe_status
      }
    }

    return json(200, { ok: true, job_id: jobId, stats, analyzed });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
