"use server";

import { cookies } from "next/headers";
import { db, verifyPassword, hashPassword } from "./db";
import { SESSION_COOKIE, sessionCookie, getSessionUser } from "./session";
import { buildReviewChain, getForm, currentTier } from "./repo";
import { ALL_ASPECTS, divisorFor } from "./scoring";

export interface ActionResult {
  ok: boolean;
  error?: string;
  formId?: number;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function loginAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const empNo = String(formData.get("emp_no") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!empNo || !password) return { ok: false, error: "No. ID dan password wajib diisi." };
  const row = db().prepare("SELECT id, password_hash FROM employees WHERE emp_no = ?").get(empNo);
  if (!row || !verifyPassword(password, (row as any).password_hash)) {
    return { ok: false, error: "No. ID atau password salah." };
  }
  const store = await cookies();
  const c = sessionCookie((row as any).id);
  store.set(c.name, c.value, { httpOnly: c.httpOnly, sameSite: c.sameSite, path: c.path, maxAge: c.maxAge });
  return { ok: true };
}

export async function logoutAction() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// ---------------------------------------------------------------------------
// Form input
// ---------------------------------------------------------------------------
export interface FormInput {
  formId: number | null;
  period_start: string;
  period_end: string;
  scores: Record<number, number>;
  notes: string;
}

function validateFormInput(user: { id: number; role: string }, input: FormInput, isManagerial: boolean): string | null {
  if (!input.period_start || !input.period_end) return "Periode penilaian wajib diisi.";
  if (input.period_start > input.period_end) return "Tanggal mulai periode harus sebelum tanggal selesai.";
  const required = divisorFor(isManagerial);
  const filled = ALL_ASPECTS.filter((a) => (isManagerial || a.no <= 18) && input.scores[a.no]).length;
  if (filled < required) return `Seluruh aspek penilaian (1–${required}) wajib diberi nilai.`;
  for (const [no, s] of Object.entries(input.scores)) {
    if (s !== undefined && !(s >= 1 && s <= 5)) return `Nilai aspek ${no} tidak valid.`;
  }
  return null;
}

function persistFormContent(formId: number, input: FormInput) {
  const d = db();
  const delScores = d.prepare("DELETE FROM scores WHERE form_id = ?");
  const insScore = d.prepare("INSERT INTO scores (form_id, aspect_no, score) VALUES (?, ?, ?)");
  delScores.run(formId);
  for (const a of ALL_ASPECTS) {
    const s = input.scores[a.no];
    if (s) insScore.run(formId, a.no, s);
  }
  // treatment diisi oleh reviewer tier 2, bukan bagian dari input karyawan
  d.prepare("UPDATE forms SET period_start = ?, period_end = ?, notes = ? WHERE id = ?").run(
    input.period_start,
    input.period_end,
    input.notes || null,
    formId
  );
}

async function getOwnedDraft(input: FormInput) {
  const user = await getSessionUser();
  if (!user || user.role !== "employee") return { error: "Hanya karyawan yang dapat mengisi form." };
  const emp = db()
    .prepare(
      `SELECT e.id, COALESCE(p.is_managerial, 0) AS is_managerial
       FROM employees e LEFT JOIN positions p ON p.id = e.position_id WHERE e.id = ?`
    )
    .get(user.id) as { id: number; is_managerial: number };

  let formId = input.formId;
  if (formId) {
    const form = getForm(formId);
    if (!form || form.employee_id !== user.id) return { error: "Form tidak ditemukan." };
    if (form.status !== "draft" && form.status !== "returned") return { error: "Form sudah tidak dapat diubah." };
  } else {
    const res = db()
      .prepare("INSERT INTO forms (employee_id, period_start, period_end, status) VALUES (?, ?, ?, 'draft')")
      .run(user.id, input.period_start || "", input.period_end || "");
    formId = Number(res.lastInsertRowid);
  }
  return { formId, isManagerial: !!emp.is_managerial };
}

export async function saveDraftAction(input: FormInput): Promise<ActionResult> {
  const owned = await getOwnedDraft(input);
  if (owned.error || !owned.formId) return { ok: false, error: owned.error ?? "Gagal menyimpan." };
  persistFormContent(owned.formId, input);
  return { ok: true, formId: owned.formId };
}

