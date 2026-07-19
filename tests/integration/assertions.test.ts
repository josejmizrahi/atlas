/**
 * Ciclo de assertions vía RPC, como lo usará la app y el scribe:
 *   assert_field (inferred por IA) → corrección humana (observed, supersede
 *   automático) → confirm_assertion → v_current_state refleja lo confirmado.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { seedScenario, signIn, TEST } from "./helpers";

beforeAll(async () => {
  await seedScenario();
});

describe("assert_field + confirm_assertion + v_current_state", () => {
  it("recorre el ciclo inferred → observed → confirmed con supersede", async () => {
    const owner = await signIn("owner");

    // 1. La IA infiere la causa de espera de la solicitud
    const inferred = await owner.rpc("assert_field", {
      p_deal: TEST.DEAL_ID,
      p_subject_type: "request",
      p_subject_id: TEST.REQUEST_ID,
      p_field_key: "wait_cause",
      p_value: "info_disordered",
      p_status: "inferred",
      p_confidence: 0.72,
      p_agent: "claude-scribe-v1",
      p_note: "Inferido del hilo de correos (test)",
    });
    expect(inferred.error).toBeNull();
    const inferredId = inferred.data as string;

    // 2. El humano corrige: nueva assertion observed (supersede automático)
    const corrected = await owner.rpc("assert_field", {
      p_deal: TEST.DEAL_ID,
      p_subject_type: "request",
      p_subject_id: TEST.REQUEST_ID,
      p_field_key: "wait_cause",
      p_value: "info_unavailable",
      p_status: "observed",
      p_note: "El vendedor confirmó que el archivo no existe (test)",
    });
    expect(corrected.error).toBeNull();
    const correctedId = corrected.data as string;
    expect(correctedId).not.toBe(inferredId);

    // 3. Confirmación humana
    const confirmed = await owner.rpc("confirm_assertion", {
      p_assertion: correctedId,
    });
    expect(confirmed.error).toBeNull();

    // 4. v_current_state: gana la confirmada, no la inferencia
    const { data: state, error: stateErr } = await owner
      .from("v_current_state")
      .select("field_key, value, status, confidence")
      .eq("subject_id", TEST.REQUEST_ID)
      .eq("field_key", "wait_cause");
    expect(stateErr).toBeNull();
    expect(state).toHaveLength(1);
    expect(state![0].value).toBe("info_unavailable");
    expect(state![0].status).toBe("confirmed");

    // 5. Historial: la inferencia quedó superseded, nunca borrada
    const { data: history } = await owner
      .from("field_assertions")
      .select("id, status, asserted_by_agent")
      .eq("subject_id", TEST.REQUEST_ID)
      .eq("field_key", "wait_cause")
      .order("created_at");
    const first = history!.find((h) => h.id === inferredId);
    expect(first!.status).toBe("superseded");
    expect(first!.asserted_by_agent).toBe("claude-scribe-v1");
  });

  it("un no-miembro no puede asertar sobre el deal", async () => {
    const outsider = await signIn("outsider");
    const { error } = await outsider.rpc("assert_field", {
      p_deal: TEST.DEAL_ID,
      p_subject_type: "request",
      p_subject_id: TEST.REQUEST_ID,
      p_field_key: "wait_cause",
      p_value: "negotiation",
      p_status: "observed",
    });
    expect(error).not.toBeNull();
  });

  it("las vistas operativas responden para un miembro", async () => {
    const owner = await signIn("owner");

    const { data: reqs, error: reqErr } = await owner
      .from("v_open_requests")
      .select("title, requested_from, days_waiting")
      .eq("deal_id", TEST.DEAL_ID);
    expect(reqErr).toBeNull();
    expect(reqs!.length).toBeGreaterThanOrEqual(1);
    expect(reqs![0].days_waiting).toBeGreaterThanOrEqual(5);

    const { data: metrics, error: metErr } = await owner
      .from("v_deal_metrics")
      .select("codename, event_count, open_requests")
      .eq("deal_id", TEST.DEAL_ID)
      .single();
    expect(metErr).toBeNull();
    expect(metrics!.codename).toBe("PROYECTO-TEST");
    expect(metrics!.open_requests).toBeGreaterThanOrEqual(1);
  });
});
