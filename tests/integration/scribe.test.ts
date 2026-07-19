/**
 * Pipeline del scribe con la llamada a Claude simulada: se toma una salida
 * estructurada como la que produce el modelo y se aplica con el MISMO código
 * que usa la Edge Function (core.ts) contra la base local. Verifica el
 * contrato de escritura completo: eventos inferred, assertions vía
 * assert_field, validation_tasks y vínculos de evidencia.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyScribeOutput,
  validateScribeOutput,
  SCRIBE_AGENT,
  type ScribeOutput,
} from "../../supabase/functions/scribe/core";
import { admin, seedScenario, signIn, TEST } from "./helpers";

let evidenceId: string;

const FAKE_OUTPUT: ScribeOutput = {
  events: [
    {
      kind: "email_received",
      occurred_at: "2026-07-15T14:30:00Z",
      summary: "Vendedor Test envió la balanza de comprobación parcial por correo",
      confidence: 0.9,
      participant_actor_ids: [], // se rellena en beforeAll con el vendedor
    },
    {
      kind: "call_held",
      occurred_at: "2026-07-16T09:00:00Z",
      summary: "Llamada para aclarar cifras de la balanza",
      confidence: 0.55, // baja → debe generar validation_task
      participant_actor_ids: [],
    },
  ],
  request_updates: [
    {
      request_id: "", // se rellena en beforeAll
      field_key: "wait_cause",
      value: "info_disordered",
      confidence: 0.7,
      note: "El correo indica que la información llegó incompleta y desordenada",
    },
  ],
  validation_questions: [
    { question: "¿Quién es el contador externo mencionado en el correo?", priority: 2 },
  ],
};

beforeAll(async () => {
  await seedScenario();
  FAKE_OUTPUT.events.forEach((e) => (e.participant_actor_ids = [TEST.VENDEDOR_ID]));
  FAKE_OUTPUT.request_updates[0].request_id = TEST.REQUEST_ID;

  // Evidencia de prueba registrada como lo haría la carga manual
  const { data, error } = await admin
    .from("evidence_items")
    .insert({
      deal_id: TEST.DEAL_ID,
      kind: "email",
      content_hash: `test-scribe-${Math.random().toString(36).slice(2)}`,
      captured_at: "2026-07-15T14:30:00Z",
      metadata: { filename: "correo-balanza.eml", scribe_status: "pending" },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`evidencia: ${error?.message}`);
  evidenceId = data.id;
});

describe("validateScribeOutput", () => {
  it("acepta salida bien formada y acota confidence a [0,1]", () => {
    const out = validateScribeOutput({
      events: [
        {
          kind: "note_added",
          occurred_at: "2026-07-01T00:00:00Z",
          summary: "x",
          confidence: 1.7,
          participant_actor_ids: [],
        },
      ],
      request_updates: [],
      validation_questions: [],
    });
    expect(out.events[0].confidence).toBe(1);
  });

  it("rechaza kind o fecha inválidos", () => {
    expect(() =>
      validateScribeOutput({
        events: [
          { kind: "hackeo", occurred_at: "2026-07-01", summary: "x", confidence: 1, participant_actor_ids: [] },
        ],
        request_updates: [],
        validation_questions: [],
      })
    ).toThrow(/kind inválido/);
    expect(() =>
      validateScribeOutput({
        events: [
          { kind: "note_added", occurred_at: "no-es-fecha", summary: "x", confidence: 1, participant_actor_ids: [] },
        ],
        request_updates: [],
        validation_questions: [],
      })
    ).toThrow(/occurred_at/);
  });
});

describe("applyScribeOutput contra la base local", () => {
  it("aplica eventos, assertions y validation_tasks respetando el contrato", async () => {
    const result = await applyScribeOutput(
      admin,
      TEST.DEAL_ID,
      evidenceId,
      FAKE_OUTPUT
    );

    expect(result.eventIds).toHaveLength(2);
    expect(result.assertionIds).toHaveLength(1);
    // 1 por evento de baja confianza + 1 por assertion + 1 pregunta abierta
    expect(result.validationTaskIds).toHaveLength(3);

    // Los eventos quedaron con origin inferred y confidence
    const { data: events } = await admin
      .from("events")
      .select("id, origin, confidence, summary")
      .in("id", result.eventIds);
    expect(events).toHaveLength(2);
    for (const e of events!) {
      expect(e.origin).toBe("inferred");
      expect(e.confidence).not.toBeNull();
    }

    // Vinculados a la evidencia
    const { data: links } = await admin
      .from("evidence_links")
      .select("linked_id")
      .eq("evidence_id", evidenceId)
      .eq("linked_type", "event");
    expect(links!.map((l) => l.linked_id).sort()).toEqual(result.eventIds.slice().sort());

    // La assertion es visible en v_current_state como inferred del agente
    const owner = await signIn("owner");
    const { data: state } = await owner
      .from("v_current_state")
      .select("value, status, confidence, asserted_by_agent")
      .eq("subject_id", TEST.REQUEST_ID)
      .eq("field_key", "wait_cause")
      .single();
    expect(state!.status).toBe("inferred");
    expect(state!.asserted_by_agent).toBe(SCRIBE_AGENT);
    expect(state!.value).toBe("info_disordered");

    // La cronología marca validaciones pendientes en el evento dudoso
    const { data: timeline } = await owner
      .from("v_deal_timeline")
      .select("id, origin, confidence, evidence_count")
      .in("id", result.eventIds);
    expect(timeline!.every((t) => t.origin === "inferred")).toBe(true);
    expect(timeline!.every((t) => (t.evidence_count ?? 0) >= 1)).toBe(true);
  });

  it("el ciclo de retro cierra: confirmar la assertion resuelve su tarea", async () => {
    const owner = await signIn("owner");

    const { data: task } = await owner
      .from("validation_tasks")
      .select("id, assertion_id, status")
      .eq("deal_id", TEST.DEAL_ID)
      .not("assertion_id", "is", null)
      .eq("status", "pending")
      .limit(1)
      .single();
    expect(task).toBeTruthy();

    const { error } = await owner.rpc("confirm_assertion", {
      p_assertion: task!.assertion_id!,
    });
    expect(error).toBeNull();

    // La assertion pasó a confirmed y la tarea quedó resuelta
    const { data: state } = await owner
      .from("v_current_state")
      .select("status")
      .eq("subject_id", TEST.REQUEST_ID)
      .eq("field_key", "wait_cause")
      .single();
    expect(state!.status).toBe("confirmed");

    const { data: resolved } = await owner
      .from("validation_tasks")
      .select("status, resolved_at")
      .eq("id", task!.id)
      .single();
    expect(resolved!.status).toBe("confirmed");
    expect(resolved!.resolved_at).not.toBeNull();
  });
});
