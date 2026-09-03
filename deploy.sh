#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy / update PAT EvalFormHR on the VPS. Manual, git-pull based:
#   ./deploy.sh              backup DB -> pull origin main -> build -> restart -> verify
#   ./deploy.sh --restart    backup DB -> restart only (no pull, no build)
#
# Needs: git, docker + compose v2, curl. Override with env: BRANCH, HOST_PORT.
# First-time install + import + cron backup: runbook di bagian bawah file ini.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")"

BRANCH="${BRANCH:-main}"
HOST_PORT="${HOST_PORT:-5000}"
COMPOSE="docker compose"
MODE="${1:-}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

say "0. release yang sedang jalan"
git log -1 --oneline

# --- 1. snapshot DB dulu; jangan pernah deploy tanpa jalan kembali -----------
say "1. backup database"
mkdir -p backups
if [ -f data/evalform.db ]; then
  if $COMPOSE exec -T evalformhr node scripts/backup_db.mjs 2>/dev/null; then
    echo "   (VACUUM INTO dari container yang sedang jalan)"
  elif command -v node >/dev/null 2>&1; then
    node scripts/backup_db.mjs
  else
    cp -a data/evalform.db "backups/manual-$(date +%Y%m%d-%H%M%S).db"
    echo "   ! container mati & node tak ada di host: copy mentah (WAL tidak ikut)"
  fi
  ls -1 backups | tail -3
else
  echo "   data/evalform.db belum ada (install pertama?) — lewati backup"
fi

# --- 2. kode -----------------------------------------------------------------
say "2. ambil kode terbaru"
if [ "$MODE" = "--restart" ]; then
  echo "   (--restart: lewati git pull)"
else
  git fetch origin "$BRANCH"
  git merge --ff-only "origin/$BRANCH"
  git log -1 --oneline
fi

# --- 3. build ----------------------------------------------------------------
if [ "$MODE" != "--restart" ]; then
  say "3. build image"
  $COMPOSE build --pull
fi

# --- 4. start ----------------------------------------------------------------
say "4. jalankan container"
$COMPOSE up -d

# --- 5. verifikasi -----------------------------------------------------------
say "5. cek app merespon (maks 60 detik)"
ok=""
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${HOST_PORT}/login"; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "   TIDAK SEHAT — log terakhir:"
  $COMPOSE logs --tail 40
  exit 1
fi
echo "   OK -> http://127.0.0.1:${HOST_PORT}/login"
$COMPOSE ps

say "selesai"
echo "Rollback kalau perlu: git checkout <sha release sebelumnya> && ./deploy.sh"

# ---------------------------------------------------------------------------
# RUNBOOK — install pertama di VPS (Ubuntu)
#   sudo apt update && sudo apt install -y git docker.io
#   sudo usermod -aG docker "$USER"      # logout lalu login lagi
#   git clone https://github.com/shinichi07700/PAT-hrd-evalform.git /opt/evalform
#   cd /opt/evalform && ./deploy.sh      # folder data/ dibuat oleh app saat jalan pertama
#
#   Impor karyawan dari Google Sheet (share sheet: "Anyone with link -> Viewer"):
#     URL="https://docs.google.com/spreadsheets/d/1hwcKNpd6JGHUrX9gZAb2BcMSFrenATUEbGEfxGOCsOk/export?format=csv&gid=0"
#     docker compose exec evalformhr node scripts/import_employees.mjs --dry-run --url "$URL"
#     docker compose exec evalformhr node scripts/import_employees.mjs           --url "$URL"
#   Password awal tiap karyawan = No. ID-nya. Bereskan akun test (admin123 / robert123 /
#   md123) dan form contoh sebelum go-live.
#
#   HTTPS untuk hrd-eval.primaagrotech.com: nginx + certbot,
#     proxy_pass http://127.0.0.1:5000;  (app-nya di dalam container, port host 5000)
#
#   Backup harian (crontab -e) + simpan keluar dari server:
#     5 2 * * * cd /opt/evalform && docker compose exec -T evalformhr node scripts/backup_db.mjs --keep 14 >> backups/cron.log 2>&1
#     25 2 * * * cd /opt/evalform && rclone copy backups remote:evalform-backups --max-age 24h
#   Snapshot di dalam VPS saja tidak cukup — disk VPS bisa hilang bersama servernya.
# ---------------------------------------------------------------------------
