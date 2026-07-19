/**
 * Simula una corrida del scribe contra la base LOCAL de desarrollo:
 * inserta evidencia y aplica una salida de ejemplo con el mismo core
 * que usa la Edge Function. Útil para poblar la retro sin gastar tokens.
 *
 * Uso: npx tsx scripts/scribe-demo.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { createClient } from "@supabase/supabase-js";
import {
  applyScribeOutput,
  type ScribeOutput,
} from "../supabase/functions/scribe/core";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const DEAL = "dddd0000-0000-0000-0000-0000000000d1";
const VENDEDOR = "ac000000-0000-0000-0000-0000000000a2";
const REQUEST = "f0000000-0000-0000-0000-0000000000f1";

async function main() {
  const { data: ev, error } = await admin
    .from("evidence_items")
    .insert({
      deal_id: DEAL,
      kind: "email",
      content_hash: `seed-scribe-demo-${Date.now()}`,
      captured_at: "2026-07-17T10:00:00Z",
      metadata: {
        filename: "correo-balanza.eml",
        scribe_status: "done",
        scribe_model: "claude-sonnet-4-6",
      },
    })
    .select("id")
    .single();
  if (error || !ev) throw error ?? new Error("sin evidencia");

  const output: ScribeOutput = {
    events: [
      {
        kind: "email_received",
        occurred_at: "2026-07-17T10:00:00Z",
        summary: "Target Demo envió balanza parcial; faltan auxiliares de bancos",
        confidence: 0.88,
        participant_actor_ids: [VENDEDOR],
      },
      {
        kind: "call_held",
        occurred_at: "2026-07-18T09:30:00Z",
        summary: "Llamada con el contador del vendedor para aclarar cifras",
        confidence: 0.6,
        participant_actor_ids: [VENDEDOR],
      },
    ],
    request_updates: [
      {
        request_id: REQUEST,
        field_key: "wait_cause",
        value: "info_disordered",
        confidence: 0.72,
        note: "El correo indica información incompleta y desordenada",
      },
    ],
    validation_questions: [
      {
        question: "¿Quién es el contador externo mencionado en el correo?",
        priority: 2,
      },
    ],
  };

  const r = await applyScribeOutput(admin, DEAL, ev.id, output);
  console.log(
    `scribe demo: ${r.eventIds.length} eventos, ${r.assertionIds.length} assertions, ${r.validationTaskIds.length} validaciones`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
