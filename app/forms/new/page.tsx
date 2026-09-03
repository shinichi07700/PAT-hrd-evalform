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

  // Step 1: choose which subordinate to evaluate
  if (!employee) {
    return (
      <div className="container">
        <div className="row no-print" style={{ gap: 6, alignItems: "center" }}>
          <BackButton />
          <CloseButton />
        </div>
        <h1>Nilai Karyawan</h1>
        <p className="muted">Pilih karyawan pada lini laporan Anda yang akan dinilai.</p>
        {subordinates.length === 0 ? (
          <div className="alert alert-info">Anda tidak memiliki bawahan untuk dinilai.</div>
        ) : (
          <div className="card">
            <table className="data">
              <thead>
                <tr><th>Nama</th><th>Jabatan</th><th>Departemen</th><th></th></tr>
              </thead>
              <tbody>
                {subordinates.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <b>{e.name}</b>
                      <div className="muted small">{e.emp_no}</div>
                    </td>
                    <td>{e.position_name ?? "-"}</td>
                    <td className="small">{e.department ?? "-"}</td>
                    <td className="right">
                      <Link href={`/forms/new?employee=${e.id}`} className="btn btn-sm btn-primary">Nilai</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // Step 2: fill the form for the chosen subordinate
  const targetId = Number(employee);
  const emp = getEmployee(targetId);
  const allowed = emp && subordinates.some((s) => s.id === targetId);
  if (!emp || !allowed) {
    return (
      <div className="container">
        <div className="alert alert-error">Karyawan tidak ditemukan atau bukan bawahan Anda.</div>
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
