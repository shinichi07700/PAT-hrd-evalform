import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import "./globals.css";
import { getSessionUser } from "@/lib/session";
import { logoutAction } from "@/lib/actions";
import { listSubordinates } from "@/lib/repo";

export const metadata: Metadata = {
  title: "Form Penilaian Karyawan — PAT-F-HRD-13",
  description: "Sistem penilaian kinerja karyawan HRD PT. Prima Agro Tech",
};

// warna address bar / UI mobile mengikuti warna identitas
export const viewport: Viewport = { themeColor: "#14532d" };

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
          <img src="/brand/logo-mark.png" alt="" className="nav-logo" width={2000} height={1993} />
          <span className="nav-brand-text">
            <b>PT. Prima Agro Tech</b>
            <small>Form Penilaian Karyawan · PAT-F-HRD-13 Rev.06</small>
          </span>
        </Link>
        <div className="nav-links">
          <Link href="/">Dashboard</Link>
          {user.role === "employee" && listSubordinates(user.id).length > 0 && (
            <Link href="/forms/new">Nilai Karyawan</Link>
          )}
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
          <button className="btn btn-sm btn-nav">Keluar</button>
        </form>
      </div>
    </nav>
  );
}
