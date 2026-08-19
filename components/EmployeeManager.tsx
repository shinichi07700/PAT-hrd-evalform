"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveEmployeeAction, deleteEmployeeAction } from "@/lib/actions";

export interface EmployeeLite {
  id: number;
  emp_no: string;
  name: string;
  position_id: number | null;
  join_date: string | null;
  supervisor_id: number | null;
  is_top_management: boolean;
  department: string | null;
  division: string | null;
  position_name: string | null;
  is_managerial: boolean;
  supervisor_name: string | null;
  role: string;
}

interface PositionLite {
  id: number;
  department: string;
  division: string;
  name: string;
  is_managerial: number;
}

const emptyForm = {
  id: null as number | null,
  emp_no: "",
  name: "",
  position_id: null as number | null,
  join_date: "",
  supervisor_id: null as number | null,
  is_top_management: false,
  new_password: "",
};

export default function EmployeeManager({
  employees,
  positions,
}: {
  employees: EmployeeLite[];
  positions: PositionLite[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const startAdd = () => {
    setForm({ ...emptyForm });
    setEditing(true);
    setError(null);
  };

  const startEdit = (e: EmployeeLite) => {
    setForm({
      id: e.id,
      emp_no: e.emp_no,
      name: e.name,
      position_id: e.position_id,
      join_date: e.join_date ?? "",
      supervisor_id: e.supervisor_id,
      is_top_management: e.is_top_management,
      new_password: "",
    });
    setEditing(true);
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await saveEmployeeAction(form);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Gagal menyimpan.");
    setEditing(false);
    router.refresh();
  };

  const remove = async (e: EmployeeLite) => {
    if (!confirm(`Hapus karyawan ${e.name} (${e.emp_no})?`)) return;
    const res = await deleteEmployeeAction(e.id);
    if (!res.ok) return alert(res.error);
    router.refresh();
  };

  const filtered = employees.filter(
    (e) =>
      !filter ||
      e.name.toLowerCase().includes(filter.toLowerCase()) ||
      e.emp_no.toLowerCase().includes(filter.toLowerCase()) ||
      (e.position_name ?? "").toLowerCase().includes(filter.toLowerCase())
  );

  const set = (patch: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, justifyContent: "space-between" }}>
        <input
          type="text"
          placeholder="Cari nama / No. ID / jabatan..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button className="btn btn-primary" onClick={startAdd}>+ Tambah Karyawan</button>
      </div>

      {editing && (
        <div className="card" style={{ border: "2px solid var(--brand)" }}>
          <div className="card-title">{form.id ? "Edit Karyawan" : "Tambah Karyawan"}</div>
          <div className="grid-3">
            <div className="field">
              <label>No. ID *</label>
              <input type="text" value={form.emp_no} onChange={(e) => set({ emp_no: e.target.value })} />
            </div>
            <div className="field">
              <label>Nama Lengkap *</label>
              <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <div className="field">
              <label>Tanggal Masuk</label>
              <input type="date" value={form.join_date} onChange={(e) => set({ join_date: e.target.value })} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Jabatan (dari Template Job Position)</label>
              <select
                value={form.position_id ?? ""}
                onChange={(e) => set({ position_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— pilih jabatan —</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.department} · {p.division} · {p.name} ({p.is_managerial ? "Managerial" : "Non-Managerial"})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Atasan Langsung (untuk rantai review)</label>
              <select
                value={form.supervisor_id ?? ""}
                onChange={(e) => set({ supervisor_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— tidak ada —</option>
                {employees
                  .filter((e) => e.id !== form.id)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.emp_no}){e.is_top_management ? " — Top Management" : ""}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <label className="checkbox-row" style={{ fontWeight: 400, color: "var(--ink)" }}>
              <input
                type="checkbox"
                checked={form.is_top_management}
                onChange={(e) => set({ is_top_management: e.target.checked })}
              />
              Top Management (approver terakhir setiap form)
            </label>
            <div className="field">
              <label>{form.id ? "Password Baru (kosongkan jika tidak diubah)" : "Password (default = No. ID)"}</label>
              <input type="text" value={form.new_password} onChange={(e) => set({ new_password: e.target.value })} />
            </div>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setEditing(false)}>Batal</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <table className="data">
          <thead>
            <tr>
              <th>No. ID</th>
              <th>Nama</th>
              <th>Jabatan</th>
              <th>Atasan</th>
              <th>Masuk</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>{e.emp_no}</td>
                <td>
                  <b>{e.name}</b>
                  <div className="muted small">
                    {e.role === "admin" ? "Admin HR" : e.is_top_management ? "Top Management" : e.is_managerial ? "Managerial" : "Non-Managerial"}
                  </div>
                </td>
                <td>
                  {e.position_name ?? "-"}
                  <div className="muted small">
                    {e.department ? `${e.department} · ${e.division}` : ""}
                  </div>
                </td>
                <td>{e.supervisor_name ?? "-"}</td>
                <td className="small">{e.join_date ?? "-"}</td>
                <td className="right" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-sm" onClick={() => startEdit(e)}>Edit</button>{" "}
                  <button className="btn btn-sm btn-danger" onClick={() => remove(e)}>Hapus</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="muted center">Tidak ada karyawan.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
