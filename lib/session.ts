import { cookies } from "next/headers";
import { db, verifyToken, signToken } from "./db";

export const SESSION_COOKIE = "evalhr_session";
const SESSION_DAYS = 14;

export interface SessionUser {
  id: number;
  emp_no: string;
  name: string;
  email: string | null;
  role: "employee" | "admin";
  supervisor_id: number | null;
  position_name: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const [uid, exp] = payload.split(".");
  if (!uid || !exp || Date.now() > Number(exp)) return null;
  const row = db()
    .prepare(
      `SELECT e.id, e.emp_no, e.name, e.email, e.role, e.supervisor_id, p.name AS position_name
       FROM employees e LEFT JOIN positions p ON p.id = e.position_id
       WHERE e.id = ?`
    )
    .get(Number(uid)) as SessionUser | undefined;
  return row ?? null;
}

export function sessionCookie(userId: number) {
  const payload = `${userId}.${Date.now() + SESSION_DAYS * 86_400_000}`;
  return {
    name: SESSION_COOKIE,
    value: signToken(payload),
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  };
}
