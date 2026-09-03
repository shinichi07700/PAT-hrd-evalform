// ---------------------------------------------------------------------------
// import_employees.mjs — bulk import employees (and positions) from the
// "Employee Detail" Google Sheet (source of truth) into evalform.db.
//
// Usage:
//   node scripts/import_employees.mjs [--dry-run] [--csv <file>] [--url <csv-url>]
//
// Default --csv: _scratch/employees.csv (export of the Google Sheet).
// Fetch the latest export first with:
//   node -e "fetch('https://docs.google.com/spreadsheets/d/1hwcKNpd6JGHUrX9gZAb2BcMSFrenATUEbGEfxGOCsOk/export?format=csv&gid=0').then(r=>r.text()).then(t=>require('fs').writeFileSync('_scratch/employees.csv',t))"
//
// The importer UPSERTS by email (safe to re-run) and never deletes data.
// Positions are upserted as (department, division, name, is_managerial).
// Tier columns (Tier-1/Tier-2/Top Management) are resolved BY NAME against the
// employee records; ambiguities are fixed in AMBIGUOUS_TIER_NAMES (decisions
// confirmed with HR — see notes below).
// ---------------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const csvArg = args.indexOf("--csv");
const CSV_FILE = csvArg >= 0 ? args[csvArg + 1] : path.join(process.cwd(), "_scratch", "employees.csv");
const DB_FILE = process.env.DB_DIR
  ? path.join(path.resolve(process.env.DB_DIR), "evalform.db")
  : path.join(process.cwd(), "data", "evalform.db");

if (!fs.existsSync(CSV_FILE)) {
  console.error(`CSV not found: ${CSV_FILE}`);
  process.exit(1);
}

// Known name collisions in the sheet's tier columns (same full name, 2 records).
// Value = the email of the record actually meant (decisions from HR, Sept 2026):
//   "Danny Josafat"   -> service@  (Vehicle Maintenance, HR&GA — he is the drivers' Tier-1)
//   "Muhammad Yusuf"  -> yusuf@    (Marketing1 Business — several Farmer Assistants' Tier-1)
//   "Wandi"           -> wandi@    (Marketing2 — only one Wandi is ever a reviewer)
const AMBIGUOUS_TIER_NAMES = {
  "danny josafat": "service@primaagrotech.com",
  "muhammad yusuf": "yusuf@primaagrotech.com",
  "wandi": "wandi@primaagrotech.com",
};

