/**
 * Núcleo del scribe: construcción de contexto, esquema de salida y aplicación
 * de resultados. Puro TypeScript sin APIs de Deno para poder testearlo con
 * Vitest contra la base local. La llamada a Anthropic vive en index.ts.
 *
 * Contrato de escritura (arquitectura innegociable):
 *  - Eventos nuevos con origin='inferred' + confidence. Nunca editar eventos.
 *  - Campos reconstruidos vía assert_field(status='inferred', p_agent).
 *  - Lo dudoso genera validation_tasks para la retrospectiva semanal.
 */

export const SCRIBE_AGENT = "claude-scribe-v1";
export const SCRIBE_MODEL = "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Contexto del deal que se le da al modelo
// ---------------------------------------------------------------------------

export interface DealContext {
  deal: {
    id: string;
    codename: string;
    current_stage_key: string | null;
  };
  stages: { key: string; name: string }[];
  actors: { id: string; display_name: string; role: string }[];
  openRequests: {
    id: string;
    title: string;
    requested_by: string;
    requested_from: string;
    requested_at: string;
  }[];
  recentEvents: { occurred_at: string; kind: string; summary: string }[];
}

export const EVENT_KINDS = [
  "email_received",
  "email_sent",
  "document_uploaded",
  "document_shared",
  "request_sent",
  "request_answered",
  "meeting_held",
  "call_held",
  "offer_submitted",
  "offer_revised",
  "approval_granted",
  "approval_denied",
  "nda_signed",
  "loi_signed",
  "contract_signed",
  "access_granted",
  "transfer_confirmed",
  "stage_changed",
  "note_added",
  "other",
] as const;

export const FRICTION_CAUSES = [
  "info_unavailable",
  "info_disordered",
  "info_incorrect",
  "info_duplicated",
  "no_owner",
  "no_authorization",
  "misaligned_incentives",
  "negotiation",
  "third_party_dependency",
  "legal_requirement",
  "bank_requirement",
  "signature",
  "money_transfer",
  "version_churn",
  "context_loss",
  "trust",
] as const;

export function buildSystemPrompt(): string {
  return [
    "Eres el scribe de Atlas, un observatorio de transacciones M&A middle market en México.",
    "Tu trabajo es reconstruir la cronología de un deal a partir de evidencia (correos, documentos, notas).",
    "Reglas:",
    "- Registra SOLO hechos que la evidencia soporta. No inventes actores, fechas ni montos.",
    "- Cada evento lleva confidence entre 0 y 1 según qué tan directamente lo soporta la evidencia.",
    "- Si la evidencia responde o avanza una solicitud abierta, repórtalo en request_updates.",
    "- Si algo es ambiguo (quién, cuándo, qué solicitud), genera una validation_question corta y concreta.",
    "- Los summaries van en español, en una línea, estilo: 'Novalan envió EEFF 2024 por correo'.",
    "- Usa exclusivamente los actor_id y request_id del contexto; si un participante no está en la lista, déjalo fuera y genera una validation_question para incorporarlo.",
  ].join("\n");
}

