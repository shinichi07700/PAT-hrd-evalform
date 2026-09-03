"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { STATUS_LABEL } from "@/lib/status";
import { fmtDate } from "@/lib/dates";
import { StatusBadge } from "./StatusBadge";
import type { FormRow } from "@/lib/repo";

export function FormsTable({
  forms,
  showEmployee = true,
  filterable = false,
}: {
  forms: FormRow[];
  showEmployee?: boolean;
  filterable?: boolean;
}) {
  const [status, setStatus] = useState("all");

  // opsi status yang benar-benar ada di data, urut sesuai alur form
  const statuses = useMemo(() => {
    const present = Array.from(new Set(forms.map((f) => f.status)));
    const order = Object.keys(STATUS_LABEL);
    return present.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }, [forms]);

  const rows = filterable && status !== "all" ? forms.filter((f) => f.status === status) : forms;

  if (forms.length === 0) return <p className="muted">Belum ada form.</p>;

  return (
    <>
      {filterable && statuses.length > 1 && (
        <div className="row" style={{ marginBottom: 10 }}>
          <select
            aria-label="Filter status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ maxWidth: 280 }}
          >
            <option value="all">Semua Status ({forms.length})</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s} ({forms.filter((f) => f.status === s).length})
              </option>
            ))}
          </select>
          {status !== "all" && (
            <button type="button" className="btn btn-sm" onClick={() => setStatus("all")}>
              Reset
            </button>
          )}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="muted">Tidak ada form dengan status terpilih.</p>
      ) : (
        <div className="table-scroll">
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
              {rows.map((f) => (
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
        </div>
      )}
    </>
  );
}