export async function submitFormAction(input: FormInput & { signature: string }): Promise<ActionResult> {
  if (!input.signature) return { ok: false, error: "Tanda tangan wajib dibuat sebelum submit." };
  const owned = await getOwnedDraft(input);
  if (owned.error || !owned.formId) return { ok: false, error: owned.error ?? "Gagal submit." };
  const err = validateFormInput({ id: 0, role: "employee" }, input, owned.isManagerial ?? false);
  if (err) return { ok: false, error: err };

  const formId = owned.formId;
  persistFormContent(formId, input);

  const user = (await getSessionUser())!;
  const chain = buildReviewChain(user.id);
  db()
    .prepare(
      `UPDATE forms
       SET employee_signature = ?, employee_signed_at = datetime('now'),
           status = 'review1', submitted_at = datetime('now'),
           reviewer1_id = ?, reviewer2_id = ?, reviewer3_id = ?
       WHERE id = ?`
    )
    .run(input.signature, chain[0] ?? null, chain[1] ?? null, chain[2] ?? null, formId);

  // If the chain is empty (no reviewers at all), complete immediately
  if (chain.length === 0) {
    db().prepare("UPDATE forms SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(formId);
  }
  return { ok: true, formId };
}

// ---------------------------------------------------------------------------
// Review workflow
// ---------------------------------------------------------------------------
export async function reviewAction(input: {
  formId: number;
  decision: "approve" | "return";
  comment: string;
  signature: string;
  treatments?: string[];
  treatment_other?: string;
}): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Silakan login kembali." };
  const form = getForm(input.formId);
  if (!form) return { ok: false, error: "Form tidak ditemukan." };
  const tier = currentTier(form);
  if (!tier) return { ok: false, error: "Form ini tidak sedang menunggu review." };
  const expected = tier === 1 ? form.reviewer1_id : tier === 2 ? form.reviewer2_id : form.reviewer3_id;
  if (expected !== user.id) return { ok: false, error: "Anda bukan reviewer untuk tahap ini." };
  if (input.decision === "approve" && !input.signature) return { ok: false, error: "Tanda tangan wajib dibuat untuk menyetujui." };

  db()
    .prepare(
      "INSERT INTO reviews (form_id, tier, reviewer_id, action, comment, signature) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(form.id, tier, user.id, input.decision === "approve" ? "approved" : "returned", input.comment || null, input.signature || null);

  if (input.decision === "return") {
    db().prepare("UPDATE forms SET status = 'returned' WHERE id = ?").run(form.id);
    return { ok: true, formId: form.id };
  }

  // Treatment diisi oleh reviewer tier 2 (atau approver terakhir bila tier 2 tidak ada)
  if (input.treatments) {
    const d = db();
    d.prepare("DELETE FROM treatments WHERE form_id = ?").run(form.id);
    const insTr = d.prepare("INSERT OR IGNORE INTO treatments (form_id, treatment) VALUES (?, ?)");
    for (const t of input.treatments) insTr.run(form.id, t);
    d.prepare("UPDATE forms SET treatment_other = ? WHERE id = ?").run(input.treatment_other || null, form.id);
  }

  const next = tier === 1 ? form.reviewer2_id : tier === 2 ? form.reviewer3_id : null;
  if (next) {
    db().prepare(`UPDATE forms SET status = 'review${tier + 1}' WHERE id = ?`).run(form.id);
  } else {
    db().prepare("UPDATE forms SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(form.id);
  }
  return { ok: true, formId: form.id };
}

// ---------------------------------------------------------------------------
// Admin: employees
// ---------------------------------------------------------------------------
export interface EmployeeInput {
  id: number | null;
  emp_no: string;
  name: string;
  position_id: number | null;
  join_date: string;
  supervisor_id: number | null;
  is_top_management: boolean;
  new_password: string;
}

export async function saveEmployeeAction(input: EmployeeInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Akses ditolak." };
  if (!input.emp_no.trim() || !input.name.trim()) return { ok: false, error: "No. ID dan nama wajib diisi." };
  const d = db();
  try {
    if (input.id) {
      d.prepare(
        `UPDATE employees SET emp_no = ?, name = ?, position_id = ?, join_date = ?, supervisor_id = ?, is_top_management = ?
         WHERE id = ?`
      ).run(
        input.emp_no.trim(), input.name.trim(), input.position_id, input.join_date || null,
        input.supervisor_id, input.is_top_management ? 1 : 0, input.id
      );
      if (input.new_password) {
        d.prepare("UPDATE employees SET password_hash = ? WHERE id = ?").run(hashPassword(input.new_password), input.id);
      }
      return { ok: true };
    }
    const password = input.new_password || input.emp_no.trim();
    const res = d.prepare(
      `INSERT INTO employees (emp_no, name, position_id, join_date, supervisor_id, is_top_management, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'employee')`
    ).run(
      input.emp_no.trim(), input.name.trim(), input.position_id, input.join_date || null,
      input.supervisor_id, input.is_top_management ? 1 : 0, hashPassword(password)
    );
    return { ok: true, formId: Number(res.lastInsertRowid) };
  } catch (e: any) {
    if (String(e?.message).includes("UNIQUE")) return { ok: false, error: "No. ID sudah terdaftar." };
    return { ok: false, error: "Gagal menyimpan karyawan." };
  }
}

export async function deleteEmployeeAction(id: number): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Akses ditolak." };
  try {
    db().prepare("DELETE FROM employees WHERE id = ?").run(id);
    return { ok: true };
  } catch {
    return { ok: false, error: "Tidak dapat dihapus: karyawan memiliki form atau menjadi atasan karyawan lain." };
  }
}

// ---------------------------------------------------------------------------
// Admin: forms
// ---------------------------------------------------------------------------
export async function deleteFormAction(formId: number): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Akses ditolak." };
  db().prepare("DELETE FROM forms WHERE id = ?").run(formId);
  return { ok: true };
}

export async function setFormReviewersAction(
  formId: number,
  r1: number | null,
  r2: number | null,
  r3: number | null
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Akses ditolak." };
  db()
    .prepare("UPDATE forms SET reviewer1_id = ?, reviewer2_id = ?, reviewer3_id = ? WHERE id = ?")
    .run(r1, r2, r3, formId);
  return { ok: true };
}

export async function resetFormAction(formId: number): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Akses ditolak." };
  db()
    .prepare(
      `UPDATE forms SET status = 'draft', employee_signature = NULL, employee_signed_at = NULL,
       submitted_at = NULL, completed_at = NULL WHERE id = ?`
    )
    .run(formId);
  return { ok: true };
}
