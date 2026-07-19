import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OriginBadge, StatusBadge } from "@/components/badges";
import { addActor, createEvent, createRequest } from "./actions";
import { runScribe, uploadEvidence } from "./evidence-actions";

export const metadata = { title: "Deal — Atlas" };

const EVENT_KIND_LABELS: Record<string, string> = {
  email_received: "Correo recibido",
  email_sent: "Correo enviado",
  document_uploaded: "Documento subido",
  document_shared: "Documento compartido",
  request_sent: "Solicitud enviada",
  request_answered: "Solicitud respondida",
  meeting_held: "Reunión",
  call_held: "Llamada",
  offer_submitted: "Oferta presentada",
  offer_revised: "Oferta revisada",
  approval_granted: "Aprobación otorgada",
  approval_denied: "Aprobación negada",
  nda_signed: "NDA firmado",
  loi_signed: "LOI firmada",
  contract_signed: "Contrato firmado",
  access_granted: "Acceso otorgado",
  transfer_confirmed: "Transferencia confirmada",
  stage_changed: "Cambio de etapa",
  note_added: "Nota",
  correction: "Corrección",
  other: "Otro",
};

const WAIT_CAUSE_LABELS: Record<string, string> = {
  info_unavailable: "info no disponible",
  info_disordered: "info desordenada",
  info_incorrect: "info incorrecta",
  info_duplicated: "info duplicada",
  no_owner: "sin responsable",
  no_authorization: "sin autorización",
  misaligned_incentives: "incentivos desalineados",
  negotiation: "negociación",
  third_party_dependency: "dependencia de tercero",
  legal_requirement: "requisito legal",
  bank_requirement: "requisito bancario",
  signature: "firma",
  money_transfer: "transferencia",
  version_churn: "cambios de versión",
  context_loss: "pérdida de contexto",
  trust: "confianza",
};

function nowLocalInput(): string {
  // datetime-local sin segundos, en hora del servidor (v0)
  return new Date().toISOString().slice(0, 16);
}

