import { db } from "./db";

// Typed query helpers (node:sqlite returns Record<string, SQLOutputValue>)
// NOTE: rows are spread into plain objects — node:sqlite yields null-prototype
// objects which React refuses to serialize into Client Components.
function q1<T>(sql: string, ...params: (number | string | null)[]): T | null {
  const row = db().prepare(sql).get(...params);
  return row ? ({ ...row } as unknown as T) : null;
}
function qAll<T>(sql: string, ...params: (number | string | null)[]): T[] {
  return (db().prepare(sql).all(...params) as unknown as T[]).map((r) => ({ ...r }));
}

// ---------------------------------------------------------------------------
// Employees & positions
// ---------------------------------------------------------------------------
export interface EmployeeRow {
  id: number;
  emp_no: string;
  name: string;
  email: string | null;
  position_id: number | null;
  join_date: string | null;
  supervisor_id: number | null;
  tier1_id: number | null;
  tier2_id: number | null;
  top_mgmt_id: number | null;
  role: string;
  department: string | null;
  division: string | null;
  position_name: string | null;
  is_managerial: number;
  supervisor_name: string | null;
  tier1_name: string | null;
  tier2_name: string | null;
  top_mgmt_name: string | null;
}

const EMPLOYEE_SELECT = `
  SELECT e.id, e.emp_no, e.name, e.email, e.position_id, e.join_date, e.supervisor_id,
         e.tier1_id, e.tier2_id, e.top_mgmt_id,
         e.role,
         p.department, p.division, p.name AS position_name, p.is_managerial,
         s.name AS supervisor_name,
         t1.name AS tier1_name, t2.name AS tier2_name, tm.name AS top_mgmt_name
  FROM employees e
  LEFT JOIN positions p ON p.id = e.position_id
  LEFT JOIN employees s ON s.id = e.supervisor_id
  LEFT JOIN employees t1 ON t1.id = e.tier1_id
  LEFT JOIN employees t2 ON t2.id = e.tier2_id
  LEFT JOIN employees tm ON tm.id = e.top_mgmt_id`;

export function getEmployee(id: number): EmployeeRow | null {
  return q1<EmployeeRow>(`${EMPLOYEE_SELECT} WHERE e.id = ?`, id);
}

export function getEmployeeByEmpNo(empNo: string): EmployeeRow | null {
  return q1<EmployeeRow>(`${EMPLOYEE_SELECT} WHERE e.emp_no = ?`, empNo);
}

export function getEmployeeByEmail(email: string): EmployeeRow | null {
  return q1<EmployeeRow>(`${EMPLOYEE_SELECT} WHERE e.email = ?`, email.trim().toLowerCase());
}

export function listEmployees(): EmployeeRow[] {
  return qAll<EmployeeRow>(`${EMPLOYEE_SELECT} ORDER BY e.emp_no`);
}

// The evaluator's own list: employees whose stored Tier-1 is this manager
// (the Google Sheet is the source of truth — "his list", not a tree guess).
export function listSubordinates(managerId: number): EmployeeRow[] {
  return qAll<EmployeeRow>(
    `${EMPLOYEE_SELECT} WHERE e.tier1_id = ? AND e.id <> ? ORDER BY e.name`,
    managerId,
    managerId
  );
}

export function listPositions() {
  return qAll<{ id: number; department: string; division: string; name: string; is_managerial: number }>(
    "SELECT id, department, division, name, is_managerial FROM positions ORDER BY department, division, name"
  );
}

// ---------------------------------------------------------------------------
// Review chain — READ from the assessed employee's stored tier columns
// (imported verbatim from the Google Sheet). No derivation from hierarchy.
//   tier2_id    = NULL  → form skips Tier 2 (goes straight to acknowledgment)
//   top_mgmt_id = NULL  → form completes right after acknowledgment
// The MD (Top Management) is still the org-tree root for display purposes.
// ---------------------------------------------------------------------------
export function getTopManagementId(): number | null {
  const row = db()
    .prepare("SELECT id FROM employees WHERE role = 'employee' AND supervisor_id IS NULL AND tier1_id IS NULL ORDER BY id LIMIT 1")
    .get() as { id: number } | undefined;
  return row?.id ?? null;
}

