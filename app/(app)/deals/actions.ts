"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Crea el deal + membresía owner atómicamente (RPC create_deal, migración 0003).
export async function createDeal(formData: FormData) {
  const supabase = await createClient();

  const org = String(formData.get("org_id") ?? "");
  const codename = String(formData.get("codename") ?? "").trim();
  const templateVersion = String(formData.get("template_version_id") ?? "");
  const stage = String(formData.get("stage_key") ?? "") || null;

  if (!codename) {
    redirect("/deals/new?error=" + encodeURIComponent("El codename es obligatorio"));
  }

  const { data: dealId, error } = await supabase.rpc("create_deal", {
    p_org: org,
    p_codename: codename,
    p_template_version: templateVersion,
    p_stage: stage ?? undefined,
  });

  if (error) {
    const msg = error.message.includes("duplicate")
      ? "Ya existe un deal con ese codename en la organización"
      : error.message;
    redirect("/deals/new?error=" + encodeURIComponent(msg));
  }

  revalidatePath("/deals");
  redirect(`/deals/${dealId}`);
}
