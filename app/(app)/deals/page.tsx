import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Deals — Atlas" };

// Lista de deals con las métricas maestras (v_deal_metrics, bajo RLS).
export default async function DealsPage() {
  const supabase = await createClient();

  const { data: metrics, error } = await supabase
    .from("v_deal_metrics")
    .select(
      "deal_id, codename, status, current_stage_key, opened_at, actor_count, event_count, open_requests, avg_days_per_request, pending_decisions, pending_validations"
    )
    .order("opened_at", { ascending: false });

  return (
    <main>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-base font-semibold text-neutral-100">Deals</h1>
        <Link
          href="/deals/new"
          className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white"
        >
          + Nuevo deal
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-400">Error al cargar deals: {error.message}</p>
      ) : metrics && metrics.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4 font-medium">Codename</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                <th className="py-2 pr-4 font-medium">Etapa</th>
                <th className="py-2 pr-4 text-right font-medium">Eventos</th>
                <th className="py-2 pr-4 text-right font-medium">Sol. abiertas</th>
                <th className="py-2 pr-4 text-right font-medium">días/sol.</th>
                <th className="py-2 pr-4 text-right font-medium">Valid. pend.</th>
                <th className="py-2 text-right font-medium">Apertura</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((d) => (
                <tr
                  key={d.deal_id}
                  className="border-b border-neutral-900 hover:bg-neutral-900/50"
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/deals/${d.deal_id}`}
                      className="font-medium text-neutral-100 hover:underline"
                    >
                      {d.codename}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-neutral-300">{d.status}</td>
                  <td className="py-2 pr-4 text-neutral-300">
                    {d.current_stage_key ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-neutral-300">
                    {d.event_count}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-neutral-300">
                    {d.open_requests}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-neutral-300">
                    {d.avg_days_per_request ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono text-neutral-300">
                    {d.pending_validations}
                  </td>
                  <td className="py-2 text-right text-neutral-400">
                    {d.opened_at}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-neutral-400">
          No hay deals visibles para tu usuario. Crea el primero.
        </p>
      )}
    </main>
  );
}
