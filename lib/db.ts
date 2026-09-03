import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Positions from "Template Job Position Structure.xlsx"
// [department, division, position, managerial]
// ---------------------------------------------------------------------------
const POSITION_TEMPLATE: [string, string, string, 0 | 1][] = [
  ["Secretary & Public Relations", "Secretary & Public Relations", "Secretary & Public Relations", 1],
  ["Secretary & Public Relations", "Secretary & Public Relations", "Graphic Design", 0],
  ["Secretary & Public Relations", "Secretary & Public Relations", "Video Content Creator", 0],
  ["Business Department", "Sales & Marketing", "Government Project Sr. Manager", 1],
  ["Business Department", "Sales & Marketing", "National Product Development", 1],
  ["Business Department", "Sales & Marketing", "National Coordinator (Retail)", 1],
  ["Business Department", "Sales & Marketing", "Marketing1", 1],
  ["Business Department", "Sales & Marketing", "Marketing2", 0],
  ["Business Department", "Sales & Marketing", "Plantation Technical Support", 0],
  ["Business Department", "Sales & Marketing", "Sales Coordinator", 0],
  ["Business Department", "Sales & Marketing", "Farmer Assistant", 0],
  ["Business Department", "Sales & Marketing", "Spot Worker", 0],
  ["Business Department", "Sales & Marketing", "E-Commerce & Social Media", 0],
  ["Research Department", "Agriculture", "Agriculture Coordinator", 1],
  ["Research Department", "Agriculture", "R&D Technician", 0],
  ["Research Department", "Microbial Research & Aquaculture", "Microbial Research & Aquaculture Coordinator", 1],
  ["Research Department", "Microbial Research & Aquaculture", "R&D Technician", 0],
  ["Supply Chain & Operations Department", "Microbia Preservation", "Microbia Preservation Manager", 1],
  ["Supply Chain & Operations Department", "Microbia Preservation", "Microbia Preservation Supervisor", 1],
  ["Supply Chain & Operations Department", "Microbia Preservation", "Microbia Preservation Operator", 0],
  ["Supply Chain & Operations Department", "Microbia Preservation", "Microbia Preservation Daily Worker", 0],
  ["Supply Chain & Operations Department", "Microbia Drying", "Microbia Drying Manager", 1],
  ["Supply Chain & Operations Department", "Microbia Drying", "Microbia Drying Supervisor", 1],
  ["Supply Chain & Operations Department", "Microbia Drying", "Microbia Drying Operator", 0],
  ["Supply Chain & Operations Department", "Microbia Drying", "Microbia Drying Daily Worker", 0],
  ["Supply Chain & Operations Department", "Operations Management", "Operations Manager", 1],
  ["Supply Chain & Operations Department", "Operations Management", "Production & Packing Supervisor", 1],
  ["Supply Chain & Operations Department", "Operations Management", "Production Team Leader", 1],
  ["Supply Chain & Operations Department", "Operations Management", "Production Team", 0],
  ["Supply Chain & Operations Department", "Operations Management", "Packing Team Leader", 1],
  ["Supply Chain & Operations Department", "Operations Management", "Packing Team", 0],
  ["Supply Chain & Operations Department", "Operations Management", "Maintenance Supervisor", 1],
  ["Supply Chain & Operations Department", "Operations Management", "Maintenance Technician", 0],
  ["Supply Chain & Operations Department", "Operations Management", "Security", 0],
  ["Supply Chain & Operations Department", "Operations Management", "Driver", 0],
  ["Supply Chain & Operations Department", "Operations Management", "Office Boy", 0],
  ["Supply Chain & Operations Department", "Logistic", "Logistic Manager", 1],
  ["Supply Chain & Operations Department", "Logistic", "Logistic Superintendent", 1],
  ["Supply Chain & Operations Department", "Logistic", "Logistic Staff", 0],
  ["Supply Chain & Operations Department", "Logistic", "Logistic Driver", 0],
  ["Operational Support Department", "Finance, Accounting, Tax", "Finance, Accounting, Tax Sr. Manager", 1],
  ["Operational Support Department", "Finance, Accounting, Tax", "Accounting & Tax Manager", 1],
  ["Operational Support Department", "Finance, Accounting, Tax", "Accounting Staff", 0],
  ["Operational Support Department", "Finance, Accounting, Tax", "Cashier", 0],
  ["Operational Support Department", "Finance, Accounting, Tax", "Finance Supervisor", 1],
  ["Operational Support Department", "Finance, Accounting, Tax", "Finance Admin", 0],
  ["Operational Support Department", "Finance, Accounting, Tax", "Sales Admin", 0],
  ["Operational Support Department", "Human Resource & General Affair", "Human Resource & General Affair Sr. Manager", 1],
  ["Operational Support Department", "Human Resource & General Affair", "Human Resource & General Affair Assistant", 1],
  ["Operational Support Department", "Human Resource & General Affair", "Vehicle Maintenance", 1],
  ["Operational Support Department", "Human Resource & General Affair", "Ticketing", 0],
  ["Operational Support Department", "Human Resource & General Affair", "Office Boy", 0],
  ["Operational Support Department", "Licensing", "Licensing Sr. Staff", 0],
];

