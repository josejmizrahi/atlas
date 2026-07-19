// Edge Function del scribe. Deno runtime.
// POST { evidence_id } con Authorization: Bearer <jwt de usuario>.
// El JWT del usuario prueba membresía (lectura bajo RLS); la aplicación de
// resultados corre con service key como worker de confianza. La llave de
// Anthropic vive SOLO en los secrets de la función.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  applyScribeOutput,
  buildSystemPrompt,
  buildUserPrompt,
  SCRIBE_MODEL,
  SCRIBE_TOOL,
  validateScribeOutput,
  type DealContext,
} from "./core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST requerido" });
  if (!ANTHROPIC_API_KEY) {
    return json(500, {
      error: "ANTHROPIC_API_KEY no configurada en los secrets de la función",
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { error: "Falta Authorization" });

  let evidenceId: string;
  try {
    const body = await req.json();
    evidenceId = String(body.evidence_id ?? "");
    if (!evidenceId) throw new Error("evidence_id requerido");
  } catch (e) {
    return json(400, { error: `Body inválido: ${(e as Error).message}` });
  }

  // Cliente con la sesión del usuario: si no es miembro del deal, RLS
  // hace invisible la evidencia y respondemos 404 sin filtrar nada.
  const userDb = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: evidence } = await userDb
    .from("evidence_items")
    .select("id, deal_id, storage_path, captured_at, metadata")
    .eq("id", evidenceId)
    .maybeSingle();
  if (!evidence) return json(404, { error: "Evidencia inexistente o sin acceso" });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // Contexto del deal
    const [{ data: deal }, { data: dealActors }, { data: openRequests }, { data: recentEvents }] =
      await Promise.all([
        db
          .from("deals")
          .select("id, codename, current_stage_key, template_versions(stages)")
          .eq("id", evidence.deal_id)
          .single(),
        db
          .from("deal_actors")
          .select("actor_id, role, actors(display_name)")
          .eq("deal_id", evidence.deal_id),
        db
          .from("v_open_requests")
          .select("id, title, requested_by, requested_from, requested_at")
          .eq("deal_id", evidence.deal_id),
        db
          .from("v_deal_timeline")
          .select("occurred_at, kind, summary")
          .eq("deal_id", evidence.deal_id)
          .order("occurred_at", { ascending: false })
          .limit(30),
      ]);
    if (!deal) throw new Error("Deal no encontrado");

    const stagesRaw = (deal as { template_versions?: { stages?: unknown } })
      .template_versions?.stages;
    const ctx: DealContext = {
      deal: {
        id: deal.id,
        codename: deal.codename,
        current_stage_key: deal.current_stage_key,
      },
      stages: Array.isArray(stagesRaw)
        ? (stagesRaw as { key: string; name: string }[]).map((s) => ({
            key: s.key,
            name: s.name,
          }))
        : [],
      actors: (dealActors ?? []).map((da: Record<string, unknown>) => ({
        id: String(da.actor_id),
        display_name: String((da.actors as { display_name?: string })?.display_name ?? "—"),
        role: String(da.role),
      })),
      openRequests: (openRequests ?? []) as DealContext["openRequests"],
      recentEvents: (recentEvents ?? []) as DealContext["recentEvents"],
    };

    // Contenido de la evidencia (solo texto en v0)
    const meta = (evidence.metadata ?? {}) as Record<string, unknown>;
    let evidenceText: string;
    if (evidence.storage_path) {
      const { data: file, error: dlErr } = await db.storage
        .from("evidence")
        .download(evidence.storage_path);
      if (dlErr || !file) throw new Error(`No se pudo descargar la evidencia: ${dlErr?.message}`);
      const mime = String(meta.mime ?? "");
      if (mime && !mime.startsWith("text/") && !mime.includes("json") && !mime.includes("xml") && !mime.includes("message")) {
        throw new Error(`Formato aún no soportado por el scribe: ${mime}. Sube .eml/.txt o pega el texto.`);
      }
      evidenceText = await file.text();
    } else {
      throw new Error("La evidencia no tiene contenido almacenado");
    }

    // Llamada al modelo con salida estructurada (strict tool use)
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: SCRIBE_MODEL,
      max_tokens: 8192,
      system: buildSystemPrompt(),
      tools: [SCRIBE_TOOL as never],
      tool_choice: { type: "tool", name: SCRIBE_TOOL.name },
      messages: [
        {
          role: "user",
          content: buildUserPrompt(ctx, evidenceText, {
            filename: meta.filename ? String(meta.filename) : undefined,
            captured_at: evidence.captured_at,
          }),
        },
      ],
    });

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`El modelo no produjo salida estructurada (stop: ${response.stop_reason})`);
    }
    const output = validateScribeOutput(toolUse.input);

    const applied = await applyScribeOutput(db, evidence.deal_id, evidence.id, output);

    await db
      .from("evidence_items")
      .update({
        metadata: {
          ...meta,
          scribe_status: "done",
          scribe_model: SCRIBE_MODEL,
          scribe_at: new Date().toISOString(),
          scribe_usage: {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
          },
        },
      })
      .eq("id", evidence.id);

    return json(200, {
      ok: true,
      events: applied.eventIds.length,
      assertions: applied.assertionIds.length,
      validation_tasks: applied.validationTaskIds.length,
    });
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    await db
      .from("evidence_items")
      .update({
        metadata: {
          ...((evidence.metadata ?? {}) as Record<string, unknown>),
          scribe_status: "failed",
          scribe_error: message.slice(0, 500),
        },
      })
      .eq("id", evidence.id);
    return json(500, { error: message });
  }
});
