/**
 * Núcleo de ingesta contra la base local: dedupe por external_ref y por
 * content_hash, registro de ingestion_jobs con stats, y utilidades puras
 * de los conectores. Sin red: los "fetchers" se simulan con items ya
 * normalizados, exactamente lo que entrega Gmail/Drive tras normalizar.
 */
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  buildDriveQuery,
  ingestItems,
  subjectFromRfc822,
  type FetchedItem,
  type SourceRow,
} from "../../supabase/functions/ingest/core";
import { admin, seedScenario, TEST } from "./helpers";

const deps = {
  sha256: async (bytes: Uint8Array) =>
    createHash("sha256").update(bytes).digest("hex"),
  upload: async (path: string, bytes: Uint8Array, mime: string) => {
    const { error } = await admin.storage
      .from("evidence")
      .upload(path, Buffer.from(bytes), { contentType: mime });
    if (error) throw new Error(error.message);
  },
};

let source: SourceRow;

function item(ref: string, content: string, filename = `${ref}.eml`): FetchedItem {
  return {
    external_ref: ref,
    filename,
    mime: "message/rfc822",
    bytes: new TextEncoder().encode(content),
    captured_at: "2026-07-18T12:00:00Z",
    kind: "email",
  };
}

beforeAll(async () => {
  await seedScenario();
  await admin.from("evidence_sources").delete().eq("label", "Gmail test");
  const { data, error } = await admin
    .from("evidence_sources")
    .insert({
      org_id: TEST.ORG_ID,
      kind: "gmail",
      label: "Gmail test",
      config: { deal_id: TEST.DEAL_ID, query: "label:atlas-test" },
    })
    .select("id, org_id, kind, label, config")
    .single();
  if (error || !data) throw new Error(`fuente: ${error?.message}`);
  source = data as SourceRow;
});

describe("ingestItems", () => {
  it("inserta items nuevos y registra el job con stats", async () => {
    const salt = Math.random().toString(36).slice(2);
    const { jobId, stats, newEvidenceIds } = await ingestItems(
      admin,
      source,
      TEST.DEAL_ID,
      [
        item(`msg-a-${salt}`, `Subject: EEFF marzo ${salt}\n\ncuerpo A`),
        item(`msg-b-${salt}`, `Subject: contrato ${salt}\n\ncuerpo B`),
      ],
      deps
    );

    expect(stats).toMatchObject({ found: 2, inserted: 2, duplicates: 0, failed: 0 });
    expect(newEvidenceIds).toHaveLength(2);

    const { data: job } = await admin
      .from("ingestion_jobs")
      .select("status, stats, error, deal_id")
      .eq("id", jobId)
      .single();
    expect(job!.status).toBe("done");
    expect(job!.deal_id).toBe(TEST.DEAL_ID);
    expect((job!.stats as { inserted: number }).inserted).toBe(2);
    expect(job!.error).toBeNull();

    // Los items quedaron pendientes de análisis y con hash
    const { data: evidence } = await admin
      .from("evidence_items")
      .select("content_hash, external_ref, metadata, storage_path")
      .in("id", newEvidenceIds);
    for (const ev of evidence!) {
      expect(ev.content_hash).toMatch(/^[0-9a-f]{64}$/);
      expect((ev.metadata as { scribe_status: string }).scribe_status).toBe("pending");
      expect(ev.storage_path).toContain(TEST.DEAL_ID);
    }

    // Re-corrida idéntica: todo duplicado por external_ref, nada nuevo
    const rerun = await ingestItems(
      admin,
      source,
      TEST.DEAL_ID,
      [
        item(`msg-a-${salt}`, `Subject: EEFF marzo ${salt}\n\ncuerpo A`),
        item(`msg-b-${salt}`, `Subject: contrato ${salt}\n\ncuerpo B`),
      ],
      deps
    );
    expect(rerun.stats).toMatchObject({ found: 2, inserted: 0, duplicates: 2 });
    expect(rerun.newEvidenceIds).toHaveLength(0);
  });

  it("dedupe por contenido: mismo cuerpo con otro external_ref no entra", async () => {
    const salt = Math.random().toString(36).slice(2);
    const body = `Subject: reenviado ${salt}\n\nmismo contenido exacto`;

    const first = await ingestItems(admin, source, TEST.DEAL_ID, [item(`orig-${salt}`, body)], deps);
    expect(first.stats.inserted).toBe(1);

    const second = await ingestItems(
      admin,
      source,
      TEST.DEAL_ID,
      [item(`fwd-${salt}`, body, "reenviado.eml")],
      deps
    );
    expect(second.stats).toMatchObject({ inserted: 0, duplicates: 1 });
  });

  it("un item que falla no tumba la tanda y queda en el error del job", async () => {
    const salt = Math.random().toString(36).slice(2);
    const failingDeps = {
      ...deps,
      upload: async (path: string, bytes: Uint8Array, mime: string) => {
        if (path.includes("malo")) throw new Error("storage caído");
        return deps.upload(path, bytes, mime);
      },
    };
    const { jobId, stats } = await ingestItems(
      admin,
      source,
      TEST.DEAL_ID,
      [
        item(`ok-${salt}`, `Subject: ok ${salt}\n\nbien`),
        item(`malo-${salt}`, `Subject: malo ${salt}\n\nfalla`, "malo.eml"),
      ],
      failingDeps
    );
    expect(stats).toMatchObject({ inserted: 1, failed: 1 });

    const { data: job } = await admin
      .from("ingestion_jobs")
      .select("status, error")
      .eq("id", jobId)
      .single();
    expect(job!.status).toBe("done"); // parcial: hubo inserciones
    expect(job!.error).toContain("storage caído");
  });
});