export function buildUserPrompt(
  ctx: DealContext,
  evidenceText: string,
  evidenceMeta: { filename?: string; captured_at?: string | null }
): string {
  const stages = ctx.stages.map((s) => `${s.key} (${s.name})`).join(", ");
  const actors = ctx.actors
    .map((a) => `- ${a.id} | ${a.display_name} | rol: ${a.role}`)
    .join("\n");
  const requests = ctx.openRequests
    .map(
      (r) =>
        `- ${r.id} | "${r.title}" | ${r.requested_by} → ${r.requested_from} | pedida: ${r.requested_at}`
    )
    .join("\n");
  const events = ctx.recentEvents
    .map((e) => `- ${e.occurred_at} | ${e.kind} | ${e.summary}`)
    .join("\n");

  return [
    `## Deal: ${ctx.deal.codename} (etapa actual: ${ctx.deal.current_stage_key ?? "desconocida"})`,
    `Etapas de la plantilla: ${stages}`,
    "",
    "## Actores del deal",
    actors || "(ninguno registrado)",
    "",
    "## Solicitudes abiertas",
    requests || "(ninguna)",
    "",
    "## Últimos eventos registrados (no los dupliques)",
    events || "(ninguno)",
    "",
    "## Evidencia nueva a analizar",
    `Archivo: ${evidenceMeta.filename ?? "sin nombre"}${evidenceMeta.captured_at ? ` | fecha original: ${evidenceMeta.captured_at}` : ""}`,
    "```",
    evidenceText.slice(0, 60_000),
    "```",
    "",
    "Reconstruye los hechos de esta evidencia con la herramienta record_reconstruction.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Herramienta de salida estructurada (strict tool use)
// ---------------------------------------------------------------------------

export const SCRIBE_TOOL = {
  name: "record_reconstruction",
  description:
    "Registra la reconstrucción de hechos extraídos de la evidencia del deal.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["events", "request_updates", "validation_questions"],
    properties: {
      events: {
        type: "array",
        description: "Eventos que la evidencia soporta y que no están ya registrados",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "occurred_at", "summary", "confidence", "participant_actor_ids"],
          properties: {
            kind: { type: "string", enum: [...EVENT_KINDS] },
            occurred_at: {
              type: "string",
              description: "Fecha-hora ISO 8601 en que ocurrió el hecho",
            },
            summary: { type: "string", description: "Una línea en español" },
            confidence: { type: "number", description: "0 a 1" },
            participant_actor_ids: {
              type: "array",
              items: { type: "string" },
              description: "actor_id del contexto; vacío si no es claro",
            },
          },
        },
      },
      request_updates: {
        type: "array",
        description: "Actualizaciones a solicitudes abiertas soportadas por la evidencia",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["request_id", "field_key", "value", "confidence", "note"],
          properties: {
            request_id: { type: "string" },
            field_key: {
              type: "string",
              enum: ["wait_cause", "first_response_at", "satisfied_at", "status"],
            },
            value: {
              type: "string",
              description:
                "Para wait_cause usar una causa canónica; para fechas ISO 8601; para status: open|partially_answered|answered",
            },
            confidence: { type: "number" },
            note: { type: "string", description: "Por qué la evidencia lo soporta" },
          },
        },
      },
      validation_questions: {
        type: "array",
        description: "Preguntas cortas para la retrospectiva semanal",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question", "priority"],
          properties: {
            question: { type: "string" },
            priority: { type: "integer", enum: [1, 2, 3, 4, 5] },
          },
        },
      },
    },
  },
} as const;

export interface ScribeOutput {
  events: {
    kind: (typeof EVENT_KINDS)[number];
    occurred_at: string;
    summary: string;
    confidence: number;
    participant_actor_ids: string[];
  }[];
  request_updates: {
    request_id: string;
    field_key: "wait_cause" | "first_response_at" | "satisfied_at" | "status";
    value: string;
    confidence: number;
    note: string;
  }[];
  validation_questions: { question: string; priority: number }[];
}

