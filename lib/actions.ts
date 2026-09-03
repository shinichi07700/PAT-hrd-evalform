"use server";

import { cookies } from "next/headers";
import { db, tx, verifyPassword, hashPassword } from "./db";
import { SESSION_COOKIE, sessionCookie, getSessionUser } from "./session";
import { resolveChain, isDescendant, getForm, currentTier } from "./repo";
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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Email dan password wajib diisi." };
  const row = db().prepare("SELECT id, password_hash FROM employees WHERE email = ?").get(email);
  if (!row || !verifyPassword(password, (row as any).password_hash)) {
    return { ok: false, error: "Email atau password salah." };
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
  employeeId?: number | null;
  period_start: string;
  period_end: string;
  scores: Record<number, number>;
  notes: string;
}

function validateFormInput(user: { id: number; role: string }, input: FormInput, isManagerial: boolean): string | null {
  if (!input.period_start || !input.period_end) return "Periode penilaian wajib diisi.";
  if (!input.notes || !input.notes.trim()) return "Catatan tambahan wajib diisi oleh penilai.";
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
  tx(() => {
    const d = db();
    const delScores = d.prepare("DELETE FROM scores WHERE form_id = ?");
    const insScore = d.prepare("INSERT INTO scores (form_id, aspect_no, score) VALUES (?, ?, ?)");
    delScores.run(formId);
    for (const a of ALL_ASPECTS) {
      const s = input.scores[a.no];
      if (s) insScore.run(formId, a.no, s);
    }
    d.prepare("UPDATE forms SET period_start = ?, period_end = ?, notes = ? WHERE id = ?").run(
      input.period_start,
      input.period_end,
      input.notes || null,
      formId
    );
  });
  // catatan: treatment TIDAK diisi di sini — treatment ditetapkan reviewer Tier 2 (lihat reviewAction)
}

async function getEvaluatorDraft(input: FormInput) {
  const user = await getSessionUser();
  if (!user || user.role !== "employee") return { error: "Hanya atasan/penilai yang dapat mengisi form." };

  let formId = input.formId;
  let employeeId: number;
  if (formId) {
    const form = getForm(formId);
    if (!form || form.evaluator_id !== user.id) return { error: "Form tidak ditemukan." };
    if (form.status !== "draft") return { error: "Form sudah tidak dapat diubah." };
    employeeId = form.employee_id;
  } else {
    employeeId = input.employeeId ?? 0;
    if (!employeeId) return { error: "Pilih karyawan yang akan dinilai." };
    if (!isDescendant(user.id, employeeId)) return { error: "Anda hanya dapat menilai karyawan pada lini laporan Anda." };
    const res = db()
      .prepare("INSERT INTO forms (employee_id, evaluator_id, period_start, period_end, status) VALUES (?, ?, ?, ?, 'draft')")
      .run(employeeId, user.id, input.period_start || "", input.period_end || "");
    formId = Number(res.lastInsertRowid);
  }
  // jumlah aspek (18 vs 24) mengikuti jabatan karyawan yang DINILAI, bukan penilai
  const target = db()
    .prepare(
      `SELECT COALESCE(p.is_managerial, 0) AS is_managerial
       FROM employees e LEFT JOIN positions p ON p.id = e.position_id WHERE e.id = ?`
    )
    .get(employeeId) as { is_managerial: number } | undefined;
  return { formId, isManagerial: !!target?.is_managerial };
}

export async function saveDraftAction(input: FormInput): Promise<ActionResult> {
  const owned = await getEvaluatorDraft(input);
  if (owned.error || !owned.formId) return { ok: false, error: owned.error ?? "Gagal menyimpan." };
  persistFormContent(owned.formId, input);
  return { ok: true, formId: owned.formId };
}

