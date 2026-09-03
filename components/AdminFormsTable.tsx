"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteFormAction, resetFormAction, setFormReviewersAction } from "@/lib/actions";

interface AdminForm {
  id: number;
  employee_name: string;
  emp_no: string;
  position_name: string | null;
  period_start: string;
  period_end: string;
  status: string;
  created_at: string;
  reviewer1_id: number | null;
  reviewer2_id: number | null;
  reviewer3_id: number | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  review1: "Review Tier 1",
  review2: "Review Tier 2 (Atasan)",
  review3: "Review Top Management",
  awaiting_ack: "Menunggu Konfirmasi Karyawan",
  completed: "Completed",
  returned: "Ditolak — perlu tindak lanjut HR",
};

function statusCls(s: string) {
  if (s === "completed") return "badge-completed";
  if (s === "returned") return "badge-returned";
  if (s === "draft") return "badge-draft";
  return "badge-review";
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "-";
  const d = new Date(s.includes("T") || s.includes(" ") ? s : s + "T00:00:00");
  return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminFormsTable({
  forms,
  employees,
}: {
  forms: AdminForm[];
  employees: { id: number; name: string; emp_no: string }[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [editRow, setEditRow] = useState<number | null>(null);
  const [chain, setChain] = useState<[number | null, number | null]>([null, null]);
  const [error, setError] = useState<string | null>(null);

  const filtered = forms.filter(
    (f) =>
      (statusFilter === "all" || f.status === statusFilter) &&
      (!q ||
        f.employee_name.toLowerCase().includes(q.toLowerCase()) ||
        f.emp_no.toLowerCase().includes(q.toLowerCase()))
  );

  const openEdit = (f: AdminForm) => {
    setEditRow(f.id);
    setChain([f.reviewer2_id, f.reviewer3_id]);
    setError(null);
  };

  const saveChain = async (formId: number) => {
    const res = await setFormReviewersAction(formId, chain[0], chain[1]);
    if (!res.ok) return setError(res.error ?? "Gagal menyimpan.");
    setEditRow(null);
    router.refresh();
  };

  const remove = async (f: AdminForm) => {
    if (!confirm(`Hapus form #${f.id} milik ${f.employee_name}?`)) return;
    const res = await deleteFormAction(f.id);
    if (!res.ok) return alert(res.error);
    router.refresh();
  };

  const reset = async (f: AdminForm) => {
    if (!confirm(`Kembalikan form #${f.id} ke status Draft? Penilai (atasan) dapat mengisi ulang form.`)) return;
    const res = await resetFormAction(f.id);
    if (!res.ok) return alert(res.error);
    router.refresh();
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 200 }}>
          <option value="all">Semua Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Cari nama / No. ID..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <span className="muted small">{filtered.length} form</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>#</th>
              <th>Karyawan</th>
              <th>Periode</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((f) => (
              <Fragment key={f.id}>
                <tr>
                  <td>{f.id}</td>
                  <td>
                    <b>{f.employee_name}</b>
                    <div className="muted small">{f.emp_no} · {f.position_name ?? "-"}</div>
                  </td>
                  <td className="small">{fmtDate(f.period_start)} s/d {fmtDate(f.period_end)}</td>
                  <td><span className={`badge ${statusCls(f.status)}`}>{STATUS_LABEL[f.status] ?? f.status}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/forms/${f.id}`} className="btn btn-sm">Buka</Link>{" "}
                    <button className="btn btn-sm" onClick={() => openEdit(f)}>Reviewer</button>{" "}
                    {f.status !== "draft" && (
                      <>
                        <button className="btn btn-sm" onClick={() => reset(f)}>Reset</button>{" "}
                      </>
                    )}
                    <button className="btn btn-sm btn-danger" onClick={() => remove(f)}>Hapus</button>
                  </td>
                </tr>
                {editRow === f.id && (
                  <tr>
                    <td colSpan={5} style={{ background: "#f8fafc" }}>
                      <div className="grid-2" style={{ marginBottom: 8 }}>
                        {[0, 1].map((i) => (
                          <div key={i}>
                            <label>{i === 0 ? "Reviewer Tier 2 (Atasan Penilai)" : "Approver Akhir (Managing Director)"}</label>
                            <select
                              value={chain[i] ?? ""}
                              onChange={(e) =>
                                setChain((c) => {
                                  const next = [...c] as typeof chain;
                                  next[i] = e.target.value ? Number(e.target.value) : null;
                                  return next;
                                })
                              }
                            >
                              <option value="">— kosongkan —</option>
                              {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>{emp.name} ({emp.emp_no})</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <button className="btn btn-sm" onClick={() => setEditRow(null)}>Batal</button>
                        <button className="btn btn-sm btn-primary" onClick={() => saveChain(f.id)}>Simpan Route Persetujuan</button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="muted center">Tidak ada form.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
