"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { saveEmployeeAction, deleteEmployeeAction, savePositionAction } from "@/lib/actions";

export interface EmployeeLite {
  id: number;
  emp_no: string;
  name: string;
  email: string | null;
  position_id: number | null;
  join_date: string | null;
  tier1_id: number | null;
  tier2_id: number | null;
  top_mgmt_id: number | null;
  department: string | null;
  division: string | null;
  position_name: string | null;
  is_managerial: boolean;
  tier1_name: string | null;
  tier2_name: string | null;
  top_mgmt_name: string | null;
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
  email: "",
  join_date: "",
  new_password: "",
  department: "",
  division: "",
  position_id: null as number | null,
  tier1_id: null as number | null,
  tier2_id: null as number | null,
  top_mgmt_id: null as number | null,
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
  const [fDept, setFDept] = useState("");
  const [fDiv, setFDiv] = useState("");
  const [addingPos, setAddingPos] = useState(false);
  const [newPos, setNewPos] = useState({ department: "", division: "", name: "", is_managerial: false });

  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const departments = useMemo(() => [...new Set(positions.map((p) => p.department))].sort(), [positions]);
  const divisions = useMemo(
    () => [...new Set(positions.filter((p) => p.department === form.department).map((p) => p.division))].sort(),
    [positions, form.department]
  );
  const divChoices = useMemo(() => {
    const src = fDept ? positions.filter((p) => p.department === fDept) : positions;
    return [...new Set(src.map((p) => p.division))].sort();
  }, [positions, fDept]);
  const posChoices = useMemo(
    () =>
      positions.filter(
        (p) => p.department === form.department && p.division === form.division
      ),
    [positions, form.department, form.division]
  );
  const selectedPos = form.position_id ? posById.get(form.position_id) : undefined;

  // daftar kandidat reviewer (semua akun non-admin, pilihan selalu bisa dikosongkan)
  const reviewerOptions = useMemo(
    () => employees.filter((e) => e.role !== "admin").sort((a, b) => a.name.localeCompare(b.name)),
    [employees]
  );

  const startAdd = () => {
    setForm({ ...emptyForm });
    setAddingPos(false);
    setEditing(true);
    setError(null);
  };

  const startEdit = (e: EmployeeLite) => {
    const pos = e.position_id ? posById.get(e.position_id) : undefined;
    setForm({
      id: e.id,
      emp_no: e.emp_no,
      name: e.name,
      email: e.email ?? "",
      join_date: e.join_date ?? "",
      new_password: "",
      department: pos?.department ?? "",
      division: pos?.division ?? "",
      position_id: e.position_id,
      tier1_id: e.tier1_id,
      tier2_id: e.tier2_id,
      top_mgmt_id: e.top_mgmt_id,
    });
    setAddingPos(false);
    setEditing(true);
    setError(null);
  };