// Tier 2 reviewer dapat memperbaiki isi form (nilai/catatan/periode) kiriman Tier 1
// sebelum menyetujuinya. Status tetap review2; treatment disimpan lewat reviewAction.
export async function saveReviewEditAction(input: FormInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "employee") return { ok: false, error: "Aksi khusus akun karyawan." };
  if (!input.formId) return { ok: false, error: "Form tidak ditemukan." };
  const form = getForm(input.formId);
  if (!form || form.status !== "review2" || form.reviewer2_id !== user.id) {
    return { ok: false, error: "Hanya reviewer Tier 2 yang dapat mengubah form pada tahap ini." };
  }
  const target = db()
    .prepare(
      `SELECT COALESCE(p.is_managerial, 0) AS is_managerial
       FROM employees e LEFT JOIN positions p ON p.id = e.position_id WHERE e.id = ?`
    )
    .get(form.employee_id) as { is_managerial: number } | undefined;
  const err = validateFormInput(user, input, !!target?.is_managerial);
  if (err) return { ok: false, error: err };
  persistFormContent(form.id, input);
  // tandai aspek yang direvisi Tier 2 dibanding nilai asli kiriman Tier 1
  if (form.original_scores) {
    try {
      const orig = JSON.parse(form.original_scores) as Record<string, number>;
      const changed = Object.keys({ ...orig, ...input.scores })
        .map(Number)
        .filter((n) => (input.scores[n] ?? null) !== (orig[n] ?? null));
      tx(() => db().prepare("UPDATE forms SET tier2_edits = ? WHERE id = ?").run(JSON.stringify(changed), form.id));
    } catch {
      /* snapshot rusak — lewati penandaan */
    }
  }
  return { ok: true, formId: form.id };
}

export async function submitFormAction(input: FormInput & { signature: string }): Promise<ActionResult> {
  if (!input.signature) return { ok: false, error: "Tanda tangan penilai wajib dibuat sebelum submit." };
  const owned = await getEvaluatorDraft(input);
  if (owned.error || !owned.formId) return { ok: false, error: owned.error ?? "Gagal submit." };
  const err = validateFormInput({ id: 0, role: "employee" }, input, owned.isManagerial ?? false);
  if (err) return { ok: false, error: err };

  const formId = owned.formId;
  const user = (await getSessionUser())!;
  const { t2, mdFinal } = resolveChain(user.id);
  const nextStatus = t2 ? "review2" : "awaiting_ack";
  tx(() => {
    persistFormContent(formId, input);
    db()
      .prepare(
        `UPDATE forms
         SET employee_signature = ?, employee_signed_at = datetime('now'),
             status = ?, submitted_at = datetime('now'),
             reviewer1_id = ?, reviewer2_id = ?, reviewer3_id = ?,
             original_scores = ?, tier2_edits = NULL
         WHERE id = ?`
      )
      .run(input.signature, nextStatus, user.id, t2, mdFinal, JSON.stringify(input.scores), formId);
  });

  return { ok: true, formId };
}

