/**
 * Núcleo de la ingesta automática: normalización, deduplicación y registro.
 * Puro TypeScript (sin APIs de Deno ni de Google) para testearlo con Vitest
 * contra la base local. Los fetchers de Gmail/Drive viven en index.ts y
 * entregan items ya normalizados a este módulo.
 *
 * Dedupe (doble llave, por deal):
 *  - external_ref (message-id de Gmail, file-id de Drive): el mismo objeto
 *    remoto no entra dos veces aunque cambie su contenido.
 *  - content_hash (sha-256): el mismo contenido no entra dos veces aunque
 *    llegue por otra vía (reenvío, copia en Drive, carga manual previa).
 */

export interface FetchedItem {
  external_ref: string;
  filename: string;
  mime: string;
  bytes: Uint8Array;
  captured_at: string | null;
  kind: "email" | "file";
}

export interface IngestStats {
  found: number;
  inserted: number;
  duplicates: number;
  failed: number;
  errors: string[];
}

/** Subconjunto del cliente Supabase usado por el núcleo. */
export interface DbClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface IngestDeps {
  /** sha-256 en hex (inyectado: Web Crypto en Deno, node:crypto en tests) */
  sha256: (bytes: Uint8Array) => Promise<string>;
  /** sube bytes al bucket de evidencia y regresa el storage_path */
  upload: (path: string, bytes: Uint8Array, mime: string) => Promise<void>;
  now?: () => Date;
}

export interface SourceRow {
  id: string;
  org_id: string;
  kind: string;
  label: string;
  config: Record<string, unknown>;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/**
 * Ingesta una tanda de items para una fuente, con job de auditoría.
 * Los items nuevos quedan con metadata.scribe_status='pending'.
 */
export async function ingestItems(
  db: DbClient,
  source: SourceRow,
  dealId: string,
  items: FetchedItem[],
  deps: IngestDeps
): Promise<{ jobId: string; stats: IngestStats; newEvidenceIds: string[] }> {
  const now = deps.now ?? (() => new Date());

  const { data: job, error: jobErr } = await db
    .from("ingestion_jobs")
    .insert({
      source_id: source.id,
      deal_id: dealId,
      status: "processing",
      started_at: now().toISOString(),
    })
    .select("id")
    .single();
  if (jobErr || !job) {
    throw new Error(`No se pudo crear el ingestion_job: ${jobErr?.message}`);
  }

  const stats: IngestStats = {
    found: items.length,
    inserted: 0,
    duplicates: 0,
    failed: 0,
    errors: [],
  };
  const newEvidenceIds: string[] = [];

  // Llaves ya presentes en el deal (una sola consulta por tanda)
  const refs = items.map((i) => i.external_ref);
  const { data: existing, error: exErr } = await db
    .from("evidence_items")
    .select("external_ref, content_hash")
    .eq("deal_id", dealId);
  if (exErr) throw new Error(`No se pudo consultar duplicados: ${exErr.message}`);

  const seenRefs = new Set(
    (existing ?? [])
      .map((e: { external_ref: string | null }) => e.external_ref)
      .filter(Boolean)
  );
  const seenHashes = new Set(
    (existing ?? [])
      .map((e: { content_hash: string | null }) => e.content_hash)
      .filter(Boolean)
  );
  void refs;

  for (const item of items) {
    try {
      if (seenRefs.has(item.external_ref)) {
        stats.duplicates++;
        continue;
      }
      const hash = await deps.sha256(item.bytes);
      if (seenHashes.has(hash)) {
        stats.duplicates++;
        continue;
      }

      const storagePath = `${dealId}/${Date.now()}-${safeName(item.filename)}`;
      await deps.upload(storagePath, item.bytes, item.mime);

      const { data: inserted, error } = await db
        .from("evidence_items")
        .insert({
          deal_id: dealId,
          source_id: source.id,
          kind: item.kind,
          external_ref: item.external_ref,
          storage_path: storagePath,
          content_hash: hash,
          captured_at: item.captured_at,
          metadata: {
            filename: item.filename,
            mime: item.mime,
            size_bytes: item.bytes.length,
            scribe_status: "pending",
            ingested_by: `ingest-${source.kind}`,
          },
        })
        .select("id")
        .single();
      if (error || !inserted) {
        throw new Error(error?.message ?? "insert falló");
      }

      seenRefs.add(item.external_ref);
      seenHashes.add(hash);
      newEvidenceIds.push(inserted.id);
      stats.inserted++;
    } catch (e) {
      stats.failed++;
      stats.errors.push(
        `${item.external_ref}: ${(e as Error).message}`.slice(0, 300)
      );
    }
  }

  const status = stats.failed > 0 && stats.inserted === 0 ? "failed" : "done";
  await db
    .from("ingestion_jobs")
    .update({
      status,
      finished_at: now().toISOString(),
      stats: {
        found: stats.found,
        inserted: stats.inserted,
        duplicates: stats.duplicates,
        failed: stats.failed,
      },
      error: stats.errors.length > 0 ? stats.errors.join(" | ").slice(0, 1000) : null,
    })
    .eq("id", job.id);

  return { jobId: job.id, stats, newEvidenceIds };
}

// ---------------------------------------------------------------------------
// Utilidades puras de los conectores (testeables sin red)
// ---------------------------------------------------------------------------

/** base64url → bytes (Gmail entrega el RFC822 en base64url) */
export function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Asunto de un RFC822 crudo, para nombrar el archivo .eml */
export function subjectFromRfc822(raw: string): string {
  const match = raw.match(/^Subject:\s*(.+)$/im);
  return match ? match[1].trim().slice(0, 80) : "correo";
}

/** Query de Drive para listar archivos vigentes de una carpeta */
export function buildDriveQuery(folderId: string): string {
  return `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`;
}

/** Mapa de export para archivos nativos de Google (docs → texto plano) */
export const GOOGLE_EXPORTS: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "text/plain", ext: ".txt" },
  "application/vnd.google-apps.spreadsheet": { mime: "text/csv", ext: ".csv" },
  "application/vnd.google-apps.presentation": { mime: "text/plain", ext: ".txt" },
};
