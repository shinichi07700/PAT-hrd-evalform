// ---------------------------------------------------------------------------
// backup_db.mjs — consistent snapshot of the live SQLite database.
//
// Uses VACUUM INTO, which reads the whole DB in one snapshot and writes it to a
// NEW file. Safe to run while the app is serving traffic (WAL readers don't
// block), and unlike copying evalform.db by hand it never produces a file that
// is missing its WAL content.
//
// Usage:
//   node scripts/backup_db.mjs [--dest <dir>] [--keep <n>]
//     --dest   folder for snapshots (default ./backups, or $BACKUP_DIR)
//     --keep   how many newest snapshots to retain (default 14, or $KEEP_BACKUPS)
//   Source DB folder honours $DB_DIR, same override the app uses.
//
// Restore (app must be stopped, WAL files of the old DB removed together):
//   docker compose stop
//   cp backups/evalform-<stamp>.db data/evalform.db && rm -f data/evalform.db-wal data/evalform.db-shm
//   docker compose up -d
// ---------------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};

const SRC_DIR = process.env.DB_DIR ? path.resolve(process.env.DB_DIR) : path.join(process.cwd(), "data");
const DEST = path.resolve(opt("--dest", process.env.BACKUP_DIR || path.join(process.cwd(), "backups")));
const KEEP = Number(opt("--keep", process.env.KEEP_BACKUPS || "14"));
const SRC = path.join(SRC_DIR, "evalform.db");

if (!fs.existsSync(SRC)) {
  console.error(`DB tidak ditemukan: ${SRC}`);
  process.exit(1);
}
if (!Number.isFinite(KEEP) || KEEP < 1) {
  console.error(`--keep tidak valid: ${KEEP}`);
  process.exit(1);
}

const now = new Date();
const p2 = (n) => String(n).padStart(2, "0");
const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`; // 20260903-142752 (local time)
const out = path.join(DEST, `evalform-${stamp}.db`);
fs.mkdirSync(DEST, { recursive: true });
if (fs.existsSync(out)) fs.rmSync(out); // VACUUM INTO refuses an existing target

const db = new DatabaseSync(SRC);
try {
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
} catch (e) {
  fs.rmSync(out, { force: true });
  db.close();
  console.error("VACUUM INTO gagal:", e.message);
  process.exit(1);
}
db.close();

// verify the snapshot itself, not just the source
const chk = new DatabaseSync(out, { readOnly: true });
const integrity = chk.prepare("PRAGMA integrity_check").get().integrity_check;
const counts = ["employees", "forms", "positions"].map((t) => {
  try {
    return `${t}=${chk.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n}`;
  } catch {
    return `${t}=?`;
  }
});
chk.close();

const sizeMb = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
console.log(`backup : ${out} (${sizeMb} MB, integrity ${integrity})`);
console.log(`isi    : ${counts.join(", ")}`);

// prune: filenames carry an ISO-ish stamp, so lexical order == chronological
const keep = Number(KEEP);
const snapshots = fs
  .readdirSync(DEST)
  .filter((f) => /^evalform-\d{8}-\d{6}\.db$/.test(f))
  .sort();
const removed = [];
while (snapshots.length > keep) {
  const f = snapshots.shift();
  fs.rmSync(path.join(DEST, f));
  removed.push(f);
}
if (removed.length) console.log(`hapus  : ${removed.length} lama (${removed.join(", ")})`);
console.log(`simpan : ${snapshots.length} snapshot di ${DEST}`);
if (integrity !== "ok") {
  console.error("! snapshot gagal cek integritas — periksa sebelum mengandalkan file ini");
  process.exit(1);
}
