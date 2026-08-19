import { db } from "./db";

// Typed query helpers (node:sqlite returns Record<string, SQLOutputValue>)
function q1<T>(sql: string, ...params: (number | string | null)[]): T | null {
  return (db().prepare(sql).get(...params) as unknown as T) ?? null;
}
function qAll<T>(sql: string, ...params: (number | string | null)[]): T[] {
  return db().prepare(sql).all(...params) as unknown as T[];
}

// ---------------------------------------------------------------------------
// Employees & positions
// ---------------------------------------------------------------------------
export interface EmployeeRow {
  id: number;
  emp_no: string;
  name: string;
  position_id: number | null;
  join_date: string | null;
  supervisor_id: number | null;
  is_top_management: number;
  role: string;
  department: string | null;
  division: string | null;
  position_name: string | null;
  is_managerial: number;
  supervisor_name: string | null;
}

const EMPLOYEE_SELECT = `
  SELECT e.id, e.emp_no, e.name, e.position_id, e.join_date, e.supervisor_id,
         e.is_top_management, e.role,
         p.department, p.division, p.name AS position_name, p.is_managerial,
         s.name AS supervisor_name
  FROM employees e
  LEFT JOIN positions p ON p.id = e.position_id
  LEFT JOIN employees s ON s.id = e.supervisor_id`;

export function getEmployee(id: number): EmployeeRow | null {
  return q1<EmployeeRow>(`${EMPLOYEE_SELECT} WHERE e.id = ?`, id);
}

export function getEmployeeByEmpNo(empNo: string): EmployeeRow | null {
  return q1<EmployeeRow>(`${EMPLOYEE_SELECT} WHERE e.emp_no = ?`, empNo);
}

export function listEmployees(): EmployeeRow[] {
  return qAll<EmployeeRow>(`${EMPLOYEE_SELECT} ORDER BY e.emp_no`);
}

export function listPositions() {
  return qAll<{ id: number; department: string; division: string; name: string; is_managerial: number }>(
    "SELECT id, department, division, name, is_managerial FROM positions ORDER BY department, division, name"
  );
}

// ---------------------------------------------------------------------------
// Review chain: direct supervisor -> next supervisor -> top management (MD),
// max 3 tiers; the final approver is always the top management user.
// ---------------------------------------------------------------------------
export function buildReviewChain(employeeId: number): number[] {
  const d = db();
  const supervisorOf = (id: number): number | null =>
    (d.prepare("SELECT supervisor_id FROM employees WHERE id = ?").get(id) as any)?.supervisor_id ?? null;

  const top = (d.prepare("SELECT id FROM employees WHERE is_top_management = 1 ORDER BY id LIMIT 1").get() as any)?.id as
    | number
    | undefined;

  const chain: number[] = [];
  const seen = new Set<number>([employeeId]);
  let cur = supervisorOf(employeeId);
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    if (cur === top) break;
    cur = supervisorOf(cur);
  }
  // last tier must be top management
  if (top && !seen.has(top)) {
    if (chain.length >= 3) chain[2] = top;
    else chain.push(top);
  }
  return chain.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
export interface FormRow {
  id: number;
  employee_id: number;
  period_start: string;
  period_end: string;
  status: string;
  reviewer1_id: number | null;
  reviewer2_id: number | null;
  reviewer3_id: number | null;
  employee_signature: string | null;
  employee_signed_at: string | null;
  treatment_other: string | null;
  notes: string | null;
  created_at: string;
  submitted_at: string | null;
  completed_at: string | null;
  // joined
  emp_no?: string;
  employee_name?: string;
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
  action: "approved" | "returned";
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
            p.department, p.division, p.name AS position_name, p.is_managerial
     FROM forms f
     JOIN employees e ON e.id = f.employee_id
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
            p.department, p.division, p.name AS position_name, p.is_managerial
     FROM forms f JOIN employees e ON e.id = f.employee_id
     LEFT JOIN positions p ON p.id = e.position_id
     WHERE ((f.status = 'review1' AND f.reviewer1_id = ?)
        OR  (f.status = 'review2' AND f.reviewer2_id = ?)
        OR  (f.status = 'review3' AND f.reviewer3_id = ?))
     ORDER BY f.submitted_at`,
    reviewerId,
    reviewerId,
    reviewerId
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
  review3: "Review Tier 3",
  completed: "Completed",
  returned: "Returned",
};
