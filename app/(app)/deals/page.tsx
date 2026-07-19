import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";

export const metadata = { title: "Deals — Atlas" };

// Lista mínima de deals para verificar auth + RLS de punta a punta.
// La pantalla completa (timeline, solicitudes, métricas) llega en Fase 2.
export default async function DealsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, codename, status, current_stage_key, opened_at")
    .order("opened_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-8 flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-100">
            Atlas — Deals
          </h1>
          <p className="text-xs text-neutral-500">{user?.email}</p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      {error ? (
        <p className="text-sm text-red-400">Error al cargar deals: {error.message}</p>
      ) : deals && deals.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="py-2 pr-4 font-medium">Codename</th>
              <th className="py-2 pr-4 font-medium">Estado</th>
              <th className="py-2 pr-4 font-medium">Etapa</th>
              <th className="py-2 font-medium">Apertura</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} className="border-b border-neutral-900">
                <td className="py-2 pr-4 font-medium text-neutral-100">
                  {d.codename}
                </td>
                <td className="py-2 pr-4 text-neutral-300">{d.status}</td>
                <td className="py-2 pr-4 text-neutral-300">
                  {d.current_stage_key ?? "—"}
                </td>
                <td className="py-2 text-neutral-400">{d.opened_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-neutral-400">
          No hay deals visibles para tu usuario.
        </p>
      )}
    </main>
  );
}
