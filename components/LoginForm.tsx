"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction, ActionResult } from "@/lib/actions";

const initial: ActionResult = { ok: false };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.push("/");
  }, [state.ok, router]);

  return (
    <form action={formAction}>
      <div className="field">
        <label>No. ID Karyawan</label>
        <input type="text" name="emp_no" required autoFocus placeholder="contoh: EMP-103" />
      </div>
      <div className="field">
        <label>Password</label>
        <input type="password" name="password" required />
      </div>
      {state.error && <div className="alert alert-error">{state.error}</div>}
      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={pending}>
        {pending ? "Memproses..." : "Masuk"}
      </button>
      <p className="muted small" style={{ marginTop: 16, marginBottom: 0 }}>
        Akun demo: EMP-103 (karyawan), EMP-102, EMP-101, MD-001 (reviewer), ADMIN (admin). Password awal sama dengan
        No. ID, kecuali ADMIN = admin123 dan MD-001 = md123.
      </p>
    </form>
  );
}
