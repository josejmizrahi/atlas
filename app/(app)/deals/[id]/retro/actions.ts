"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function back(dealId: string, error?: string): never {
  redirect(
    `/deals/${dealId}/retro${error ? `?error=${encodeURIComponent(error)}` : ""}`
  );
}

// Confirmar: si la tarea valida una assertion, confirm_assertion la confirma
// y resuelve la tarea; si es pregunta abierta, solo se resuelve la tarea.
export async function confirmTask(formData: FormData) {
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");

  const { data: task } = await supabase
    .from("validation_tasks")
    .select("id, assertion_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) back(dealId, "Tarea inexistente o sin acceso");

  if (task.assertion_id) {
    const { error } = await supabase.rpc("confirm_assertion", {
      p_assertion: task.assertion_id,
    });
    if (error) back(dealId, `No se pudo confirmar: ${error.message}`);
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("validation_tasks")
      .update({
        status: "confirmed",
        resolved_by: user?.id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (error) back(dealId, `No se pudo resolver: ${error.message}`);
  }

  revalidatePath(`/deals/${dealId}/retro`);
  redirect(`/deals/${dealId}/retro`);
}

// Corregir: nueva assertion observed (supersede automático) + tarea corrected.
// La inferencia original queda en el historial como superseded, nunca se borra.
export async function correctTask(formData: FormData) {
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");
  const correction = String(formData.get("correction") ?? "").trim();

  if (!correction) back(dealId, "Escribe la corrección");

  const { data: task } = await supabase
    .from("validation_tasks")
    .select("id, assertion_id, field_assertions(deal_id, subject_type, subject_id, field_key)")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) back(dealId, "Tarea inexistente o sin acceso");

  const assertion = task.field_assertions as unknown as {
    deal_id: string;
    subject_type: string;
    subject_id: string;
    field_key: string;
  } | null;

  if (assertion) {
    const { error } = await supabase.rpc("assert_field", {
      p_deal: assertion.deal_id,
      p_subject_type: assertion.subject_type,
      p_subject_id: assertion.subject_id,
      p_field_key: assertion.field_key,
      p_value: correction,
      p_status: "observed",
      p_note: "Corregido en retrospectiva semanal",
    });
    if (error) back(dealId, `No se pudo corregir: ${error.message}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error: tErr } = await supabase
    .from("validation_tasks")
    .update({
      status: "corrected",
      resolution: correction,
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (tErr) back(dealId, `Corrección registrada pero la tarea no se cerró: ${tErr.message}`);

  revalidatePath(`/deals/${dealId}/retro`);
  redirect(`/deals/${dealId}/retro`);
}

// Rechazar: la tarea se marca rejected y la assertion (si hay) queda disputed.
export async function rejectTask(formData: FormData) {
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id") ?? "");
  const taskId = String(formData.get("task_id") ?? "");

  const { data: task } = await supabase
    .from("validation_tasks")
    .select("id, assertion_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) back(dealId, "Tarea inexistente o sin acceso");

  if (task.assertion_id) {
    const { error } = await supabase
      .from("field_assertions")
      .update({ status: "disputed" })
      .eq("id", task.assertion_id);
    if (error) back(dealId, `No se pudo disputar la assertion: ${error.message}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("validation_tasks")
    .update({
      status: "rejected",
      resolved_by: user?.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", taskId);
  if (error) back(dealId, `No se pudo rechazar: ${error.message}`);

  revalidatePath(`/deals/${dealId}/retro`);
  redirect(`/deals/${dealId}/retro`);
}
