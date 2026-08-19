import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--brand)" }}>Form Penilaian Karyawan</div>
          <div className="muted small">PAT-F-HRD-13 Rev.06 — HR Department</div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