// ---------------------------------------------------------------------------
// Connection (singleton per process)
// ---------------------------------------------------------------------------
// Data folder can be moved OFF Google Drive for faster local dev writes, e.g.:
//   $env:DB_DIR = "C:\dev\evalform-data"  (copy data/evalform.db there first)
const DATA_DIR = process.env.DB_DIR ? path.resolve(process.env.DB_DIR) : path.join(process.cwd(), "data");

let _db: DatabaseSync | null = null;

// Wrap multi-statement writes in ONE transaction: a single WAL flush instead of
// one per statement. Matters a lot when the DB file sits on a synced drive
// (Google Drive) — measured ~10x faster for a form save there.
// Re-entrant: nested tx() calls just run inline within the outer transaction.
let _txDepth = 0;
export function tx<T>(fn: () => T): T {
  if (_txDepth > 0) return fn();
  const d = db();
  d.exec("BEGIN");
  _txDepth++;
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    try { d.exec("ROLLBACK"); } catch { /* ignore */ }
    throw e;
  } finally {
    _txDepth--;
  }
}

export function db(): DatabaseSync {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, "evalform.db");
  const fresh = !fs.existsSync(file);
  const conn = new DatabaseSync(file);
  conn.exec("PRAGMA journal_mode = WAL;");
  conn.exec("PRAGMA foreign_keys = ON;");
  init(conn);
  if (fresh) seed(conn);
  _db = conn;
  return conn;
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const calc = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return calc.length === expected.length && timingSafeEqual(calc, expected);
}

