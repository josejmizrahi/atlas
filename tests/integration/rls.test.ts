/**
 * RLS contra la base local (supabase start), operando como lo haría el
 * frontend: cliente anon + sesión de usuario. Verifica:
 *   - tenancy hermético por deal_memberships
 *   - techo de sensibilidad por fila (max_sensitivity)
 *   - roles de escritura (viewer no escribe)
 *   - inmutabilidad de events
 */
import { beforeAll, describe, expect, it } from "vitest";
import { admin, seedScenario, signIn, TEST } from "./helpers";

beforeAll(async () => {
  await seedScenario();
});

describe("Tenancy por deal", () => {
  it("un miembro ve su deal", async () => {
    const owner = await signIn("owner");
    const { data, error } = await owner
      .from("deals")
      .select("id, codename")
      .eq("id", TEST.DEAL_ID);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].codename).toBe("PROYECTO-TEST");
  });

  it("un no-miembro no ve el deal ni sus eventos", async () => {
    const outsider = await signIn("outsider");
    const { data: deals } = await outsider
      .from("deals")
      .select("id")
      .eq("id", TEST.DEAL_ID);
    expect(deals).toHaveLength(0);

    const { data: events } = await outsider
      .from("events")
      .select("id")
      .eq("deal_id", TEST.DEAL_ID);
    expect(events).toHaveLength(0);
  });
});

describe("Techo de sensibilidad", () => {
  it("el viewer (standard) ve el deal y eventos, pero no la decisión restricted", async () => {
    const viewer = await signIn("viewer");

    const { data: deals } = await viewer
      .from("deals")
      .select("id")
      .eq("id", TEST.DEAL_ID);
    expect(deals).toHaveLength(1);

    const { data: events } = await viewer
      .from("events")
      .select("id")
      .eq("deal_id", TEST.DEAL_ID);
    expect(events!.length).toBeGreaterThanOrEqual(1);

    const { data: decisions } = await viewer
      .from("decisions")
      .select("id")
      .eq("deal_id", TEST.DEAL_ID);
    expect(decisions).toHaveLength(0);
  });

  it("el owner (restricted) sí ve la decisión restricted", async () => {
    const owner = await signIn("owner");
    const { data: decisions } = await owner
      .from("decisions")
      .select("id, title")
      .eq("deal_id", TEST.DEAL_ID);
    expect(decisions!.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Roles de escritura", () => {
  it("el viewer no puede insertar eventos", async () => {
    const viewer = await signIn("viewer");
    const { error } = await viewer.from("events").insert({
      deal_id: TEST.DEAL_ID,
      kind: "note_added",
      occurred_at: new Date().toISOString(),
      summary: "nota del viewer (no debe entrar)",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/row-level security/i);
  });

  it("el owner sí puede insertar eventos", async () => {
    const owner = await signIn("owner");
    const { error } = await owner.from("events").insert({
      deal_id: TEST.DEAL_ID,
      kind: "note_added",
      occurred_at: new Date().toISOString(),
      summary: "nota del owner (test de escritura)",
    });
    expect(error).toBeNull();
  });
});

describe("Inmutabilidad de events", () => {
  it("ni siquiera service_role puede editar o borrar un evento (trigger)", async () => {
    const upd = await admin
      .from("events")
      .update({ summary: "hackeado" })
      .eq("id", TEST.EVENT_ID);
    expect(upd.error).not.toBeNull();
    expect(upd.error!.message).toMatch(/inmutables/);

    const del = await admin.from("events").delete().eq("id", TEST.EVENT_ID);
    expect(del.error).not.toBeNull();
    expect(del.error!.message).toMatch(/inmutables/);
  });

  it("para un miembro, el UPDATE tampoco surte efecto (sin política de UPDATE)", async () => {
    const owner = await signIn("owner");
    await owner
      .from("events")
      .update({ summary: "editado por owner" })
      .eq("id", TEST.EVENT_ID);
    // Sin política de UPDATE, RLS filtra la fila: 0 afectadas, sin error.
    const { data } = await owner
      .from("events")
      .select("summary")
      .eq("id", TEST.EVENT_ID)
      .single();
    expect(data!.summary).not.toBe("editado por owner");
  });
});