/** Validación defensiva del input del tool (strict garantiza forma, no semántica). */
export function validateScribeOutput(raw: unknown): ScribeOutput {
  const out = raw as ScribeOutput;
  if (!out || !Array.isArray(out.events) || !Array.isArray(out.request_updates) || !Array.isArray(out.validation_questions)) {
    throw new Error("Salida del scribe con forma inválida");
  }
  for (const e of out.events) {
    if (!EVENT_KINDS.includes(e.kind)) throw new Error(`kind inválido: ${e.kind}`);
    if (Number.isNaN(Date.parse(e.occurred_at))) {
      throw new Error(`occurred_at inválido: ${e.occurred_at}`);
    }
    e.confidence = Math.min(1, Math.max(0, e.confidence));
  }
  for (const u of out.request_updates) {
    u.confidence = Math.min(1, Math.max(0, u.confidence));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aplicación de la salida contra la base (cliente Supabase inyectado)
// ---------------------------------------------------------------------------

/** Subconjunto del cliente Supabase que usamos (evita acoplar a una versión). */
export interface DbClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface ApplyResult {
  eventIds: string[];
  assertionIds: string[];
  validationTaskIds: string[];
}

function mondayOfWeek(d: Date): string {
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - diff);
  return monday.toISOString().slice(0, 10);
}

export async function applyScribeOutput(
  db: DbClient,
  dealId: string,
  evidenceId: string,
  output: ScribeOutput,
  agent: string = SCRIBE_AGENT
): Promise<ApplyResult> {
  const result: ApplyResult = { eventIds: [], assertionIds: [], validationTaskIds: [] };
  const retroWeek = mondayOfWeek(new Date());

  // 1. Eventos inferidos + participantes + vínculo a la evidencia
  for (const ev of output.events) {
    const { data: inserted, error } = await db
      .from("events")
      .insert({
        deal_id: dealId,
        kind: ev.kind,
        occurred_at: new Date(ev.occurred_at).toISOString(),
        summary: ev.summary,
        origin: "inferred",
        confidence: ev.confidence,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      throw new Error(`No se pudo insertar evento inferido: ${error?.message}`);
    }
    result.eventIds.push(inserted.id);

    if (ev.participant_actor_ids.length > 0) {
      const { error: pErr } = await db.from("event_participants").insert(
        ev.participant_actor_ids.map((actorId, i) => ({
          event_id: inserted.id,
          actor_id: actorId,
          role: i === 0 ? "initiator" : "participant",
        }))
      );
      if (pErr) throw new Error(`Participantes: ${pErr.message}`);
    }

    const { error: lErr } = await db.from("evidence_links").insert({
      evidence_id: evidenceId,
      linked_type: "event",
      linked_id: inserted.id,
    });
    if (lErr) throw new Error(`evidence_links: ${lErr.message}`);

    // Eventos con confianza baja → tarea de validación
    if (ev.confidence < 0.8) {
      const { data: task, error: tErr } = await db
        .from("validation_tasks")
        .insert({
          deal_id: dealId,
          question: `¿Es correcto el evento inferido: "${ev.summary}" (${ev.occurred_at.slice(0, 10)})?`,
          priority: 3,
          retro_week: retroWeek,
        })
        .select("id")
        .single();
      if (tErr || !task) throw new Error(`validation_tasks: ${tErr?.message}`);
      result.validationTaskIds.push(task.id);
    }
  }

  // 2. Actualizaciones de solicitudes como assertions inferidas
  for (const u of output.request_updates) {
    const { data: assertionId, error } = await db.rpc("assert_field", {
      p_deal: dealId,
      p_subject_type: "request",
      p_subject_id: u.request_id,
      p_field_key: u.field_key,
      // El cliente serializa a jsonb; el valor va tal cual (sin doble encoding)
      p_value: u.value,
      p_status: "inferred",
      p_confidence: u.confidence,
      p_agent: agent,
      p_evidence: evidenceId,
      p_note: u.note,
    });
    if (error) throw new Error(`assert_field(${u.field_key}): ${error.message}`);
    result.assertionIds.push(assertionId as string);

    const { data: task, error: tErr } = await db
      .from("validation_tasks")
      .insert({
        deal_id: dealId,
        assertion_id: assertionId,
        question: `¿Confirmas ${u.field_key} = "${u.value}" para la solicitud? (${u.note})`,
        priority: u.confidence < 0.6 ? 2 : 3,
        retro_week: retroWeek,
      })
      .select("id")
      .single();
    if (tErr || !task) throw new Error(`validation_tasks(assertion): ${tErr?.message}`);
    result.validationTaskIds.push(task.id);
  }

  // 3. Preguntas abiertas del scribe
  for (const q of output.validation_questions) {
    const { data: task, error } = await db
      .from("validation_tasks")
      .insert({
        deal_id: dealId,
        question: q.question,
        priority: Math.min(5, Math.max(1, q.priority)),
        retro_week: retroWeek,
      })
      .select("id")
      .single();
    if (error || !task) throw new Error(`validation_tasks(pregunta): ${error?.message}`);
    result.validationTaskIds.push(task.id);
  }

  return result;
}