// App secret for signing session cookies (persisted so sessions survive restart)
export function appSecret(): string {
  const file = path.join(DATA_DIR, ".secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const secret = randomBytes(32).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export function signToken(payload: string): string {
  const sig = createHash("sha256").update(`${payload}.${appSecret()}`).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyToken(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const b64 = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const payload = Buffer.from(b64, "base64url").toString("utf8");
  const expected = createHash("sha256").update(`${payload}.${appSecret()}`).digest("base64url");
  if (sig.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? payload : null;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
function init(conn: DatabaseSync) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department TEXT NOT NULL,
      division TEXT NOT NULL,
      name TEXT NOT NULL,
      is_managerial INTEGER NOT NULL DEFAULT 0,
      UNIQUE(department, division, name, is_managerial)
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_no TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      position_id INTEGER REFERENCES positions(id),
      join_date TEXT,
      supervisor_id INTEGER REFERENCES employees(id),
      tier1_id INTEGER REFERENCES employees(id),
      tier2_id INTEGER REFERENCES employees(id),
      top_mgmt_id INTEGER REFERENCES employees(id),
      is_top_management INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      evaluator_id INTEGER REFERENCES employees(id),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      reviewer1_id INTEGER REFERENCES employees(id),
      reviewer2_id INTEGER REFERENCES employees(id),
      reviewer3_id INTEGER REFERENCES employees(id),
      employee_signature TEXT,
      employee_signed_at TEXT,
      ack_signature TEXT,
      ack_at TEXT,
      treatment_other TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS scores (
      form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      aspect_no INTEGER NOT NULL,
      score INTEGER NOT NULL,
      PRIMARY KEY (form_id, aspect_no)
    );

    CREATE TABLE IF NOT EXISTS treatments (
      form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      treatment TEXT NOT NULL,
      PRIMARY KEY (form_id, treatment)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
      tier INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL REFERENCES employees(id),
      action TEXT NOT NULL,
      comment TEXT,
      signature TEXT,
      acted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // migration for existing databases (employee acknowledgment columns)
  const cols = conn.prepare("PRAGMA table_info(forms)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "ack_signature")) conn.exec("ALTER TABLE forms ADD COLUMN ack_signature TEXT");
  if (!cols.some((c) => c.name === "ack_at")) conn.exec("ALTER TABLE forms ADD COLUMN ack_at TEXT");
  // evaluator_id: the supervisor who fills & signs the form (employee_id is the person assessed)
  if (!cols.some((c) => c.name === "evaluator_id")) conn.exec("ALTER TABLE forms ADD COLUMN evaluator_id INTEGER REFERENCES employees(id)");
  // snapshot of Tier 1 scores + list of aspects later edited by Tier 2 (for color-marking)
  if (!cols.some((c) => c.name === "original_scores")) conn.exec("ALTER TABLE forms ADD COLUMN original_scores TEXT");
  if (!cols.some((c) => c.name === "tier2_edits")) conn.exec("ALTER TABLE forms ADD COLUMN tier2_edits TEXT");

  // migration: employees.email (login identifier). Enforced unique via partial
  // index so blank/NULL rows can coexist during backfill while real emails stay unique.
  const empCols = conn.prepare("PRAGMA table_info(employees)").all() as { name: string }[];
  if (!empCols.some((c) => c.name === "email")) conn.exec("ALTER TABLE employees ADD COLUMN email TEXT");
  // review chain is stored PER EMPLOYEE (Google Sheet = source of truth):
  // tier1 = penilai, tier2 = reviewer kedua (NULL = lewati), top_mgmt = approver akhir.
  if (!empCols.some((c) => c.name === "tier1_id")) conn.exec("ALTER TABLE employees ADD COLUMN tier1_id INTEGER REFERENCES employees(id)");
  if (!empCols.some((c) => c.name === "tier2_id")) conn.exec("ALTER TABLE employees ADD COLUMN tier2_id INTEGER REFERENCES employees(id)");
  if (!empCols.some((c) => c.name === "top_mgmt_id")) conn.exec("ALTER TABLE employees ADD COLUMN top_mgmt_id INTEGER REFERENCES employees(id)");
  // backfill tiers from the old supervisor tree once
  conn.exec("UPDATE employees SET tier1_id = supervisor_id WHERE tier1_id IS NULL AND supervisor_id IS NOT NULL");
  conn.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email ON employees(email) WHERE email IS NOT NULL AND email <> ''"
  );

  // Data fix: md@primaagrotech.com belongs to Adian Romiani Naibaho (PAT-040,
  // Microbia Drying Manager) in the Google Sheet. The Managing Director's own
  // login therefore moves to alihan@primaagrotech.com BEFORE any import runs,
  // so the upsert-by-email never overwrites him. Guarded: only renames the row
  // that is still named Alihan, and only when the target address is free.
  conn.exec(`
    UPDATE employees SET email = 'alihan@primaagrotech.com'
    WHERE lower(email) = 'md@primaagrotech.com' AND lower(name) = 'alihan tjohjono'
      AND NOT EXISTS (SELECT 1 FROM employees WHERE lower(email) = 'alihan@primaagrotech.com')
  `);

  // emp_no is no longer UNIQUE (dual-position staff share one Employee ID, e.g. PAT-007).
  // SQLite cannot drop a column constraint — rebuild the table when the old shape is found.
  const empSql = (conn.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='employees'").get() as any)?.sql ?? "";
  if (/emp_no\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(empSql)) {
    conn.exec("PRAGMA foreign_keys = OFF;");
    conn.exec("BEGIN");
    try {
      conn.exec(`
        CREATE TABLE employees_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          emp_no TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT,
          position_id INTEGER REFERENCES positions(id),
          join_date TEXT,
          supervisor_id INTEGER REFERENCES employees(id),
          tier1_id INTEGER REFERENCES employees(id),
          tier2_id INTEGER REFERENCES employees(id),
          top_mgmt_id INTEGER REFERENCES employees(id),
          is_top_management INTEGER NOT NULL DEFAULT 0,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'employee',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO employees_new (id, emp_no, name, email, position_id, join_date, supervisor_id,
                                   tier1_id, tier2_id, top_mgmt_id, is_top_management, password_hash, role, created_at)
        SELECT id, emp_no, name, email, position_id, join_date, supervisor_id,
               tier1_id, tier2_id, top_mgmt_id, is_top_management, password_hash, role, created_at
        FROM employees;
        DROP TABLE employees;
        ALTER TABLE employees_new RENAME TO employees;
      `);
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    } finally {
      conn.exec("PRAGMA foreign_keys = ON;");
    }
    conn.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email ON employees(email) WHERE email IS NOT NULL AND email <> ''"
    );
  }

  // positions: same title may exist as Managerial AND Non-Managerial (e.g. "Microbia
  // Preservation Supervisor"), so is_managerial joins the unique key.
  const posSql = (conn.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='positions'").get() as any)?.sql ?? "";
  if (/UNIQUE\s*\(\s*department,\s*division,\s*name\s*\)/i.test(posSql) && !/is_managerial\s*\)/i.test(posSql)) {
    conn.exec("PRAGMA foreign_keys = OFF;");
    conn.exec("BEGIN");
    try {
      conn.exec(`
        CREATE TABLE positions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          department TEXT NOT NULL,
          division TEXT NOT NULL,
          name TEXT NOT NULL,
          is_managerial INTEGER NOT NULL DEFAULT 0,
          UNIQUE(department, division, name, is_managerial)
        );
        INSERT INTO positions_new (id, department, division, name, is_managerial)
        SELECT id, department, division, name, is_managerial FROM positions;
        DROP TABLE positions;
        ALTER TABLE positions_new RENAME TO positions;
      `);
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    } finally {
      conn.exec("PRAGMA foreign_keys = ON;");
    }
  }
}

// ---------------------------------------------------------------------------
// Seed: positions from template + minimal accounts (admin + MD root).
// Real employees come from the Google Sheet import — no demo staff.
// ---------------------------------------------------------------------------
function seed(conn: DatabaseSync) {
  const insPos = conn.prepare(
    "INSERT OR IGNORE INTO positions (department, division, name, is_managerial) VALUES (?, ?, ?, ?)"
  );
  for (const [d, v, n, m] of POSITION_TEMPLATE) insPos.run(d, v, n, m);

  const insEmp = conn.prepare(`
    INSERT INTO employees (emp_no, name, email, position_id, join_date, supervisor_id, is_top_management, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Admin (HR) account
  insEmp.run("ADMIN", "HR Administrator", "admin@primaagrotech.com", null, null, null, 0, hashPassword("admin123"), "admin");

  // Top Management — Managing Director, root of the org tree (nobody evaluates him).
  // Not listed in the employee sheet; his login must not use md@ (that is PAT-040's).
  insEmp.run("MD-001", "Alihan Tjohjono", "alihan@primaagrotech.com", null, null, null, 1, hashPassword("md123"), "employee");
}
