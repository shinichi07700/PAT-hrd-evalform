import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return (
    <div className="login-wrap">
      <div className="login-shell">
        <div className="login-brand">PAT</div>
        <div className="login-card">
          <div className="login-head">
            <div className="login-title">Form Penilaian Karyawan</div>
            <div className="login-sub">PAT-F-HRD-13 Rev.06 &mdash; HR Department</div>
          </div>
          <LoginForm />
        </div>
        <div className="login-foot">&copy; Prima Agrotech &middot; Human Resource</div>
      </div>
    </div>
  );
}
