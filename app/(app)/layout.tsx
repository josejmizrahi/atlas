import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";

// Shell de la app autenticada: navegación mínima, densidad alta.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-800 bg-neutral-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <nav className="flex items-baseline gap-6">
            <Link
              href="/deals"
              className="text-sm font-semibold tracking-tight text-neutral-100"
            >
              Atlas
            </Link>
            <Link
              href="/deals"
              className="text-xs text-neutral-400 hover:text-neutral-200"
            >
              Deals
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="text-xs text-neutral-500">{user?.email}</span>
            <form action={logout}>
              <button
                type="submit"
                className="rounded border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-6">{children}</div>
    </div>
  );
}
