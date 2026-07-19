"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=" + encodeURIComponent("Credenciales inválidas"));
  }

  // Arranque seguro: si la instancia no tiene organización aún, el primer
  // usuario la reclama y queda admin. Para miembros existentes es no-op;
  // para cuentas sin invitación falla y se ignora (RLS no les muestra nada).
  await supabase.rpc("claim_first_org").then(
    () => undefined,
    () => undefined
  );

  revalidatePath("/", "layout");
  redirect("/deals");
}

// Registro autoservicio. Crear cuenta es libre; el acceso a datos no:
// solo el primer usuario reclama la organización (migración 0006).
export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const orgName = String(formData.get("org_name") ?? "").trim();

  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Correo y contraseña son obligatorios"));
  }
  if (password.length < 8) {
    redirect("/login?error=" + encodeURIComponent("La contraseña necesita al menos 8 caracteres"));
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, org_name: orgName } },
  });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  if (!data.session) {
    // Confirmación por correo activada en Supabase Auth
    redirect(
      "/login?notice=" +
        encodeURIComponent(
          "Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión."
        )
    );
  }

  await supabase.rpc("claim_first_org").then(
    () => undefined,
    () => undefined
  );

  revalidatePath("/", "layout");
  redirect("/deals");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
