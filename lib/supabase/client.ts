import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Cliente de navegador: siempre opera como usuario autenticado bajo RLS.
// Nunca usar service_role en código de cliente.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
