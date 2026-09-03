import type { ReactNode } from "react";
import {
  ASPECTS_COMMON,
  ASPECTS_MANAGERIAL,
  SCORE_OPTIONS,
  SCORING_GUIDE,
  isBadScore,
  TREATMENTS,
  FORM_CODE,
  computeTotals,
  gradeFor,
  divisorFor,
} from "@/lib/scoring";
import type { FormRow, ReviewRow } from "@/lib/repo";
import { fmtDate } from "@/lib/dates";
import SignatureDisplay from "./SignatureDisplay";

interface Props {
  form: FormRow;
  scores: Record<number, number>;
  treatments: string[];
  reviews: ReviewRow[];
  reviewerNames: { tier: number; id: number | null; name: string | null }[];
  editedAspects?: number[]; // aspek yang direvisi Tier 2 → ditandai warna
  originalScores?: Record<number, number>;
}

function codeOf(score: number | undefined) {
  return SCORE_OPTIONS.find((o) => o.value === score)?.code ?? "";
}

export default function FormView({ form, scores, treatments, reviews, reviewerNames, editedAspects, originalScores }: Props) {
  const isManagerial = !!form.is_managerial;
  const aspects = isManagerial ? [...ASPECTS_COMMON, ...ASPECTS_MANAGERIAL] : ASPECTS_COMMON;
  const totals = computeTotals(scores, isManagerial);
  const grade = gradeFor(totals.avg);
  const editedSet = new Set(editedAspects ?? []);
  const orig = originalScores ?? {};

  const groups: { dimensi: string; aspects: typeof aspects }[] = [];
  for (const a of aspects) {
    const last = groups[groups.length - 1];
    if (last && last.dimensi === a.dimensi) last.aspects.push(a);
    else groups.push({ dimensi: a.dimensi, aspects: [a] });
  }

  const reviewByTier = (tier: number) =>
    reviews.filter((r) => r.tier === tier && r.action === "approved").slice(-1)[0];

  // Signature blocks (evaluator-driven): Penilai -> [Atasan Tier 2] -> Konfirmasi Karyawan -> [Managing Director]
  const sigBlocks: { title: string; role: string; name: string | null; date: string | null | undefined; sig: string | null | undefined }[] = [
    { title: "Dibuat & Dinilai oleh", role: "Penilai / Atasan", name: form.evaluator_name ?? null, date: form.employee_signed_at, sig: form.employee_signature },
  ];
  if (form.reviewer2_id) {
    sigBlocks.push({
      title: "Diketahui oleh",
      role: "Atasan (Tier 2)",
      name: reviewerNames[1]?.name ?? null,
      date: reviewByTier(2)?.acted_at ?? null,
      sig: reviewByTier(2)?.signature,
    });
  }
  if (form.ack_signature) {
    sigBlocks.push({
      title: "Dikonfirmasi oleh",
      role: "Karyawan (telah melihat hasil)",
      name: form.employee_name ?? null,
      date: form.ack_at,
      sig: form.ack_signature,
    });
  }
  if (form.reviewer3_id) {
    sigBlocks.push({
      title: "Disetujui oleh",
      role: "Managing Director",
      name: reviewerNames[2]?.name ?? null,
      date: reviewByTier(3)?.acted_at ?? null,
      sig: reviewByTier(3)?.signature,
    });
  }

  const sigBlock = (b: (typeof sigBlocks)[number], i: number) => (
    <div className="sig-cell" key={i}>
      <div className="sig-doc">{b.title}</div>
      <div className="sig-role">{b.role}</div>
      <div className="sig-ink">
        {b.sig ? <SignatureDisplay value={b.sig} /> : <span className="sig-empty-note">Belum ditandatangani</span>}
      </div>
      <div className="sig-name">{b.name ?? "………………………………"}</div>
      <div className="sig-date">{b.date ? `Ditandatangani ${fmtDate(b.date)}` : "Tanggal ...................."}</div>
      {b.sig && <div><span className="sig-verified">✓ Sah</span></div>}
    </div>
  );

  return (
    <div className="print-area">
      {/* Header */}
      <div className="card">
        <div className="form-doc-head">
          <div>
            <div className="form-doc-title">FORM PENILAIAN KARYAWAN</div>
            <div className="muted small">{FORM_CODE}</div>
            {isManagerial && (
              <div style={{ marginTop: 8 }}>
                <span className="badge badge-review">Posisi Managerial</span>
              </div>
            )}
          </div>
          {/* wordmark hitam — versi untuk latar terang / dokumen cetak */}
          <img
            src="/brand/logo-lockup-dark.png"
            alt="PT. Prima Agro Tech"
            className="form-doc-logo"
            width={1999}
            height={648}
          />
        </div>
        <div className="form-head-grid">
          <span className="muted">No. ID</span><span>:</span><span>{form.emp_no}</span>
          <span className="muted">Nama</span><span>:</span><b>{form.employee_name}</b>
          <span className="muted">Departemen</span><span>:</span><span>{form.department ?? "-"}</span>
          <span className="muted">Divisi</span><span>:</span><span>{form.division ?? "-"}</span>
          <span className="muted">Jabatan</span><span>:</span><span>{form.position_name ?? "-"}</span>
          <span className="muted">Tgl. Masuk</span><span>:</span><span>{fmtDate(form.join_date)}</span>
          <span className="muted">Periode</span><span>:</span>
          <span>{fmtDate(form.period_start)} s/d {fmtDate(form.period_end)}</span>
        </div>
      </div>

      {/* Petunjuk pengisian (acuan penilaian) */}
      <div className="card guide-card">
        <div className="guide-head">PETUNJUK PENGISIAN</div>
        <div className="guide-body">
          {SCORING_GUIDE.map((g) => (
            <div className="guide-row" key={g.value}>
              <b className="guide-num">{g.value}</b>
              <span>
                <b>{g.label}</b> - {g.desc}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Scores */}
      <div className="card">
        <div className="legend-bar">
          {SCORE_OPTIONS.map((o) => (
            <span key={o.code} className={isBadScore(o.value) ? "bad" : ""}>
              <b>{o.code}</b> = {o.value} {o.label}
            </span>
          ))}
        </div>

        {groups.map((g) => (
          <div key={g.dimensi}>
            <div className="section-label">{g.dimensi}</div>
            {g.aspects.map((a) => (
              <div className={`aspect-row${editedSet.has(a.no) ? " edited" : ""}`} key={a.no}>
                <div className="no">{a.no}</div>
                <div>
                  <div className="name">
                    {a.name}
                    {editedSet.has(a.no) && (
                      <span className="t2-tag">revisi Tier 2 — asli: {orig[a.no] ?? "–"}</span>
                    )}
                  </div>
                  <div className="desc">{a.desc}</div>
                </div>
                <div className="score-btns">
                  {SCORE_OPTIONS.map((o) => (
                    <span
                      key={o.code}
                      className={`score-btn ${scores[a.no] === o.value ? "sel" : ""} ${scores[a.no] === o.value && isBadScore(o.value) ? "bad" : ""}`}
                    >
                      {o.code}
                    </span>
                  ))}
                </div>
                <div className={`score-val${isBadScore(scores[a.no]) ? " bad" : ""}`}>{scores[a.no] ?? "–"}</div>
              </div>
            ))}
          </div>
        ))}

        {editedSet.size > 0 && (
          <div className="t2-legend">
            ■ Baris bertanda oranye adalah nilai yang direvisi oleh reviewer Tier 2 (nilai asli Tier 1 tercantum pada penanda).
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <div className="total-row">
            <span>Sub Total Nilai (A)</span>
            <b>{totals.counted > 0 ? totals.subA : "–"}</b>
          </div>
          {isManagerial && (
            <>
              <div className="total-row">
                <span>Sub Total Nilai (B) — aspek Managerial 19–24</span>
                <b>{totals.counted > 0 ? totals.subB : "–"}</b>
              </div>
              <div className="total-row">
                <span>Total Nilai (C)</span>
                <b>{totals.counted > 0 ? totals.totalC : "–"}</b>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Calculation + criteria */}
      <div className="card print-block">
        <div className="card-title">Perhitungan</div>
        <div className="form-head-grid" style={{ gridTemplateColumns: "220px 10px 1fr" }}>
          <span>Nilai rata-rata (X)</span><span>=</span>
          <span>Total Nilai (C) ÷ Jumlah Aspek = {totals.counted > 0 ? totals.totalC : "-"} ÷ {divisorFor(isManagerial)}</span>
          <span></span><span></span><b>X = {totals.counted > 0 ? totals.avg.toFixed(2) : "-"}</b>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            Kriteria Nilai, jika nilai rata-rata (X) yang diperoleh antara:
          </div>
          <div className="row small">
            {[
              { l: "A", r: "4.5 < X ≤ 5 — Sangat Baik" },
              { l: "B", r: "3.5 < X ≤ 4.5 — Baik" },
              { l: "C", r: "2.5 < X ≤ 3.5 — Cukup" },
              { l: "D", r: "1.5 < X ≤ 2.5 — Kurang" },
              { l: "E", r: "0 < X ≤ 1.5 — Sangat Kurang" },
            ].map((c) => (
              <span
                key={c.l}
                className="badge"
                style={
                  grade.letter === c.l
                    ? { background: "var(--brand)", color: "#fff" }
                    : { background: "#f1f5f9", color: "var(--muted)" }
                }
              >
                {c.l}. {c.r}
              </span>
            ))}
          </div>
          {totals.counted > 0 && (
            <div className="alert alert-ok" style={{ marginTop: 10 }}>
              Hasil akhir: <b>Kriteria {grade.letter} ({grade.label})</b> dengan nilai rata-rata {totals.avg.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Treatment */}
      {treatments.length > 0 && (
        <div className="card print-block">
          <div className="card-title">Treatment</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {TREATMENTS.filter((t) => treatments.includes(t.key)).map((t) => (
              <li key={t.key}>{t.label}</li>
            ))}
            {treatments.includes("lain_lain") && form.treatment_other && <li>Lain-lain: {form.treatment_other}</li>}
          </ul>
        </div>
      )}

      {/* Notes */}
      {form.notes && (
        <div className="card print-block">
          <div className="card-title">Catatan Tambahan</div>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{form.notes}</p>
        </div>
      )}

      {/* Review comments — termasuk baris Tier 1 (penilaian & pengiriman form) */}
      {(() => {
        const rows: {
          key: string;
          date: string;
          tierLabel: string;
          name: string | null;
          empNo: string | null;
          decision: ReactNode;
          comment: string | null;
        }[] = [];
        if (form.employee_signed_at) {
          rows.push({
            key: "tier1",
            date: form.employee_signed_at,
            tierLabel: "Tier 1",
            name: form.evaluator_name ?? null,
            empNo: form.evaluator_emp_no ?? null,
            decision: <span className="badge badge-review">Diajukan</span>,
            comment: form.notes,
          });
        }
        for (const r of reviews) {
          rows.push({
            key: `r${r.id}`,
            date: r.acted_at,
            tierLabel: r.tier === 0 ? "Karyawan" : `Tier ${r.tier}`,
            name: r.reviewer_name ?? null,
            empNo: r.reviewer_emp_no ?? null,
            decision:
              r.action === "approved" ? (
                <span className="badge badge-completed">Disetujui</span>
              ) : r.action === "acknowledged" ? (
                <span className="badge badge-completed">Dikonfirmasi</span>
              ) : (
                <span className="badge badge-returned">Dikembalikan</span>
              ),
            comment: r.comment,
          });
        }
        if (rows.length === 0) return null;
        return (
          <div className="card print-block no-print-none table-scroll">
            <div className="card-title">Riwayat Review</div>
            <table className="data">
              <thead>
                <tr><th>Tanggal</th><th>Tier</th><th>Reviewer</th><th>Keputusan</th><th>Komentar</th></tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className="small">{fmtDate(row.date)}</td>
                    <td>{row.tierLabel}</td>
                    <td>{row.name ?? "-"} {row.empNo && <span className="muted small">({row.empNo})</span>}</td>
                    <td>{row.decision}</td>
                    <td className="small">{row.comment ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Signatures — executive approval panel: Penilai / Tier 2 / Karyawan / MD */}
      <div className="card print-block sig-panel">
        <div className="sig-panel-head"><span>Tanda Tangan Pengesahan</span></div>
        <div className="sig-panel-grid" style={{ gridTemplateColumns: `repeat(${sigBlocks.length}, 1fr)` }}>
          {sigBlocks.map(sigBlock)}
        </div>
      </div>
    </div>
  );
}
