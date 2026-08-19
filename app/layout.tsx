import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import "./globals.css";
import { getSessionUser } from "@/lib/session";
import { logoutAction } from "@/lib/actions";

export const metadata: Metadata = {
  title: "Form Penilaian Karyawan — PAT-F-HRD-13",
  description: "Sistem penilaian kinerja karyawan HRD",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="id">
      <body>
        {user ? <NavBar user={user} /> : null}
        {children}
      </body>
    </html>
  );
}

function NavBar({ user }: { user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>> }) {
  return (
    <nav className="nav no-print">
      <div className="nav-inner">
        <Link href="/" className="nav-brand">
          Penilaian Karyawan<span>PAT-F-HRD-13 Rev.06</span>
        </Link>
        <div className="nav-links">
          <Link href="/">Dashboard</Link>
          {user.role === "employee" && <Link href="/forms/new">Form Baru</Link>}
          {user.role === "admin" && <Link href="/admin/forms">Kelola Form</Link>}
          {user.role === "admin" && <Link href="/admin/employees">Karyawan</Link>}
        </div>
        <div className="nav-user">
          <b>{user.name}</b>
          <br />
          {user.emp_no}
          {user.role === "admin" ? " · Admin" : ""}
        </div>
        <form
          action={async () => {
            "use server";
            await logoutAction();
            redirect("/login");
          }}
        >
          <button className="btn btn-sm" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}>
            Keluar
          </button>
        </form>
      </div>
    </nav>
  );
}