const hashPassword = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 32).toString("hex")}`;
};

// --- tiny RFC4180 CSV parser ------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

// --- parse sheet ------------------------------------------------------------
const KNOWN_DEPARTMENTS = new Set([
  "Secretary & Public Relations",
  "Business Department",
  "Research Department",
  "Supply Chain & Operations Department",
  "Operational Support Department",
]);

const rows = parseCsv(fs.readFileSync(CSV_FILE, "utf8"));
const employees = [];
const problems = [];
let dept = null, div = null;

const norm = (s) => (s ?? "").replace(/\s+/g, " ").trim();
const parseDate = (s) => {
  // "M/D/YYYY" (Google Sheets export) -> "YYYY-MM-DD"
  const m = norm(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const iso = norm(s).match(/^\d{4}-\d{2}-\d{2}$/);
  return iso ? norm(s) : null;
};

for (const r of rows) {
  const c = r.map(norm);
  const empId = c[3];
  if (/^(PAT|PAH)-\d+$/.test(empId)) {
    employees.push({
      department: dept, division: div,
      position: c[1], managerial: /^managerial$/i.test(c[2]), nonManagerial: /^non managerial$/i.test(c[2]),
      emp_no: empId, name: c[4], join_date: parseDate(c[5]),
      email: c[6].toLowerCase(),
      tier1: c[7], tier2: c[8], top: c[9],
    });
    if (!parseDate(c[5])) problems.push(`${empId} ${c[4]}: join date tidak dikenal: "${c[5]}"`);
    if (!/^\S+@\S+\.\S+$/.test(c[6])) problems.push(`${empId} ${c[4]}: email tidak valid: "${c[6]}"`);
    if (!c[1]) problems.push(`${empId} ${c[4]}: job position kosong`);
    if (!dept || !div) problems.push(`${empId} ${c[4]}: department/division belum diketahui (header row?)`);
  } else if (c[0] && !c[1] && !c[4] && !/^Name of /i.test(c[0])) {
    // header row: department or division name. A name identical to the current
    // department (e.g. "Secretary & Public Relations" twice) means dept·division
    // share the same label — second occurrence is the division.
    if (KNOWN_DEPARTMENTS.has(c[0]) && c[0] !== dept) { dept = c[0]; div = null; }
    else if (dept) div = c[0];
    else problems.push(`Baris header "${c[0]}" dianggap division tapi department belum ada`);
  }
  // rows 1-2 (column captions) & blank rows fall through
}

// --- resolve tiers ----------------------------------------------------------
const clean = (v) => (!v || v === "-" ? null : v);
const byNameLower = new Map(); // lowercase name -> [emp objects]
for (const e of employees) {
  const k = e.name.toLowerCase();
  if (!byNameLower.has(k)) byNameLower.set(k, []);
  byNameLower.get(k).push(e);
}
// existing DB rows (admin + Alihan etc.) can be tier targets too
const db = new DatabaseSync(DB_FILE);
const dbCols = db.prepare("PRAGMA table_info(employees)").all().map((c) => c.name);
if (!dbCols.includes("tier1_id")) {
  console.error("DB belum punya kolom tier — start app sekali (nyalakan dev server & buka halaman) supaya migrasi jalan, lalu ulangi.");
  process.exit(1);
}
const dbPeople = db.prepare("SELECT id, emp_no, name, email FROM employees").all();

// Upsert is BY EMAIL, so a sheet row reusing an address that already belongs to a
// differently-named account would silently rename that account. Report it loudly.
const dbByEmail = new Map(dbPeople.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
for (const e of employees) {
  const hit = dbByEmail.get(e.email.toLowerCase());
  if (hit && hit.name.toLowerCase() !== e.name.toLowerCase())
    problems.push(
      `KOLISI EMAIL: ${e.emp_no} ${e.name} memakai ${e.email} yang di DB sudah milik "${hit.name}" (${hit.emp_no}, id ${hit.id}) — upsert akan menimpa record itu`
    );
}

function resolveTier(name, selfRow, col) {
  if (!name) return { ok: true, id: null, label: null };
  // self-reference by name within the sheet: match the OTHER record when names collide
  const k = name.toLowerCase();
  const fixed = AMBIGUOUS_TIER_NAMES[k];
  if (fixed) {
    const hit = employees.find((e) => e.email === fixed) ?? dbPeople.find((p) => (p.email ?? "").toLowerCase() === fixed);
    if (hit) return { ok: true, id: hit.id ?? null, email: fixed, label: `${name} (via ${fixed})`, pendingId: !("id" in hit) };
  }
  const cands = [...(byNameLower.get(k) ?? []), ...dbPeople.filter((p) => p.name.toLowerCase() === k)];
  const uniqEmails = [...new Set(cands.map((c) => c.email))];
  if (uniqEmails.length === 0) return { ok: false, error: `${selfRow.emp_no} ${selfRow.name}: ${col} "${name}" tidak ditemukan` };
  if (uniqEmails.length > 1) return { ok: false, error: `${selfRow.emp_no} ${selfRow.name}: ${col} "${name}" AMBIGU (${uniqEmails.join(", ")}) — tambah ke AMBIGUOUS_TIER_NAMES` };
  return { ok: true, label: name, email: cands[0].email, pendingId: !("id" in cands[0]) };
}

// email -> id map AFTER insert (id unknown until inserted for new rows)
const emailToId = new Map();
for (const p of dbPeople) if (p.email) emailToId.set(p.email.toLowerCase(), p.id);

const tierRefs = []; // { row, col, email }
let tierFail = 0;
for (const e of employees) {
  e.email_l = e.email.toLowerCase();
  for (const [col, raw] of [["tier1", clean(e.tier1)], ["tier2", clean(e.tier2)], ["top", clean(e.top)]]) {
    const res = resolveTier(raw, e, col);
    if (!res.ok) { tierFail++; problems.push(res.error); continue; }
    if (res.email) tierRefs.push({ emp: e, col, email: res.email.toLowerCase() });
    else e[col + "_id"] = null;
    if (col === "tier1" && !res.email) problems.push(`${e.emp_no} ${e.name}: Tier-1 KOSONG — tidak akan bisa dinilai`);
  }
}
// self-check: same email as tier and as employee
for (const t of tierRefs) if (t.emp.email_l === t.email) problems.push(`SIKLUS: ${t.emp.emp_no} ${t.emp.name} Tier-${t.col === "tier1" ? "1" : t.col === "tier2" ? "2" : "TM"} = dirinya sendiri`);

// --- report -----------------------------------------------------------------
const byDept = {};
for (const e of employees) byDept[e.department] = (byDept[e.department] ?? 0) + 1;
const posKeys = new Set();
for (const e of employees) posKeys.add(`${e.department}|${e.division}|${e.position}|${e.managerial ? 1 : 0}`);
const dupEmpNo = {};
for (const e of employees) dupEmpNo[e.emp_no] = (dupEmpNo[e.emp_no] ?? 0) + 1;
const dupEmail = {};
for (const e of employees) dupEmail[e.email_l] = (dupEmail[e.email_l] ?? 0) + 1;

console.log(`\n=== ${dryRun ? "DRY-RUN" : "IMPORT"} ${path.basename(CSV_FILE)} -> ${path.relative(process.cwd(), DB_FILE)} ===`);
console.log(`Employees rows      : ${employees.length}`);
console.log(`Distinct emails     : ${new Set(employees.map((e) => e.email_l)).size}${Object.entries(dupEmail).filter(([, n]) => n > 1).length ? " !! dup: " + Object.entries(dupEmail).filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`).join(", ") : ""}`);
console.log(`Shared emp_no (OK)  : ${Object.entries(dupEmpNo).filter(([, n]) => n > 1).map(([k, n]) => `${k} x${n}`).join(", ") || "-"}`);
console.log(`Per department      : ${Object.entries(byDept).map(([k, v]) => `${k}=${v}`).join(" | ")}`);
console.log(`Distinct positions  : ${posKeys.size} (upsert)`);
console.log(`Tier references     : ${tierRefs.length} resolved, ${tierFail} failed`);

