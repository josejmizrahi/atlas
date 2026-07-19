import { createClient } from "@/lib/supabase/server";
import { createDeal } from "../actions";

export const metadata = { title: "Nuevo deal — Atlas" };

interface Stage {
  key: string;
  name: string;
  position: number;
}

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: orgs }, { data: versions }] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase
      .from("template_versions")
      .select("id, version, stages, schema_templates(name)")
      .not("published_at", "is", null)
      .order("version", { ascending: false }),
  ]);

  const version = versions?.[0];
  const stages: Stage[] = Array.isArray(version?.stages)
    ? ([...(version.stages as unknown as Stage[])].sort(
        (a, b) => a.position - b.position
      ) as Stage[])
    : [];

  return (
    <main className="max-w-md">
      <h1 className="mb-6 text-base font-semibold text-neutral-100">
        Nuevo deal
      </h1>

      {!orgs?.length || !version ? (
        <p className="text-sm text-neutral-400">
          Falta una organización o una plantilla publicada para crear deals.
        </p>
      ) : (
        <form action={createDeal} className="space-y-4">
          <input type="hidden" name="template_version_id" value={version.id} />

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              Organización
            </label>
            <select
              name="org_id"
              required
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              Codename
            </label>
            <input
              name="codename"
              required
              autoFocus
              placeholder="PROYECTO-…"
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600"
            />
            <p className="mt-1 text-[11px] text-neutral-500">
              Nombre interno. El target real se registra como actor, no aquí.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              Etapa inicial (plantilla {version.version})
            </label>
            <select
              name="stage_key"
              defaultValue={stages[0]?.key}
              className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100"
            >
              {stages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
          >
            Crear deal
          </button>
        </form>
      )}
    </main>
  );
}