export function chainForEmployee(
  employeeId: number | null
): { t1: number | null; t2: number | null; tm: number | null } {
  const e = employeeId
    ? (db().prepare("SELECT tier1_id, tier2_id, top_mgmt_id FROM employees WHERE id = ?").get(employeeId) as any)
    : null;
  return {
    t1: e?.tier1_id ?? null,
    t2: e?.tier2_id ?? null,
    tm: e?.top_mgmt_id ?? null,
  };
}

// All direct + indirect reports following the stored Tier-1 links. Depth-capped
// to avoid infinite recursion on accidental cycles.
export function descendantEmployeeIds(managerId: number): number[] {
  const rows = qAll<{ id: number }>(
    `WITH RECURSIVE sub(id, depth) AS (
       SELECT id, 1 FROM employees WHERE tier1_id = ? AND id <> ?
       UNION ALL
       SELECT e.id, s.depth + 1 FROM employees e
       JOIN sub s ON e.tier1_id = s.id
       WHERE s.depth < 20 AND e.id <> ?
     )
     SELECT DISTINCT id FROM sub`,
    managerId,
    managerId,
    managerId
  );
  return rows.map((r) => r.id);
}

export function isDescendant(managerId: number, employeeId: number): boolean {
  return descendantEmployeeIds(managerId).includes(employeeId);
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
export interface FormRow {
  id: number;
  employee_id: number;
  evaluator_id: number | null;
  period_start: string;
  period_end: string;
  status: string;
  reviewer1_id: number | null;
  reviewer2_id: number | null;
  reviewer3_id: number | null;
  employee_signature: string | null;
  employee_signed_at: string | null;
  ack_signature: string | null;
  ack_at: string | null;
  treatment_other: string | null;
  notes: string | null;
  original_scores?: string | null; // JSON snapshot nilai kiriman Tier 1
  tier2_edits?: string | null; // JSON array of aspect_no changed by Tier 2
  created_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  // joined
  emp_no?: string;
  employee_name?: string;
  evaluator_name?: string | null;
  evaluator_emp_no?: string | null;
  department?: string | null;
  division?: string | null;
  position_name?: string | null;
  is_managerial?: number;
  join_date?: string | null;
}

export interface ReviewRow {
  id: number;
  form_id: number;
  tier: number;
  reviewer_id: number;
  action: "approved" | "returned" | "acknowledged";
  comment: string | null;
  signature: string | null;
  acted_at: string;
  reviewer_name?: string;
  reviewer_emp_no?: string;
  reviewer_position?: string | null;
}

export function getForm(id: number): FormRow | null {
  return q1<FormRow>(
    `SELECT f.*, e.emp_no, e.name AS employee_name, e.join_date,
            ev.name AS evaluator_name, ev.emp_no AS evaluator_emp_no,
            p.department, p.division, p.name AS position_name, p.is_managerial
     FROM forms f
     JOIN employees e ON e.id = f.employee_id
     LEFT JOIN employees ev ON ev.id = f.evaluator_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE f.id = ?`,
    id
  );
}

export function getFormScores(formId: number): Record<number, number> {
  const rows = qAll<{ aspect_no: number; score: number }>(
    "SELECT aspect_no, score FROM scores WHERE form_id = ?",
    formId
  );
  const out: Record<number, number> = {};
  for (const r of rows) out[r.aspect_no] = r.score;
  return out;
}

export function getFormTreatments(formId: number): string[] {
  return qAll<{ treatment: string }>("SELECT treatment FROM treatments WHERE form_id = ?", formId).map(
    (r) => r.treatment
  );
}

export function getFormReviews(formId: number): ReviewRow[] {
  return qAll<ReviewRow>(
    `SELECT r.*, e.name AS reviewer_name, e.emp_no AS reviewer_emp_no, p.name AS reviewer_position
     FROM reviews r
     JOIN employees e ON e.id = r.reviewer_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE r.form_id = ?
     ORDER BY r.acted_at, r.id`,
    formId
  );
}

export function getReviewerNames(form: FormRow): { tier: number; id: number | null; name: string | null }[] {
  const d = db();
  const nameOf = (id: number | null) =>
    id == null ? null : ((d.prepare("SELECT name FROM employees WHERE id = ?").get(id) as any)?.name ?? null);
  return [
    { tier: 1, id: form.reviewer1_id, name: nameOf(form.reviewer1_id) },
    { tier: 2, id: form.reviewer2_id, name: nameOf(form.reviewer2_id) },
    { tier: 3, id: form.reviewer3_id, name: nameOf(form.reviewer3_id) },
  ];
}

// Which tier is currently pending for this form (based on status)
export function currentTier(form: FormRow): number | null {
  if (form.status === "review1") return 1;
  if (form.status === "review2") return 2;
  if (form.status === "review3") return 3;
  return null;
}

export function currentReviewerId(form: FormRow): number | null {
  const t = currentTier(form);
  if (t === 1) return form.reviewer1_id;
  if (t === 2) return form.reviewer2_id;
  if (t === 3) return form.reviewer3_id;
  return null;
}

export function formsForEmployee(employeeId: number): FormRow[] {
  return qAll<FormRow>(
    `SELECT f.*, e.emp_no, e.name AS employee_name, p.name AS position_name, p.is_managerial
     FROM forms f JOIN employees e ON e.id = f.employee_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE f.employee_id = ? ORDER BY f.created_at DESC`,
    employeeId
  );
}

export function pendingReviewsFor(reviewerId: number): FormRow[] {
  return qAll<FormRow>(
    `SELECT f.*, e.emp_no, e.name AS employee_name, e.join_date,
            ev.name AS evaluator_name, ev.emp_no AS evaluator_emp_no,
            p.department, p.division, p.name AS position_name, p.is_managerial
     FROM forms f JOIN employees e ON e.id = f.employee_id
     LEFT JOIN employees ev ON ev.id = f.evaluator_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE ((f.status = 'review2' AND f.reviewer2_id = ?)
        OR  (f.status = 'review3' AND f.reviewer3_id = ?))
     ORDER BY f.submitted_at`,
    reviewerId,
    reviewerId
  );
}

// Forms of everyone in the manager's reporting subtree (direct + indirect
// reports, following the stored Tier-1 links).
export function teamFormsFor(managerId: number): FormRow[] {
  return qAll<FormRow>(
    `WITH RECURSIVE sub(id, depth) AS (
       SELECT id, 1 FROM employees WHERE tier1_id = ? AND id <> ?
       UNION ALL
       SELECT e.id, s.depth + 1 FROM employees e
       JOIN sub s ON e.tier1_id = s.id
       WHERE s.depth < 20 AND e.id <> ?
     )
     SELECT f.*, e.emp_no, e.name AS employee_name, e.join_date,
            ev.name AS evaluator_name, ev.emp_no AS evaluator_emp_no,
            p.department, p.division, p.name AS position_name, p.is_managerial
     FROM forms f JOIN employees e ON e.id = f.employee_id
     LEFT JOIN employees ev ON ev.id = f.evaluator_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE f.employee_id IN (SELECT id FROM sub)
     ORDER BY f.created_at DESC`,
    managerId,
    managerId,
    managerId
  );
}

// Draft forms the evaluator has started but not yet submitted.
export function draftsByEvaluator(evaluatorId: number): FormRow[] {
  return qAll<FormRow>(
    `SELECT f.*, e.emp_no, e.name AS employee_name, e.join_date,
            ev.name AS evaluator_name, ev.emp_no AS evaluator_emp_no,
            p.department, p.division, p.name AS position_name, p.is_managerial
     FROM forms f JOIN employees e ON e.id = f.employee_id
     LEFT JOIN employees ev ON ev.id = f.evaluator_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE f.evaluator_id = ? AND f.status = 'draft'
     ORDER BY f.created_at DESC`,
    evaluatorId
  );
}

export function allForms(filters: { status?: string; q?: string } = {}): FormRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.status && filters.status !== "all") {
    where.push("f.status = ?");
    params.push(filters.status);
  }
  if (filters.q) {
    where.push("(e.name LIKE ? OR e.emp_no LIKE ?)");
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  const sql = `
    SELECT f.*, e.emp_no, e.name AS employee_name, e.join_date,
           p.department, p.division, p.name AS position_name, p.is_managerial
    FROM forms f JOIN employees e ON e.id = f.employee_id
    LEFT JOIN positions p ON p.id = e.position_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY f.created_at DESC`;
  return qAll<FormRow>(sql, ...params);
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  review1: "Review Tier 1",
  review2: "Review Tier 2",
  review3: "Review Top Management",
  awaiting_ack: "Menunggu Konfirmasi Karyawan",
  completed: "Completed",
  returned: "Returned",
};
