"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function back(error?: string): never {
  redirect(`/sources${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

// Alta de fuente: la configuración NO sensible va en config; la credencial
// de Google se conecta después con scripts/connect-google.ts (Vault).
export async function createSource(formData: FormData) {
  const supabase = await createClient();

  const orgId = String(formData.get("org_id") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const dealId = String(formData.get("deal_id") ?? "");
  const query = String(formData.get("query") ?? "").trim();
  const folderId = String(formData.get("folder_id") ?? "").trim();

  if (!label) back("La fuente necesita nombre");
  if (kind !== "gmail" && kind !== "gdrive") back("Kind inválido");
  if (!dealId) back("Elige el deal destino");
  if (kind === "gmail" && !query) back("La fuente Gmail necesita un query (ej. label:atlas)");
  if (kind === "gdrive" && !folderId) back("La fuente Drive necesita el ID de la carpeta");

  const config: Record<string, string> = { deal_id: dealId };
  if (kind === "gmail") config.query = query;
  if (kind === "gdrive") config.folder_id = folderId;

  const { error } = await supabase.from("evidence_sources").insert({
    org_id: orgId,
    kind,
    label,
    config,
  });
  if (error) back(`No se pudo crear la fuente: ${error.message}`);

  revalidatePath("/sources");
  redirect("/sources");
}

// Dispara la ingesta de una fuente (Edge Function 'ingest').
export async function syncSource(formData: FormData) {
  const supabase = await createClient();
  const sourceId = String(formData.get("source_id") ?? "");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) back("Sesión inválida");

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ingest`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ source_id: sourceId }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      back(`Ingesta respondió ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch {
    back("Función de ingesta no disponible (¿desplegada y con secrets de Google?)");
  }

  revalidatePath("/sources");
  redirect("/sources");
}

export async function toggleSource(formData: FormData) {
  const supabase = await createClient();
  const sourceId = String(formData.get("source_id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";

  const { error } = await supabase
    .from("evidence_sources")
    .update({ is_active: active })
    .eq("id", sourceId);
  if (error) back(`No se pudo actualizar: ${error.message}`);

  revalidatePath("/sources");
  redirect("/sources");
}