// ---------------------------------------------------------------------------
// Review workflow — reviewer selalu menyetujui (dengan catatan opsional);
// tidak ada status reject karena Tier 2 dapat langsung memperbaiki form.
// ---------------------------------------------------------------------------
export async function reviewAction(input: {
  formId: number;
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
  const expected = tier === 2 ? form.reviewer2_id : form.reviewer3_id;
  if (expected !== user.id) return { ok: false, error: "Anda bukan reviewer untuk tahap ini." };
  if (!input.signature) return { ok: false, error: "Tanda tangan wajib dibuat untuk menyetujui." };
  // komentar wajib untuk Tier 2 (catatan penilaian), opsional untuk MD
  if (tier === 2 && !input.comment.trim()) return { ok: false, error: "Komentar / catatan review wajib diisi oleh reviewer Tier 2." };

  db()
    .prepare(
      "INSERT INTO reviews (form_id, tier, reviewer_id, action, comment, signature) VALUES (?, ?, ?, 'approved', ?, ?)"
    )
    .run(form.id, tier, user.id, input.comment || null, input.signature);

  if (tier === 2) {
    // Tier 2 yang menetapkan treatment saat menyetujui
    tx(() => {
      db().prepare("DELETE FROM treatments WHERE form_id = ?").run(form.id);
      const insTr = db().prepare("INSERT OR IGNORE INTO treatments (form_id, treatment) VALUES (?, ?)");
      for (const t of input.treatments ?? []) insTr.run(form.id, t);
      db().prepare("UPDATE forms SET treatment_other = ? WHERE id = ?").run(input.treatment_other || null, form.id);
      db().prepare("UPDATE forms SET status = 'awaiting_ack' WHERE id = ?").run(form.id);
    });
  } else {
    db().prepare("UPDATE forms SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(form.id);
  }
  return { ok: true, formId: form.id };
}

// ---------------------------------------------------------------------------
// Employee acknowledgment: karyawan melihat hasil & tanda tangan konfirmasi
// ---------------------------------------------------------------------------
export async function acknowledgeAction(input: { formId: number; signature: string }): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Silakan login kembali." };
  if (!input.signature) return { ok: false, error: "Tanda tangan wajib dibuat untuk mengonfirmasi." };
  const form = getForm(input.formId);
  if (!form) return { ok: false, error: "Form tidak ditemukan." };
  if (form.employee_id !== user.id) return { ok: false, error: "Hanya karyawan yang dinilai yang dapat mengonfirmasi." };
  if (form.status !== "awaiting_ack") return { ok: false, error: "Form ini tidak sedang menunggu konfirmasi." };

  db()
    .prepare(
      "INSERT INTO reviews (form_id, tier, reviewer_id, action, comment, signature) VALUES (?, 0, ?, 'acknowledged', NULL, ?)"
    )
    .run(form.id, user.id, input.signature);

  tx(() => {
    if (form.reviewer3_id) {
      // masih menunggu tanda tangan MD sebagai approver terakhir
      db()
        .prepare("UPDATE forms SET ack_signature = ?, ack_at = datetime('now'), status = 'review3' WHERE id = ?")
        .run(input.signature, form.id);
    } else {
      db()
        .prepare(
          "UPDATE forms SET ack_signature = ?, ack_at = datetime('now'), status = 'completed', completed_at = datetime('now') WHERE id = ?"
        )
        .run(input.signature, form.id);
    }
  });
  return { ok: true, formId: form.id };
}

// ---------------------------------------------------------------------------
// Admin: employees
// ---------------------------------------------------------------------------
export interface EmployeeInput {
  id: number | null;
  emp_no: string;
  name: string;
  email: string;
  position_id: number | null;
  join_date: string;
  supervisor_id: number | null;
  new_password: string;
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export async function saveEmployeeAction(input: EmployeeInput): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Akses ditolak." };
  if (!input.emp_no.trim() || !input.name.trim()) return { ok: false, error: "No. ID dan nama wajib diisi." };
  const email = input.email.trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: "Email wajib diisi dengan format yang benar." };
  const d = db();
  try {
    if (input.id) {
      tx(() => {
        d.prepare(
          `UPDATE employees SET emp_no = ?, name = ?, email = ?, position_id = ?, join_date = ?, supervisor_id = ?
           WHERE id = ?`
        ).run(
          input.emp_no.trim(), input.name.trim(), email, input.position_id, input.join_date || null,
          input.supervisor_id, input.id
        );
        if (input.new_password) {
          d.prepare("UPDATE employees SET password_hash = ? WHERE id = ?").run(hashPassword(input.new_password), input.id);
        }
      });
      return { ok: true };
    }
    const password = input.new_password || input.emp_no.trim();
    const res = d.prepare(
      `INSERT INTO employees (emp_no, name, email, position_id, join_date, supervisor_id, password_hash, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'employee')`
    ).run(
      input.emp_no.trim(), input.name.trim(), email, input.position_id, input.join_date || null,
      input.supervisor_id, hashPassword(password)
    );
    return { ok: true, formId: Number(res.lastInsertRowid) };
  } catch (e: any) {
    const msg = String(e?.message ?? "");
    if (msg.includes("idx_employees_email") || msg.toLowerCase().includes("email")) return { ok: false, error: "Email sudah terdaftar." };
    if (msg.includes("UNIQUE")) return { ok: false, error: "No. ID sudah terdaftar." };
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
  r2: number | null,
  r3: number | null
): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Akses ditolak." };
  db()
    .prepare("UPDATE forms SET reviewer2_id = ?, reviewer3_id = ? WHERE id = ?")
    .run(r2, r3, formId);
  return { ok: true };
}

export async function resetFormAction(formId: number): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Akses ditolak." };
  db()
    .prepare(
      `UPDATE forms SET status = 'draft', employee_signature = NULL, employee_signed_at = NULL,
       ack_signature = NULL, ack_at = NULL,
       submitted_at = NULL, completed_at = NULL WHERE id = ?`
    )
    .run(formId);
  return { ok: true };
}
