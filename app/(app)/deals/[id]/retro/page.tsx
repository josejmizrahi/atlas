import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/badges";
import { confirmTask, correctTask, rejectTask } from "./actions";

export const metadata = { title: "Retrospectiva — Atlas" };

// Retrospectiva semanal: cola de validaciones para confirmar o corregir
// en máximo 15 minutos. Cada tarjeta muestra la inferencia y su evidencia.
export default async function RetroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: actionError } = await searchParams;
  const supabase = await createClient();

  const { data: deal } = await supabase
    .from("deals")
    .select("id, codename")
    .eq("id", id)
    .maybeSingle();
  if (!deal) notFound();

  const { data: tasks } = await supabase
    .from("validation_tasks")
    .select(
      `id, question, priority, retro_week, created_at, assertion_id,
       field_assertions(field_key, value, status, confidence, asserted_by_agent, based_on_evidence_id)`
    )
    .eq("deal_id", id)
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  // Nombres de archivo de la evidencia referenciada por las assertions
  const evidenceIds = Array.from(
    new Set(
      (tasks ?? [])
        .map((t) => (t.field_assertions as { based_on_evidence_id?: string | null } | null)?.based_on_evidence_id)
        .filter((x): x is string => Boolean(x))
    )
  );
  const evidenceById = new Map<string, string>();
  if (evidenceIds.length > 0) {
    const { data: evidence } = await supabase
      .from("evidence_items")
      .select("id, metadata")
      .in("id", evidenceIds);
    for (const ev of evidence ?? []) {
      const meta = (ev.metadata ?? {}) as Record<string, unknown>;
      evidenceById.set(ev.id, String(meta.filename ?? ev.id.slice(0, 8)));
    }
  }

  return (
    <main>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-base font-semibold text-neutral-100">
            Retrospectiva — {deal.codename}
          </h1>
          <p className="text-xs text-neutral-500">
            {tasks?.length ?? 0} validaciones pendientes · objetivo: 15 minutos
          </p>
        </div>
        <Link
          href={`/deals/${deal.id}`}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          ← Volver al deal
        </Link>
      </div>

      {actionError ? (
        <p className="mb-4 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300" role="alert">
          {actionError}
        </p>
      ) : null}

      {tasks && tasks.length > 0 ? (
        <ol className="space-y-3">
          {tasks.map((t) => {
            const assertion = t.field_assertions as unknown as {
              field_key: string;
              value: unknown;
              status: string;
              confidence: number | null;
              asserted_by_agent: string | null;
              based_on_evidence_id: string | null;
            } | null;
            return (
              <li
                key={t.id}
                className="rounded border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-neutral-100">{t.question}</p>
                  <span className="shrink-0 rounded border border-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-500">
                    P{t.priority}
                  </span>
                </div>

                {assertion ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                    <span className="font-mono">
                      {assertion.field_key} = {JSON.stringify(assertion.value)}
                    </span>
                    <StatusBadge status={assertion.status} />
                    {assertion.confidence != null ? (
                      <span className="font-mono text-amber-300">
                        {Math.round(assertion.confidence * 100)}%
                      </span>
                    ) : null}
                    {assertion.asserted_by_agent ? (
                      <span className="text-neutral-500">
                        por {assertion.asserted_by_agent}
                      </span>
                    ) : null}
                    {assertion.based_on_evidence_id ? (
                      <span className="text-neutral-500">
                        evidencia: {evidenceById.get(assertion.based_on_evidence_id) ?? "—"}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={confirmTask}>
                    <input type="hidden" name="deal_id" value={deal.id} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <button
                      type="submit"
                      className="rounded bg-emerald-900/60 px-3 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-900"
                    >
                      Confirmar
                    </button>
                  </form>

                  <form action={correctTask} className="flex items-center gap-2">
                    <input type="hidden" name="deal_id" value={deal.id} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <input
                      name="correction"
                      placeholder={
                        assertion ? "valor correcto…" : "respuesta / aclaración…"
                      }
                      className="w-56 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600"
                    />
                    <button
                      type="submit"
                      className="rounded border border-neutral-700 px-3 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
                    >
                      Corregir
                    </button>
                  </form>

                  <form action={rejectTask}>
                    <input type="hidden" name="deal_id" value={deal.id} />
                    <input type="hidden" name="task_id" value={t.id} />
                    <button
                      type="submit"
                      className="rounded border border-red-900/60 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40"
                    >
                      Rechazar
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-neutral-500">
          Sin validaciones pendientes. La cola se llena cuando el scribe analiza
          evidencia nueva.
        </p>
      )}
    </main>
  );
}
