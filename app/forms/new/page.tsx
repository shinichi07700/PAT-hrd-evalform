import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { getEmployee, listSubordinates } from "@/lib/repo";
import FormEditor from "@/components/FormEditor";
import BackButton from "@/components/BackButton";
import CloseButton from "@/components/CloseButton";

export const dynamic = "force-dynamic";

export default async function NewFormPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "employee") redirect("/");

  const { employee } = await searchParams;
  const subordinates = listSubordinates(user.id);

  // kelompok Managerial / Non-Managerial dulu, lalu urut divisi · jabatan · nama
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const grouped = (mgr: boolean) =>
    subordinates
      .filter((e) => !!e.is_managerial === mgr)
      .sort(
        (a, b) =>
          (a.division ?? "").localeCompare(b.division ?? "") ||
          (a.position_name ?? "").localeCompare(b.position_name ?? "") ||
          byName(a, b)
      );
  const mgrList = grouped(true);
  const nonMgrList = grouped(false);

  const renderSection = (title: string, hint: string, list: typeof subordinates) => {
    if (list.length === 0) return null;
    return (
      <>
        <tr>
          <td colSpan={5}>
            <div className="section-label" style={{ margin: "14px 0 4px" }}>
              {title} <span className="muted small">— {hint} · {list.length} karyawan</span>
            </div>
          </td>
        </tr>
        {list.map((e) => (
          <tr key={e.id}>
            <td>
              <b>{e.name}</b>
              <div className="muted small">{e.emp_no}</div>
            </td>
            <td>{e.position_name ?? "-"}</td>
            <td className="small">{e.division ?? "-"}</td>
            <td className="small">{e.department ?? "-"}</td>
            <td className="right">
              <Link href={`/forms/new?employee=${e.id}`} className="btn btn-sm btn-primary">Nilai</Link>
            </td>
          </tr>
        ))}
      </>
    );
  };

  // Step 1: choose which employee (that I am Tier-1 for) to evaluate
  if (!employee) {
    return (
      <div className="container">
        <div className="row no-print" style={{ gap: 6, alignItems: "center" }}>
          <BackButton />
        </div>
        <h1>Nilai Karyawan</h1>
        <p className="muted">Daftar ini adalah karyawan yang Tier‑1-nya Anda (sesuai data karyawan).</p>
        {subordinates.length === 0 ? (
          <div className="alert alert-info">Anda tidak ditetapkan sebagai Tier‑1 untuk karyawan mana pun.</div>
        ) : (
          <div className="card table-scroll">
            <table className="data">
              <thead>
                <tr><th>Nama</th><th>Jabatan</th><th>Division</th><th>Department</th><th></th></tr>
              </thead>
              <tbody>
                {renderSection("Managerial", "24 aspek", mgrList)}
                {renderSection("Non-Managerial", "18 aspek", nonMgrList)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // Step 2: fill the form for the chosen employee
  const targetId = Number(employee);
  const emp = getEmployee(targetId);
  const allowed = emp && subordinates.some((s) => s.id === targetId);
  if (!emp || !allowed) {
    return (
      <div className="container">
        <div className="alert alert-error">Karyawan tidak ditemukan atau Tier‑1-nya bukan Anda.</div>
        <Link href="/forms/new" className="btn">← Kembali</Link>
      </div>
    );
  }

  return (
    <div className="container">
      <BackButton />
      <h1>Form Penilaian Karyawan Baru</h1>
      <p className="muted" style={{ marginTop: -18 }}>
        Penilai: <b>{user.name}</b> · Karyawan dinilai: <b>{emp.name}</b> ({emp.emp_no}) —
        {" "}<Link href="/forms/new" className="link">← Ganti karyawan</Link>
      </p>
      <FormEditor
        formId={null}
        employeeId={emp.id}
        signerName={user.name}
        employee={{
          name: emp.name,
          emp_no: emp.emp_no,
          position_name: emp.position_name,
          department: emp.department,
          division: emp.division,
          join_date: emp.join_date,
          is_managerial: !!emp.is_managerial,
        }}
        initial={null}
      />
      <div className="row no-print" style={{ justifyContent: "center", marginTop: 16 }}>
        <CloseButton confirmText="Form belum dikirim. Yakin ingin menutup? Nilai yang belum disubmit tidak tersimpan." />
      </div>
    </div>
  );
}
