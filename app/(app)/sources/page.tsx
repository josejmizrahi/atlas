import { createClient } from "@/lib/supabase/server";
import { createSource, syncSource, toggleSource } from "./actions";

export const metadata = { title: "Fuentes — Atlas" };

// Fuentes de evidencia por organización: conectores Gmail/Drive hacia
// evidence_sources → ingestion_jobs → evidence_items (dedupe doble).
export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: orgs }, { data: sources }, { data: deals }] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("evidence_sources")
      .select("id, org_id, kind, label, config, is_active, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("deals").select("id, codename").order("codename"),
  ]);

  // Último job por fuente
  const sourceIds = (sources ?? []).map((s) => s.id);
  const lastJobBySource = new Map<
    string,
    { status: string; finished_at: string | null; stats: unknown; error: string | null }
  >();
  if (sourceIds.length > 0) {
    const { data: jobs } = await supabase
      .from("ingestion_jobs")
      .select("source_id, status, started_at, finished_at, stats, error")
      .in("source_id", sourceIds)
      .order("started_at", { ascending: false })
      .limit(100);
    for (const j of jobs ?? []) {
      if (!lastJobBySource.has(j.source_id)) lastJobBySource.set(j.source_id, j);
    }
  }

  const dealById = new Map((deals ?? []).map((d) => [d.id, d.codename]));

  const inputCls =
    "w-full rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-sm text-neutral-100 placeholder:text-neutral-600";
  const labelCls =
    "mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-400";

  return (
    <main>
      <h1 className="mb-1 text-base font-semibold text-neutral-100">
        Fuentes de evidencia
      </h1>
      <p className="mb-6 text-xs text-neutral-500">
        Conectores hacia Gmail y Google Drive. La credencial se conecta con{" "}
        <code className="text-neutral-400">scripts/connect-google.ts</code>; aquí
        solo vive configuración no sensible.
      </p>

      {error ? (
        <p className="mb-4 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mb-8 grid gap-4 lg:grid-cols-2">
        <details className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <summary className="cursor-pointer text-sm font-medium text-neutral-200">
            + Nueva fuente
          </summary>
          <form action={createSource} className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Organización</label>
                <select name="org_id" required className={inputCls}>
                  {(orgs ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tipo</label>
                <select name="kind" className={inputCls}>
                  <option value="gmail">Gmail</option>
                  <option value="gdrive">Google Drive</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Nombre</label>
              <input
                name="label"
                required
                placeholder="Correo del deal Norte"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Deal destino</label>
              <select name="deal_id" required className={inputCls}>
                {(deals ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.codename}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Query Gmail</label>
                <input
                  name="query"
                  placeholder="label:atlas-norte"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Carpeta Drive (ID)</label>
                <input name="folder_id" placeholder="1AbC…" className={inputCls} />
              </div>
            </div>
            <button
              type="submit"
              className="rounded bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-white"
            >
              Crear fuente
            </button>
          </form>
        </details>
      </section>

      {sources && sources.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4 font-medium">Fuente</th>
              <th className="py-2 pr-4 font-medium">Tipo</th>
              <th className="py-2 pr-4 font-medium">Deal</th>
              <th className="py-2 pr-4 font-medium">Credencial</th>
              <th className="py-2 pr-4 font-medium">Último job</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => {
              const cfg = (s.config ?? {}) as Record<string, unknown>;
              const job = lastJobBySource.get(s.id);
              const jobStats = (job?.stats ?? null) as {
                inserted?: number;
                duplicates?: number;
                failed?: number;
              } | null;
              return (
                <tr key={s.id} className="border-b border-neutral-900 align-top">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-neutral-100">{s.label}</span>
                    {!s.is_active ? (
                      <span className="ml-2 text-[10px] uppercase text-neutral-600">
                        inactiva
                      </span>
                    ) : null}
                    <p className="text-[11px] text-neutral-500">
                      {String(cfg.query ?? cfg.folder_id ?? "")}
                    </p>
                  </td>
                  <td className="py-2 pr-4 text-neutral-300">{s.kind}</td>
                  <td className="py-2 pr-4 text-neutral-300">
                    {dealById.get(String(cfg.deal_id)) ?? "—"}
                  </td>
                  <td className="py-2 pr-4">
                    {cfg.vault_secret ? (
                      <span className="text-[11px] text-emerald-300">conectada</span>
                    ) : (
                      <span className="text-[11px] text-amber-300">sin conectar</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-[11px] text-neutral-400">
                    {job ? (
                      <>
                        <span
                          className={
                            job.status === "done"
                              ? "text-emerald-300"
                              : job.status === "failed"
                                ? "text-red-400"
                                : "text-amber-300"
                          }
                        >
                          {job.status}
                        </span>
                        {jobStats ? (
                          <span className="ml-1 font-mono">
                            +{jobStats.inserted ?? 0} ={jobStats.duplicates ?? 0} ✗
                            {jobStats.failed ?? 0}
                          </span>
                        ) : null}
                        {job.error ? (
                          <p className="max-w-64 truncate text-red-400" title={job.error}>
                            {job.error}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      "nunca"
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <form action={syncSource}>
                        <input type="hidden" name="source_id" value={s.id} />
                        <button
                          type="submit"
                          className="rounded border border-neutral-700 px-2.5 py-1 text-[11px] text-neutral-200 hover:bg-neutral-800"
                        >
                          Sincronizar
                        </button>
                      </form>
                      <form action={toggleSource}>
                        <input type="hidden" name="source_id" value={s.id} />
                        <input
                          type="hidden"
                          name="active"
                          value={String(!s.is_active)}
                        />
                        <button
                          type="submit"
                          className="rounded border border-neutral-800 px-2.5 py-1 text-[11px] text-neutral-500 hover:bg-neutral-900"
                        >
                          {s.is_active ? "Desactivar" : "Activar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-neutral-500">
          Sin fuentes. Crea la primera para ingerir correo o Drive automáticamente.
        </p>
      )}
    </main>
  );
}
