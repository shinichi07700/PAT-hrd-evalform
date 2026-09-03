"use client";

import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { loginAction, ActionResult } from "@/lib/actions";

const initial: ActionResult = { ok: false };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) {
      router.push("/");
      return;
    }
    if (state.error) {
      // email tetap terisi — hanya password yang dikosongkan
      setPassword("");
      passRef.current?.focus();
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <div className="field">
        <label>Email</label>
        <input
          type="email"
          name="email"
          required
          autoFocus
          placeholder="contoh: emp103@primaagrotech.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Password</label>
        <input
          type="password"
          name="password"
          required
          ref={passRef}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {state.error && <div className="alert alert-error">{state.error}</div>}
      <button className="btn-login" type="submit" disabled={pending}>
        {pending ? "Memproses..." : "Masuk"}
      </button>
      <p className="login-hint">
        Masuk dengan email kantor Anda. Password awal sama dengan No. ID karyawan.
      </p>
    </form>
  );
}
