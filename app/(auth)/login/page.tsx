import { login, signup } from "./actions";

export const metadata = { title: "Iniciar sesión — Atlas" };

const inputCls =
  "w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-400";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-neutral-400";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold tracking-tight text-neutral-100">
          Atlas
        </h1>
        <p className="mb-8 text-sm text-neutral-400">
          Observatorio de transacciones
        </p>

        {error ? (
          <p
            className="mb-4 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            className="mb-4 rounded border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300"
            role="status"
          >
            {notice}
          </p>
        ) : null}

        <form action={login} className="space-y-4">
          <div>
            <label htmlFor="email" className={labelCls}>
              Correo
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className={inputCls}
            />
          </div>

          <button
            type="submit"
            className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white"
          >
            Entrar
          </button>
        </form>

        <details className="mt-8 border-t border-neutral-800 pt-4">
          <summary className="cursor-pointer text-sm text-neutral-400 hover:text-neutral-200">
            ¿Primera vez? Crear cuenta
          </summary>
          <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
            El primer usuario de la instancia crea la organización y queda como
            administrador. Las cuentas posteriores no ven ningún dato hasta ser
            invitadas.
          </p>
          <form action={signup} className="mt-4 space-y-4">
            <div>
              <label htmlFor="su_full_name" className={labelCls}>
                Nombre completo
              </label>
              <input
                id="su_full_name"
                name="full_name"
                required
                placeholder="Jose Mizrahi"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="su_org_name" className={labelCls}>
                Organización
              </label>
              <input
                id="su_org_name"
                name="org_name"
                required
                placeholder="Quimibond Capital"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="su_email" className={labelCls}>
                Correo
              </label>
              <input
                id="su_email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="su_password" className={labelCls}>
                Contraseña (mínimo 8 caracteres)
              </label>
              <input
                id="su_password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              className="w-full rounded border border-neutral-600 px-3 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800"
            >
              Crear cuenta
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
