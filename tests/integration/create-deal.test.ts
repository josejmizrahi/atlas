/**
 * create_deal (migración 0003): creación atómica deal + membresía owner.
 * Sin esta función, las políticas de 0001 impiden que el creador
 * se convierta en primer miembro de su propio deal.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { admin, seedScenario, signIn, TEST } from "./helpers";

const CODENAME = "PROYECTO-CREATE-TEST";

beforeAll(async () => {
  await seedScenario();
  // Limpieza de corridas anteriores (cascade borra membresías/eventos)
  await admin.from("deals").delete().eq("codename", CODENAME);
});

describe("create_deal", () => {
  it("un miembro de la org crea el deal y queda como owner", async () => {
    const owner = await signIn("owner");

    const { data: dealId, error } = await owner.rpc("create_deal", {
      p_org: TEST.ORG_ID,
      p_codename: CODENAME,
      p_template_version: TEST.TEMPLATE_VERSION_ID,
      p_stage: "originacion",
    });
    expect(error).toBeNull();
    expect(dealId).toBeTruthy();

    // El deal es visible para su creador bajo RLS…
    const { data: deal } = await owner
      .from("deals")
      .select("codename, current_stage_key")
      .eq("id", dealId!)
      .single();
    expect(deal!.codename).toBe(CODENAME);
    expect(deal!.current_stage_key).toBe("originacion");

    // …porque quedó como owner con techo restricted
    const { data: membership } = await owner
      .from("deal_memberships")
      .select("role, max_sensitivity")
      .eq("deal_id", dealId!)
      .single();
    expect(membership!.role).toBe("owner");
    expect(membership!.max_sensitivity).toBe("restricted");
  });

  it("rechaza codename duplicado en la misma org", async () => {
    const owner = await signIn("owner");
    const { error } = await owner.rpc("create_deal", {
      p_org: TEST.ORG_ID,
      p_codename: CODENAME,
      p_template_version: TEST.TEMPLATE_VERSION_ID,
    });
    expect(error).not.toBeNull();
  });

  it("rechaza a quien no es miembro de la organización", async () => {
    const outsider = await signIn("outsider");
    const { error } = await outsider.rpc("create_deal", {
      p_org: TEST.ORG_ID,
      p_codename: "PROYECTO-INTRUSO",
      p_template_version: TEST.TEMPLATE_VERSION_ID,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/miembro de la organización/);
  });
});
