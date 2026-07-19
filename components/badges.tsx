// Badges compartidos: el origen del dato SIEMPRE es visible.
// Un hecho confirmado nunca se presenta igual que una inferencia de IA.

const ORIGIN_STYLES: Record<string, string> = {
  manual: "border-neutral-600 text-neutral-300",
  ingested: "border-sky-800 text-sky-300",
  inferred: "border-amber-700 text-amber-300",
};

const ORIGIN_LABELS: Record<string, string> = {
  manual: "manual",
  ingested: "ingerido",
  inferred: "inferido",
};

export function OriginBadge({
  origin,
  confidence,
}: {
  origin: string | null;
  confidence?: number | null;
}) {
  if (!origin) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
        ORIGIN_STYLES[origin] ?? ORIGIN_STYLES.manual
      }`}
    >
      {ORIGIN_LABELS[origin] ?? origin}
      {origin === "inferred" && confidence != null ? (
        <span className="font-mono normal-case">
          {Math.round(confidence * 100)}%
        </span>
      ) : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    confirmed: "border-emerald-800 text-emerald-300",
    observed: "border-neutral-600 text-neutral-300",
    inferred: "border-amber-700 text-amber-300",
    disputed: "border-red-800 text-red-300",
  };
  const labels: Record<string, string> = {
    confirmed: "confirmado",
    observed: "observado",
    inferred: "inferido",
    disputed: "en disputa",
  };
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
        styles[status] ?? styles.observed
      }`}
    >
      {labels[status] ?? status}
    </span>
  );
}