  const set = (patch: Partial<typeof emptyForm>) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await saveEmployeeAction({
      id: form.id,
      emp_no: form.emp_no,
      name: form.name,
      email: form.email,
      join_date: form.join_date,
      position_id: form.position_id,
      tier1_id: form.tier1_id,
      tier2_id: form.tier2_id,
      top_mgmt_id: form.top_mgmt_id,
      new_password: form.new_password,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Gagal menyimpan.");
    setEditing(false);
    router.refresh();
  };

  const addPosition = async () => {
    setBusy(true);
    const res = await savePositionAction(newPos);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Gagal menambah jabatan.");
    setAddingPos(false);
    setNewPos({ department: "", division: "", name: "", is_managerial: false });
    setError(null);
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
      (!fDept || e.department === fDept) &&
      (!fDiv || e.division === fDiv) &&
      (!filter ||
        e.name.toLowerCase().includes(filter.toLowerCase()) ||
        e.emp_no.toLowerCase().includes(filter.toLowerCase()) ||
        (e.email ?? "").toLowerCase().includes(filter.toLowerCase()) ||
        (e.position_name ?? "").toLowerCase().includes(filter.toLowerCase()))
  );

  const tierSelect = (label: string, value: number | null, onChange: (v: number | null) => void, excludeId: number | null) => (
    <div className="field">
      <label>{label}</label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— tidak ada —</option>
        {reviewerOptions
          .filter((r) => r.id !== excludeId)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.emp_no}){r.position_name ? ` — ${r.position_name}` : ""}
            </option>
          ))}
      </select>
    </div>
  );

  return (
    <div>
      <div className="row no-print" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Cari nama / No. ID / email / jabatan..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <select value={fDept} onChange={(e) => { setFDept(e.target.value); setFDiv(""); }} style={{ maxWidth: 260 }}>
          <option value="">Semua Department</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={fDiv} onChange={(e) => setFDiv(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Semua Division</option>
          {divChoices.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn btn-primary" onClick={startAdd}>+ Tambah Karyawan</button>
        </div>
      </div>

      {editing && (
        <div className="card no-print" style={{ border: "2px solid var(--brand)" }}>
          <div className="card-title">{form.id ? "Edit Karyawan" : "Tambah Karyawan"}</div>
          <div className="grid-2">
            <div className="field">
              <label>No. ID *</label>
              <input type="text" value={form.emp_no} onChange={(e) => set({ emp_no: e.target.value })} placeholder="PAT-XXX" />
            </div>
            <div className="field">
              <label>Nama Lengkap *</label>
              <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Email * (untuk login)</label>
              <input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} placeholder="nama@primaagrotech.com" />
            </div>
            <div className="field">
              <label>Tanggal Masuk</label>
              <input type="date" value={form.join_date} onChange={(e) => set({ join_date: e.target.value })} />
            </div>
          </div>

          <div className="section-label">Posisi — Department → Division → Jabatan</div>
          <div className="grid-2">
            <div className="field">
              <label>Department</label>
              <select value={form.department} onChange={(e) => set({ department: e.target.value, division: "", position_id: null })}>
                <option value="">— pilih department —</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Division</label>
              <select value={form.division} disabled={!form.department} onChange={(e) => set({ division: e.target.value, position_id: null })}>
                <option value="">— pilih division —</option>
                {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Jabatan</label>
              <select value={form.position_id ?? ""} disabled={!form.division} onChange={(e) => set({ position_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— pilih jabatan —</option>
                {posChoices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.is_managerial ? "Managerial · 24 aspek" : "Non-Managerial · 18 aspek"})
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ justifyContent: "center" }}>
              {selectedPos ? (
                <span className={`badge ${selectedPos.is_managerial ? "badge-review" : "badge-draft"}`}>
                  {selectedPos.is_managerial ? "Managerial → 24 aspek" : "Non-Managerial → 18 aspek"}
                </span>
              ) : (
                <button className="btn btn-sm" onClick={() => { setAddingPos(!addingPos); setError(null); }}>
                  {addingPos ? "× Batal Jabatan Baru" : "+ Jabatan Baru"}
                </button>
              )}
            </div>
          </div>
          {addingPos && (
            <div className="grid-2" style={{ background: "var(--bg)", padding: 10, borderRadius: 8 }}>
              <div className="field">
                <label>Department jabatan baru</label>
                <input type="text" list="dept-list" value={newPos.department} onChange={(e) => setNewPos({ ...newPos, department: e.target.value })} />
                <datalist id="dept-list">{departments.map((d) => <option key={d} value={d} />)}</datalist>
              </div>
              <div className="field">
                <label>Division jabatan baru</label>
                <input type="text" value={newPos.division} onChange={(e) => setNewPos({ ...newPos, division: e.target.value })} />
              </div>
              <div className="field">
                <label>Nama Jabatan</label>
                <input type="text" value={newPos.name} onChange={(e) => setNewPos({ ...newPos, name: e.target.value })} />
              </div>
              <div className="field" style={{ justifyContent: "flex-end", flexDirection: "row", alignItems: "center", gap: 8 }}>
                <label style={{ margin: 0, display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="checkbox" checked={newPos.is_managerial} onChange={(e) => setNewPos({ ...newPos, is_managerial: e.target.checked })} />
                  Managerial (24 aspek)
                </label>
                <button className="btn btn-sm btn-primary" onClick={addPosition} disabled={busy}>Simpan Jabatan</button>
              </div>
            </div>
          )}

          <div className="section-label">Rantai Review (tersimpan eksplisit per karyawan)</div>
          <div className="grid-2">
            {tierSelect("Tier‑1 · Penilai *", form.tier1_id, (v) => set({ tier1_id: v }), form.id)}
            {tierSelect("Tier‑2 · Reviewer kedua", form.tier2_id, (v) => set({ tier2_id: v }), form.id)}
          </div>
          <div className="grid-2">
            {tierSelect("Top Management · Approver akhir", form.top_mgmt_id, (v) => set({ top_mgmt_id: v }), form.id)}
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

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data">
          <thead>
            <tr>
              <th>No. ID</th>
              <th>Nama</th>
              <th>Email</th>
              <th>Jabatan</th>
              <th>Sifat</th>
              <th>Tier‑1</th>
              <th>Tier‑2</th>
              <th>Top Mgmt</th>
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
                  {e.role === "admin" && <div className="muted small">Admin HR</div>}
                </td>
                <td className="small">{e.email ?? <span className="muted">—</span>}</td>
                <td>
                  {e.position_name ?? "-"}
                  <div className="muted small">{e.department ? `${e.department} · ${e.division}` : ""}</div>
                </td>
                <td className="small">
                  {e.role === "admin" ? "—" : e.tier1_id === null && e.tier2_id === null && e.top_mgmt_id === null && !e.position_id
                    ? "Root (MD)"
                    : e.is_managerial ? "Managerial" : "Non-Mgr"}
                </td>
                <td className="small">{e.tier1_name ?? "-"}</td>
                <td className="small">{e.tier2_name ?? "-"}</td>
                <td className="small">{e.top_mgmt_name ?? "-"}</td>
                <td className="small">{e.join_date ?? "-"}</td>
                <td className="right" style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-sm" onClick={() => startEdit(e)}>Edit</button>{" "}
                  <button className="btn btn-sm btn-danger" onClick={() => remove(e)}>Hapus</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="muted center">Tidak ada karyawan.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
