import Link from "next/link";
import { STATUS_LABEL } from "@/lib/repo";
import type { FormRow } from "@/lib/repo";

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

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  const d = new Date(s.includes("T") || s.includes(" ") ? s : s + "T00:00:00");
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function FormsTable({ forms, showEmployee = true }: { forms: FormRow[]; showEmployee?: boolean }) {
  if (forms.length === 0) return <p className="muted">Belum ada form.</p>;
  return (
    <table className="data">
      <thead>
        <tr>
          {showEmployee && <th>Karyawan</th>}
          <th>Periode</th>
          <th>Status</th>
          <th>Dibuat</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {forms.map((f) => (
          <tr key={f.id}>
            {showEmployee && (
              <td>
                <b>{f.employee_name}</b>
                <div className="muted small">
                  {f.emp_no} · {f.position_name ?? "-"}
                </div>
              </td>
            )}
            <td>
              {fmtDate(f.period_start)} s/d {fmtDate(f.period_end)}
            </td>
            <td>
              <StatusBadge status={f.status} />
            </td>
            <td className="muted small">{fmtDate(f.created_at)}</td>
            <td className="right">
              <Link href={`/forms/${f.id}`} className="btn btn-sm">
                Buka
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
