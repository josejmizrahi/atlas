"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type EventKind = Database["public"]["Enums"]["event_kind"];
type ActorKind = Database["public"]["Enums"]["actor_kind"];

function backWithError(dealId: string, message: string): never {
  redirect(`/deals/${dealId}?error=${encodeURIComponent(message)}`);
}

// Alta rápida de evento (< 30 s): qué ocurrió, quién, cuándo, evidencia.
// Origen siempre 'manual'; lo demás lo inferirá el scribe (Fase 3).
export async function createEvent(formData: FormData) {
  const supabase = await createClient();

  const dealId = String(formData.get("deal_id") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  const kind = String(formData.get("kind") ?? "other") as EventKind;
  const occurredAt = String(formData.get("occurred_at") ?? "");
  const actorId = String(formData.get("actor_id") ?? "");
  const evidence = String(formData.get("evidence") ?? "").trim();

  if (!summary) backWithError(dealId, "Describe qué ocurrió");
  if (!occurredAt) backWithError(dealId, "Indica cuándo ocurrió");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      deal_id: dealId,
      kind,
      occurred_at: new Date(occurredAt).toISOString(),
      summary,
      origin: "manual",
      recorded_by: user?.id,
    })
    .select("id")
    .single();

  if (error || !event) {
    backWithError(dealId, `No se pudo registrar el evento: ${error?.message}`);
  }

  if (actorId) {
    const { error: pErr } = await supabase.from("event_participants").insert({
      event_id: event.id,
      actor_id: actorId,
      role: "initiator",
    });
    if (pErr) backWithError(dealId, `Evento creado, pero falló el participante: ${pErr.message}`);
  }

  if (evidence) {
    const isLink = /^https?:\/\//i.test(evidence);
    const { data: ev, error: eErr } = await supabase
      .from("evidence_items")
      .insert({
        deal_id: dealId,
        kind: isLink ? "link" : "note",
        metadata: isLink ? { url: evidence } : { text: evidence },
        captured_at: new Date(occurredAt).toISOString(),
      })
      .select("id")
      .single();
    if (eErr || !ev) {
      backWithError(dealId, `Evento creado, pero falló la evidencia: ${eErr?.message}`);
    }
    const { error: lErr } = await supabase.from("evidence_links").insert({
      evidence_id: ev.id,
      linked_type: "event",
      linked_id: event.id,
    });
    if (lErr) backWithError(dealId, `Evidencia creada sin vincular: ${lErr.message}`);
  }

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

// Alta de solicitud + evento request_sent en la cronología.
export async function createRequest(formData: FormData) {
  const supabase = await createClient();

  const dealId = String(formData.get("deal_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const byActor = String(formData.get("requested_by_actor") ?? "");
  const fromActor = String(formData.get("requested_from_actor") ?? "");
  const requestedAt = String(formData.get("requested_at") ?? "");
  const dueAt = String(formData.get("due_at") ?? "");

  if (!title) backWithError(dealId, "La solicitud necesita título");
  if (!byActor || !fromActor) backWithError(dealId, "Indica quién pide y a quién");
  if (byActor === fromActor) backWithError(dealId, "Solicitante y solicitado no pueden ser el mismo actor");
  if (!requestedAt) backWithError(dealId, "Indica cuándo se pidió");

  const requestedIso = new Date(requestedAt).toISOString();

  const { error } = await supabase.from("requests").insert({
    deal_id: dealId,
    title,
    requested_by_actor: byActor,
    requested_from_actor: fromActor,
    requested_at: requestedIso,
    due_at: dueAt ? new Date(dueAt).toISOString() : null,
    origin: "manual",
  });

  if (error) backWithError(dealId, `No se pudo crear la solicitud: ${error.message}`);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // La solicitud también es un hecho de la cronología.
  const { data: event, error: evErr } = await supabase
    .from("events")
    .insert({
      deal_id: dealId,
      kind: "request_sent",
      occurred_at: requestedIso,
      summary: `Solicitud enviada: ${title}`,
      origin: "manual",
      recorded_by: user?.id,
    })
    .select("id")
    .single();

  if (!evErr && event) {
    await supabase.from("event_participants").insert([
      { event_id: event.id, actor_id: byActor, role: "initiator" },
      { event_id: event.id, actor_id: fromActor, role: "receiver" },
    ]);
  }

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}

// Incorporar un actor: alta en el registro de la org + rol de negocio en el deal.
export async function addActor(formData: FormData) {
  const supabase = await createClient();

  const dealId = String(formData.get("deal_id") ?? "");
  const orgId = String(formData.get("org_id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "person") as ActorKind;
  const role = String(formData.get("role") ?? "").trim();
  const represents = String(formData.get("represents") ?? "").trim();
  const existingActorId = String(formData.get("existing_actor_id") ?? "");

  if (!role) backWithError(dealId, "Indica el rol de negocio del actor");

  let actorId = existingActorId;

  if (!actorId) {
    if (!displayName) backWithError(dealId, "El actor necesita nombre");
    const { data: actor, error } = await supabase
      .from("actors")
      .insert({ org_id: orgId, kind, display_name: displayName })
      .select("id")
      .single();
    if (error || !actor) {
      backWithError(dealId, `No se pudo crear el actor: ${error?.message}`);
    }
    actorId = actor.id;
  }

  const { error: linkErr } = await supabase.from("deal_actors").insert({
    deal_id: dealId,
    actor_id: actorId,
    role,
    represents: represents || null,
  });

  if (linkErr) {
    backWithError(dealId, `No se pudo vincular al deal: ${linkErr.message}`);
  }

  revalidatePath(`/deals/${dealId}`);
  redirect(`/deals/${dealId}`);
}
