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
const DATA_DIR = path.join(process.cwd(), "data");

let _db: DatabaseSync | null = null;

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
      UNIQUE(department, division, name)
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      emp_no TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      position_id INTEGER REFERENCES positions(id),
      join_date TEXT,
      supervisor_id INTEGER REFERENCES employees(id),
      is_top_management INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      reviewer1_id INTEGER REFERENCES employees(id),
      reviewer2_id INTEGER REFERENCES employees(id),
      reviewer3_id INTEGER REFERENCES employees(id),
      employee_signature TEXT,
      employee_signed_at TEXT,
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
}

// ---------------------------------------------------------------------------
// Seed: positions from template + demo accounts (3-tier chain + admin)
// ---------------------------------------------------------------------------
function seed(conn: DatabaseSync) {
  const insPos = conn.prepare(
    "INSERT OR IGNORE INTO positions (department, division, name, is_managerial) VALUES (?, ?, ?, ?)"
  );
  for (const [d, v, n, m] of POSITION_TEMPLATE) insPos.run(d, v, n, m);

  const posId = (name: string) =>
    (conn.prepare("SELECT id FROM positions WHERE name = ? LIMIT 1").get(name) as any)?.id ?? null;

  const insEmp = conn.prepare(`
    INSERT INTO employees (emp_no, name, position_id, join_date, supervisor_id, is_top_management, password_hash, role)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Admin (HR) account
  insEmp.run("ADMIN", "HR Administrator", null, null, null, 0, hashPassword("admin123"), "admin");

  // Top Management — Managing Director (final approver of every form)
  const md = insEmp.run("MD-001", "Managing Director", null, "2015-01-05", null, 1, hashPassword("md123"), "employee");

  // Demo chain: Production Team -> Production Team Leader -> Operations Manager -> MD
  const mgr = insEmp.run(
    "EMP-101", "Budi Santoso", posId("Operations Manager"), "2018-03-12",
    Number(md.lastInsertRowid), 0, hashPassword("EMP-101"), "employee"
  );
  const leader = insEmp.run(
    "EMP-102", "Siti Rahayu", posId("Production Team Leader"), "2020-07-01",
    Number(mgr.lastInsertRowid), 0, hashPassword("EMP-102"), "employee"
  );
  insEmp.run(
    "EMP-103", "Andi Wijaya", posId("Production Team"), "2022-11-20",
    Number(leader.lastInsertRowid), 0, hashPassword("EMP-103"), "employee"
  );
}