if (problems.length) {
  console.log(`\n--- MASALAH (${problems.length}) ---`);
  for (const p of problems) console.log("  !", p);
}

if (dryRun) {
  console.log(`\n--- contoh 5 baris ---`);
  for (const e of employees.slice(0, 5))
    console.log(`  ${e.emp_no} ${e.name} <${e.email}> ${e.department} / ${e.division} / ${e.position} [${e.managerial ? "Mgr" : "Non"}] T1=${clean(e.tier1) ?? "-"} T2=${clean(e.tier2) ?? "-"} TM=${clean(e.top) ?? "-"}`);
  console.log(`\nDry-run selesai — tidak ada perubahan DB. Jalankan tanpa --dry-run untuk menerapkan.`);
  process.exit(tierFail ? 2 : 0);
}

if (tierFail) {
  console.error("\nAda referensi tier yang gagal — perbaiki dulu, tidak jadi import.");
  process.exit(2);
}

// --- apply (single transaction) ---------------------------------------------
const upsertPos = db.prepare(`
  INSERT INTO positions (department, division, name, is_managerial) VALUES (?, ?, ?, ?)
  ON CONFLICT(department, division, name, is_managerial) DO UPDATE SET id = id
`);
const upsertEmp = db.prepare(`
  INSERT INTO employees (emp_no, name, email, position_id, join_date, supervisor_id, tier1_id, tier2_id, top_mgmt_id, password_hash, role)
  VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 'employee')
  -- email uniqueness lives in a PARTIAL index, so the conflict target must repeat its predicate
  ON CONFLICT(email) WHERE email IS NOT NULL AND email <> '' DO UPDATE SET
    emp_no = excluded.emp_no, name = excluded.name, position_id = excluded.position_id, join_date = excluded.join_date
`);
const setTiers = db.prepare("UPDATE employees SET tier1_id = ?, tier2_id = ?, top_mgmt_id = ?, supervisor_id = ? WHERE id = ?");
const idOfEmail = db.prepare("SELECT id FROM employees WHERE email = ?");

db.exec("BEGIN");
try {
  for (const e of employees) {
    upsertPos.run(e.department, e.division, e.position, e.managerial ? 1 : 0);
    const posId = db.prepare("SELECT id FROM positions WHERE department=? AND division=? AND name=? AND is_managerial=?")
      .get(e.department, e.division, e.position, e.managerial ? 1 : 0).id;
    upsertEmp.run(e.emp_no, e.name, e.email_l, posId, e.join_date, hashPassword(e.emp_no));
    emailToId.set(e.email_l, idOfEmail.get(e.email_l).id);
  }
  const tierCol = { tier1: "tier1_id", tier2: "tier2_id", top: "top_mgmt_id" };
  const rowsTiers = new Map(); // emp email -> [t1, t2, tm]
  for (const e of employees) rowsTiers.set(e.email_l, [null, null, null]);
  for (const t of tierRefs) {
    const targetId = emailToId.get(t.email);
    if (targetId == null) throw new Error(`tier target email hilang: ${t.email} (baris ${t.emp.emp_no} ${t.col})`);
    const arr = rowsTiers.get(t.emp.email_l);
    arr[t.col === "tier1" ? 0 : t.col === "tier2" ? 1 : 2] = targetId;
  }
  let n = 0;
  for (const [email, [t1, t2, tm]] of rowsTiers) {
    setTiers.run(t1, t2, tm, t1, emailToId.get(email));
    n++;
  }
  db.exec("COMMIT");
  console.log(`\nIMPORT SELESAI: ${employees.length} karyawan (upsert by email), ${n} rantai tier diset. Password awal = Employee ID.`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error("GAGAL, rollback semua:", e.message);
  process.exit(1);
}