describe("utilidades de conectores", () => {
  it("base64url → bytes (formato raw de Gmail)", () => {
    const raw = "Subject: Hola\n\nCuerpo del correo";
    const b64url = Buffer.from(raw).toString("base64url");
    expect(new TextDecoder().decode(base64UrlToBytes(b64url))).toBe(raw);
  });

  it("extrae el asunto de un RFC822", () => {
    expect(subjectFromRfc822("From: a@b.mx\nSubject: Balanza 2024\n\nhola")).toBe(
      "Balanza 2024"
    );
    expect(subjectFromRfc822("sin encabezados")).toBe("correo");
  });

  it("query de Drive escapa comillas", () => {
    expect(buildDriveQuery("abc'123")).toBe(
      "'abc\\'123' in parents and trashed = false"
    );
  });
});

describe("secretos de fuentes en Vault (migración 0005)", () => {
  it("service_role guarda y lee; authenticated no puede", async () => {
    const { error: storeErr } = await admin.rpc("store_source_secret", {
      p_source: source.id,
      p_secret: "refresh-token-de-prueba",
    });
    expect(storeErr).toBeNull();

    const { data: secret, error: readErr } = await admin.rpc("read_source_secret", {
      p_source: source.id,
    });
    expect(readErr).toBeNull();
    expect(secret).toBe("refresh-token-de-prueba");

    // El nombre del secreto quedó anotado en config (no el secreto)
    const { data: src } = await admin
      .from("evidence_sources")
      .select("config")
      .eq("id", source.id)
      .single();
    expect((src!.config as { vault_secret: string }).vault_secret).toBe(
      `evidence_source_${source.id}`
    );

    // Un usuario autenticado no puede ejecutar ninguna de las dos
    const { signIn } = await import("./helpers");
    const owner = await signIn("owner");
    const { error: denied } = await owner.rpc("read_source_secret", {
      p_source: source.id,
    });
    expect(denied).not.toBeNull();
    expect(denied!.message).toMatch(/permission|denied|not exist/i);
  });
});
