import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  formsForEmployee,
  pendingReviewsFor,
  draftsByEvaluator,
  teamFormsFor,
  listSubordinates,
  allForms,
} from "@/lib/repo";
import { db } from "@/lib/db";
import { FormsTable } from "@/components/FormsTable";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  if (user.role === "admin") {
    const forms = allForms();
    const empCount = (db().prepare("SELECT COUNT(*) AS c FROM employees WHERE role = 'employee'").get() as any).c;
    const pending = forms.filter((f) => f.status.startsWith("review") || f.status === "awaiting_ack").length;
    const completed = forms.filter((f) => f.status === "completed").length;
    return (
      <div className="container-wide">
        <h1>Dashboard Admin</h1>
        <div className="stat-cards">
          <div className="stat-card">
            <div className="num">{empCount}</div>
            <div className="lbl">Karyawan</div>
          </div>
          <div className="stat-card">
            <div className="num">{forms.length}</div>
            <div className="lbl">Total Form</div>
          </div>
          <div className="stat-card">
            <div className="num">{pending}</div>
            <div className="lbl">Dalam Proses Review</div>
          </div>
          <div className="stat-card">
            <div className="num">{completed}</div>
            <div className="lbl">Selesai</div>
          </div>
        </div>
        <div className="row" style={{ marginBottom: 16 }}>
          <Link href="/admin/forms" className="btn btn-primary">Kelola Semua Form</Link>
          <Link href="/admin/employees" className="btn">Kelola Karyawan</Link>
        </div>
        <div className="card">
          <div className="card-title">Form Terbaru</div>
          <FormsTable forms={forms.slice(0, 10)} />
        </div>
      </div>
    );
  }

  const myForms = formsForEmployee(user.id);          // form di mana saya yang dinilai
  const pending = pendingReviewsFor(user.id);          // menunggu persetujuan saya sebagai atasan/MD
  const toAcknowledge = myForms.filter((f) => f.status === "awaiting_ack");
  const subordinates = listSubordinates(user.id);      // bawahan langsung & tidak langsung
  const myDrafts = draftsByEvaluator(user.id);         // penilaian yang saya buat, belum di-submit
  const teamForms = subordinates.length > 0 ? teamFormsFor(user.id) : [];

  return (
    <div className="container">
      <h1>Selamat datang, {user.name}</h1>
      {user.position_name && (
        <p className="muted" style={{ marginTop: -8 }}>
          {user.position_name} · {user.emp_no}
        </p>
      )}

      {subordinates.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span>Nilai Karyawan Bawahan</span>
            <Link href="/forms/new" className="btn btn-primary">+ Buat Penilaian Baru</Link>
          </div>
          <div className="alert alert-info">
            Anda adalah Tier‑1 (penilai) untuk {subordinates.length} karyawan. Alur form otomatis mengikuti data
            karyawan tersebut: Anda (Tier 1) → Tier 2 bila ditetapkan → konfirmasi karyawan → persetujuan Top
            Management bila ditetapkan.
          </div>
          {myDrafts.length > 0 && (
            <>
              <div className="section-label">Draft Anda (belum di-submit)</div>
              <FormsTable forms={myDrafts} />
            </>
          )}
        </div>
      )}

      {pending.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span>Menunggu Review Anda ({pending.length})</span>
          </div>
          <div className="alert alert-info">
            Form di bawah ini menunggu persetujuan Anda sebagai reviewer. Buka form untuk memberikan penilaian.
          </div>
          <FormsTable forms={pending} />
        </div>
      )}

      {teamForms.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span>Form Tim / Departemen Saya ({teamForms.length})</span>
          </div>
          <FormsTable forms={teamForms} filterable />
        </div>
      )}

      {toAcknowledge.length > 0 && (
        <div className="card">
          <div className="card-title">
            <span>Menunggu Konfirmasi Anda ({toAcknowledge.length})</span>
          </div>
          <div className="alert alert-ok">
            Penilaian Anda oleh atasan telah selesai. Buka form untuk melihat hasil dan tanda tangan konfirmasi.
          </div>
          <FormsTable forms={toAcknowledge} showEmployee={false} />
        </div>
      )}

      <div className="card">
        <div className="card-title">
          <span>Form Penilaian Saya</span>
        </div>
        <FormsTable forms={myForms} showEmployee={false} filterable />
      </div>
    </div>
  );
}
