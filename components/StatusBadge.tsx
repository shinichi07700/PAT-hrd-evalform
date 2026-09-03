import { STATUS_LABEL } from "@/lib/status";

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "badge-completed"
      : status === "returned"
        ? "badge-returned"
        : status === "draft"
          ? "badge-draft"
          : "badge-review";
  return <span className={`badge ${cls}`}>{STATUS_LABEL[status] ?? status}</span>;
}