export default async function DealDetailPage({
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
    .select("id, org_id, codename, status, current_stage_key, opened_at")
    .eq("id", id)
    .maybeSingle();

  if (!deal) notFound();

  const [
    { data: metrics },
    { data: openRequests },
    { data: timeline },
    { data: dealActors },
    { data: requestState },
    { data: evidence },
  ] = await Promise.all([
    supabase.from("v_deal_metrics").select("*").eq("deal_id", id).maybeSingle(),
    supabase
      .from("v_open_requests")
      .select("*")
      .eq("deal_id", id)
      .order("requested_at", { ascending: true }),
    supabase
      .from("v_deal_timeline")
      .select("*")
      .eq("deal_id", id)
      .order("occurred_at", { ascending: false })
      .limit(200),
    supabase
      .from("deal_actors")
      .select("id, role, actor_id, actors(id, display_name)")
      .eq("deal_id", id),
    supabase
      .from("v_current_state")
      .select("subject_id, field_key, value, status, confidence")
      .eq("deal_id", id)
      .eq("subject_type", "request"),
    supabase
      .from("evidence_items")
      .select("id, kind, storage_path, content_hash, captured_at, ingested_at, metadata")
      .eq("deal_id", id)
      .order("ingested_at", { ascending: false })
      .limit(50),
  ]);

  // Métrica objetivo del scribe: % de la cronología reconstruida por IA
  const { count: inferredCount } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", id)
    .eq("origin", "inferred");
  const totalEvents = Number(metrics?.event_count ?? 0);
  const aiPct =
    totalEvents > 0 ? Math.round(((inferredCount ?? 0) / totalEvents) * 100) : 0;

  const actors = (dealActors ?? []).map((da) => ({
    id: da.actor_id,
    name: da.actors?.display_name ?? "—",
    role: da.role,
  }));

  const stateByRequest = new Map<string, { value: unknown; status: string | null; confidence: number | null }>();
  for (const s of requestState ?? []) {
    if (s.field_key === "wait_cause" && s.subject_id) {
      stateByRequest.set(s.subject_id, {
        value: s.value,
        status: s.status,
        confidence: s.confidence,
      });
    }
  }

  const inputCls =
    "w-full rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600";
  const labelCls =
    "mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-400";

  return (
    <main className="space-y-8">
      {/* Encabezado + métricas */}
      <section>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
              {deal.codename}
            </h1>
            <span className="text-xs text-neutral-400">{deal.status}</span>
            <span className="text-xs text-neutral-500">
              etapa: {deal.current_stage_key ?? "—"}
            </span>
          </div>
          <Link
            href={`/deals/${deal.id}/retro`}
            className="rounded border border-amber-900/60 px-3 py-1 text-xs text-amber-300 hover:bg-amber-950/30"
          >
            Retrospectiva{" "}
            {Number(metrics?.pending_validations ?? 0) > 0
              ? `(${metrics!.pending_validations})`
              : ""}
          </Link>
        </div>
        {metrics ? (
          <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded border border-neutral-800 bg-neutral-800 sm:grid-cols-8">
            {[
              ["Actores", metrics.actor_count],
              ["Documentos", metrics.document_count],
              ["Eventos", metrics.event_count],
              ["Solicitudes", metrics.request_count],
              ["Abiertas", metrics.open_requests],
              ["días/sol.", metrics.avg_days_per_request ?? "—"],
              ["Valid. pend.", metrics.pending_validations],
              ["Reconstr. IA", `${aiPct}%`],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-neutral-950 px-3 py-2">
                <dt className="text-[10px] uppercase tracking-wide text-neutral-500">
                  {label}
                </dt>
                <dd className="font-mono text-base text-neutral-100">
                  {String(value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      {actionError ? (
        <p
          className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      {/* Captura rápida */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <details className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-200">
            + Evento (captura &lt; 30 s)
          </summary>
          <form action={createEvent} className="mt-3 space-y-3">
            <input type="hidden" name="deal_id" value={deal.id} />
            <div>
              <label className={labelCls}>Qué ocurrió</label>
              <input
                name="summary"
                required
                placeholder="Vendedor envió EEFF 2024 por correo"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Tipo</label>
                <select name="kind" defaultValue="note_added" className={inputCls}>
                  {Object.entries(EVENT_KIND_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Quién</label>
                <select name="actor_id" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Cuándo</label>
              <input
                name="occurred_at"
                type="datetime-local"
                required
                defaultValue={nowLocalInput()}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Evidencia (nota o URL, opcional)</label>
              <input name="evidence" placeholder="https://… o nota breve" className={inputCls} />
            </div>
            <button
              type="submit"
              className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white"
            >
              Registrar evento
            </button>
          </form>
        </details>

        <details className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-200">
            + Solicitud
          </summary>
          <form action={createRequest} className="mt-3 space-y-3">
            <input type="hidden" name="deal_id" value={deal.id} />
            <div>
              <label className={labelCls}>Qué se pide</label>
              <input
                name="title"
                required
                placeholder="Balanza de comprobación 2024"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Pide</label>
                <select name="requested_by_actor" required className={inputCls}>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>A</label>
                <select name="requested_from_actor" required className={inputCls}>
                  {actors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Cuándo</label>
                <input
                  name="requested_at"
                  type="datetime-local"
                  required
                  defaultValue={nowLocalInput()}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Vence (opcional)</label>
                <input name="due_at" type="datetime-local" className={inputCls} />
              </div>
            </div>
            <button
              type="submit"
              className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white"
            >
              Registrar solicitud
            </button>
          </form>
        </details>

        <details className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-200">
            + Actor
          </summary>
          <form action={addActor} className="mt-3 space-y-3">
            <input type="hidden" name="deal_id" value={deal.id} />
            <input type="hidden" name="org_id" value={deal.org_id} />
            <div>
              <label className={labelCls}>Nombre</label>
              <input
                name="display_name"
                placeholder="Lic. Pérez / Banco X"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Tipo</label>
                <select name="kind" className={inputCls}>
                  <option value="person">Persona</option>
                  <option value="organization">Organización</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Rol en el deal</label>
                <input
                  name="role"
                  required
                  placeholder="vendedor, abogado_comprador…"
                  className={inputCls}
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Representa a (opcional)</label>
              <input name="represents" placeholder="al vendedor" className={inputCls} />
            </div>
            <button
              type="submit"
              className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white"
            >
              Incorporar actor
            </button>
          </form>
        </details>

        <details className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-200">
            + Evidencia
          </summary>
          <form action={uploadEvidence} className="mt-3 space-y-3">
            <input type="hidden" name="deal_id" value={deal.id} />
            <div>
              <label className={labelCls}>Archivo (.eml, .pdf, .txt…)</label>
              <input
                name="file"
                type="file"
                className="w-full text-xs text-neutral-400 file:mr-2 file:rounded file:border file:border-neutral-700 file:bg-neutral-900 file:px-2 file:py-1 file:text-xs file:text-neutral-200"
              />
            </div>
            <div>
              <label className={labelCls}>…o pega el contenido</label>
              <textarea
                name="text"
                rows={3}
                placeholder="Correo exportado, minuta, nota…"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Fecha original (opcional)</label>
              <input name="captured_at" type="datetime-local" className={inputCls} />
            </div>
            <button
              type="submit"
              className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white"
            >
              Subir evidencia
            </button>
          </form>
        </details>
      </section>

      {/* Solicitudes abiertas: la tarjeta central de la UI */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Solicitudes abiertas ({openRequests?.length ?? 0})
        </h2>
        {openRequests && openRequests.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {openRequests.map((r) => {
              const assertion = r.id ? stateByRequest.get(r.id) : undefined;
              const waitDays = r.days_waiting ?? 0;
              return (
                <article
                  key={r.id}
                  className="rounded border border-neutral-800 bg-neutral-950 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-neutral-100">
                      {r.title}
                    </h3>
                    <span
                      className={`shrink-0 font-mono text-lg ${
                        waitDays >= 7
                          ? "text-red-400"
                          : waitDays >= 3
                            ? "text-amber-300"
                            : "text-neutral-300"
                      }`}
                      title="días esperando"
                    >
                      {waitDays}d
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {r.requested_from} debe a {r.requested_by}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {r.wait_cause ? (
                      <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300">
                        {WAIT_CAUSE_LABELS[r.wait_cause] ?? r.wait_cause}
                      </span>
                    ) : assertion ? (
                      <>
                        <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-300">
                          {WAIT_CAUSE_LABELS[String(assertion.value).replaceAll('"', "")] ??
                            String(assertion.value)}
                        </span>
                        <StatusBadge status={assertion.status} />
                        {assertion.status === "inferred" ? (
                          <span className="text-[10px] text-amber-400">
                            pendiente de confirmar
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-[10px] text-neutral-600">
                        causa de espera sin registrar
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-neutral-500">
                    {r.status === "partially_answered"
                      ? "respondida parcialmente"
                      : "sin respuesta"}
                    {r.due_at
                      ? ` · vence ${new Date(r.due_at).toISOString().slice(0, 10)}`
                      : ""}
                  </p>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">Sin solicitudes abiertas.</p>
        )}
      </section>

      {/* Evidencia */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Evidencia ({evidence?.length ?? 0})
        </h2>
        {evidence && evidence.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="py-1.5 pr-4 font-medium">Archivo</th>
                <th className="py-1.5 pr-4 font-medium">Tipo</th>
                <th className="py-1.5 pr-4 font-medium">Capturada</th>
                <th className="py-1.5 pr-4 font-medium">Análisis</th>
                <th className="py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((ev) => {
                const meta = (ev.metadata ?? {}) as Record<string, unknown>;
                const status = String(meta.scribe_status ?? "pending");
                return (
                  <tr key={ev.id} className="border-b border-neutral-900">
                    <td className="py-1.5 pr-4 text-neutral-200">
                      {String(meta.filename ?? ev.storage_path ?? "—")}
                    </td>
                    <td className="py-1.5 pr-4 text-neutral-400">{ev.kind}</td>
                    <td className="py-1.5 pr-4 font-mono text-[11px] text-neutral-500">
                      {ev.captured_at
                        ? new Date(ev.captured_at).toISOString().slice(0, 10)
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-4">
                      {status === "done" ? (
                        <span className="text-[11px] text-emerald-300">analizada</span>
                      ) : status === "failed" ? (
                        <span className="text-[11px] text-red-400">falló</span>
                      ) : (
                        <span className="text-[11px] text-amber-300">pendiente</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {status !== "done" ? (
                        <form action={runScribe}>
                          <input type="hidden" name="deal_id" value={deal.id} />
                          <input type="hidden" name="evidence_id" value={ev.id} />
                          <button
                            type="submit"
                            className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800"
                          >
                            Analizar con IA
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-500">
            Sin evidencia aún. Sube correos exportados o documentos arriba.
          </p>
        )}
      </section>

      {/* Cronología */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Cronología ({timeline?.length ?? 0})
        </h2>
        {timeline && timeline.length > 0 ? (
          <ol className="divide-y divide-neutral-900 border-t border-neutral-900">
            {timeline.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 py-2">
                <time className="w-32 shrink-0 font-mono text-[11px] text-neutral-500">
                  {e.occurred_at
                    ? new Date(e.occurred_at).toISOString().slice(0, 16).replace("T", " ")
                    : "—"}
                </time>
                <span className="w-40 shrink-0 text-[11px] text-neutral-400">
                  {e.kind ? (EVENT_KIND_LABELS[e.kind] ?? e.kind) : "—"}
                </span>
                <span className="flex-1 text-sm text-neutral-200">
                  {e.summary}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {(e.evidence_count ?? 0) > 0 ? (
                    <span
                      className="text-[10px] text-neutral-500"
                      title="evidencia vinculada"
                    >
                      {e.evidence_count}⎘
                    </span>
                  ) : null}
                  {(e.pending_validations ?? 0) > 0 ? (
                    <span className="text-[10px] text-amber-400">
                      {e.pending_validations} por validar
                    </span>
                  ) : null}
                  <OriginBadge origin={e.origin} confidence={e.confidence} />
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-neutral-500">
            Aún no hay eventos. Registra el primero arriba.
          </p>
        )}
      </section>
    </main>
  );
}
