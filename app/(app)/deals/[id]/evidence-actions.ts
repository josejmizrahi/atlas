"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type EvidenceKind = Database["public"]["Enums"]["evidence_kind"];

function backWithError(dealId: string, message: string): never {
  redirect(`/deals/${dealId}?error=${encodeURIComponent(message)}`);
}

function detectKind(filename: string | null, isText: boolean, text: string): EvidenceKind {
  if (isText) {
    // Un correo pegado suele conservar encabezados
    return /^(from|de|para|to|subject|asunto):/im.test(text) ? "email" : "note";
  }
  const ext = filename?.toLowerCase().split(".").pop() ?? "";
  if (ext === "eml" || ext === "msg") return "email";
  return "file";
}

// Carga manual de evidencia: archivo o texto pegado (correo exportado, nota).
// Dedupe por content_hash dentro del deal. El análisis lo hace el scribe.
export async function uploadEvidence(formData: FormData) {
  const supabase = await createClient();

  const dealId = String(formData.get("deal_id") ?? "");
  const file = formData.get("file") as File | null;
  const text = String(formData.get("text") ?? "").trim();
  const capturedAt = String(formData.get("captured_at") ?? "");

  const hasFile = file && file.size > 0;
  if (!hasFile && !text) {
    backWithError(dealId, "Adjunta un archivo o pega el contenido");
  }

  const bytes = hasFile
    ? Buffer.from(await file.arrayBuffer())
    : Buffer.from(text, "utf-8");
  const contentHash = createHash("sha256").update(bytes).digest("hex");

  // Dedupe: la misma evidencia no entra dos veces al mismo deal
  const { data: dup } = await supabase
    .from("evidence_items")
    .select("id")
    .eq("deal_id", dealId)
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (dup) {
    backWithError(dealId, "Esa evidencia ya está registrada en el deal (mismo contenido)");
  }

  const filename = hasFile ? file.name : `nota-${Date.now()}.txt`;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${dealId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("evidence")
    .upload(storagePath, bytes, {
      contentType: hasFile ? file.type || "application/octet-stream" : "text/plain",
      upsert: false,
    });
  if (upErr) {
    backWithError(dealId, `No se pudo subir la evidencia: ${upErr.message}`);
  }

  const kind = detectKind(hasFile ? file.name : null, !hasFile, text);

  const { error: insErr } = await supabase.from("evidence_items").insert({
    deal_id: dealId,
    kind,
    storage_path: storagePath,
    content_hash: contentHash,
    captured_at: capturedAt ? new Date(capturedAt).toISOString() : new Date().toISOString(),
    metadata: {
      filename,
      size_bytes: bytes.length,
      mime: hasFile ? file.type : "text/plain",
      scribe_status: "pending",
    },
  });
  if (insErr) {
    backWithError(dealId, `Evidencia subida pero no registrada: ${insErr.message}`);
  }

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

// Dispara el scribe para una evidencia (Edge Function 'scribe').
// Corre con el token del usuario: la función valida y usa service key internamente.
export async function runScribe(formData: FormData) {
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id") ?? "");
  const evidenceId = String(formData.get("evidence_id") ?? "");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) backWithError(dealId, "Sesión inválida");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  try {
    const res = await fetch(`${base}/functions/v1/scribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ evidence_id: evidenceId }),
    });
    if (!res.ok) {
      const body = await res.text();
      backWithError(dealId, `Scribe respondió ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch {
    backWithError(
      dealId,
      "Scribe no disponible (¿Edge Function desplegada y ANTHROPIC_API_KEY configurada?)"
    );
  }

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}
