// ---------------------------------------------------------------------------
// import_emails.mjs
//
// Bulk-fill the employees.email login column from a file HR exports from Excel.
//
// Usage:
//   node scripts/import_emails.mjs <file> [--dry-run]
//   npm run import:emails -- <file> [--dry-run]
//
// The input file must have two columns: employee number (emp_no) and email.
// Comma (.csv) or tab-separated is auto-detected. A header line is allowed and
// skipped automatically when detected. Extra columns (join date, tier level,
// etc.) are ignored. Example rows:
//
//   EMP-103,andi@primaagrotech.com
//   "EMP-104"	"fitri@primaagrotech.com"
//
// Emails are stored lowercased. Blank email cells are skipped (existing value
// left untouched). The script never deletes data; run with --dry-run first to
// preview, and back up data/evalform.db before a real run.
// ---------------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("Usage: node scripts/import_emails.mjs <file> [--dry-run]");
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const DB_FILE = path.join(process.cwd(), "data", "evalform.db");
if (!fs.existsSync(DB_FILE)) {
  console.error(`Database not found: ${DB_FILE}\nStart the app once to create it, or run from the project root.`);
  process.exit(1);
}

// --- parse a single delimited line (handles double-quoted fields) -----------
function parseLine(line, delim) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      out.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const raw = fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
const lines = raw.split("\n").filter((l) => l.trim().length > 0);
if (lines.length === 0) {
  console.error("Input file is empty.");
  process.exit(1);
}

const delim = (lines[0].match(/\t/) ? "\t" : ",");
const first = parseLine(lines[0], delim).map((s) => s.toLowerCase());
const hasHeader = first.some((c) => c.includes("email")) && first.some((c) => c.includes("emp") || c.includes("no") || c.includes("id"));

// Map header names -> column indexes when present, otherwise assume [0]=emp_no, [1]=email.
let empIdx = 0, mailIdx = 1;
if (hasHeader) {
  const eIdx = first.findIndex((c) => c.includes("emp") || c.toLowerCase() === "no" || c.includes("no.") || c.includes("id"));
  const mIdx = first.findIndex((c) => c.includes("email") || c.includes("mail"));
  if (eIdx >= 0) empIdx = eIdx;
  if (mIdx >= 0) mailIdx = mIdx;
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const dataLines = hasHeader ? lines.slice(1) : lines;

const db = new DatabaseSync(DB_FILE);

// Ensure the email column + unique index exist even if the app hasn't been
// restarted since the schema change (mirrors init() in lib/db.ts).
const empCols = db.prepare("PRAGMA table_info(employees)").all();
if (!empCols.some((c) => c.name === "email")) db.exec("ALTER TABLE employees ADD COLUMN email TEXT");
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_email ON employees(email) WHERE email IS NOT NULL AND email <> ''"
);

const findEmp = db.prepare("SELECT id FROM employees WHERE emp_no = ?");
const usedBy = db.prepare("SELECT id FROM employees WHERE email = ? AND emp_no <> ?");
const setMail = db.prepare("UPDATE employees SET email = ? WHERE emp_no = ?");

let updated = 0, skippedBlank = 0, invalid = 0, notFound = 0, conflict = 0;
const problems = [];

if (!dryRun) db.exec("BEGIN");
try {
  for (const line of dataLines) {
    const cols = parseLine(line, delim);
    const empNo = (cols[empIdx] ?? "").trim();
    const email = (cols[mailIdx] ?? "").trim().toLowerCase();
    if (!empNo) continue;
    if (!email) { skippedBlank++; continue; }
    if (!EMAIL_RE.test(email)) { invalid++; problems.push(`invalid email "${email}" for ${empNo}`); continue; }

    const emp = findEmp.get(empNo);
    if (!emp) { notFound++; problems.push(`no employee with emp_no "${empNo}"`); continue; }

    const clash = usedBy.get(email, empNo);
    if (clash) { conflict++; problems.push(`email "${email}" already used by another employee (skipped ${empNo})`); continue; }

    if (!dryRun) setMail.run(email, empNo);
    updated++;
  }
  if (!dryRun) db.exec("COMMIT");
} catch (e) {
  if (!dryRun) db.exec("ROLLBACK");
  console.error("Transaction failed, no changes written:", e?.message ?? e);
  db.close();
  process.exit(1);
}

console.log(`${dryRun ? "[DRY RUN] " : ""}Email import complete.`);
console.log(`  updated:     ${updated}`);
console.log(`  blank/skip:  ${skippedBlank}`);
console.log(`  invalid:     ${invalid}`);
console.log(`  not found:   ${notFound}`);
console.log(`  conflict:    ${conflict}`);
if (problems.length) {
  console.log(`\nIssues (${problems.length}):`);
  for (const p of problems.slice(0, 50)) console.log(`  - ${p}`);
  if (problems.length > 50) console.log(`  ... and ${problems.length - 50} more`);
}
if (dryRun) console.log(`\nDry run only — no changes written. Re-run without --dry-run to apply.`);
db.close();
