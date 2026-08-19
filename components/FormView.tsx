import {
  ASPECTS_COMMON,
  ASPECTS_MANAGERIAL,
  SCORE_OPTIONS,
  TREATMENTS,
  FORM_CODE,
  computeTotals,
  gradeFor,
  divisorFor,
} from "@/lib/scoring";
import type { FormRow, ReviewRow } from "@/lib/repo";
import { fmtDate } from "./FormsTable";

interface Props {
  form: FormRow;
  scores: Record<number, number>;
  treatments: string[];
  reviews: ReviewRow[];
  reviewerNames: { tier: number; id: number | null; name: string | null }[];
}

function codeOf(score: number | undefined) {
  return SCORE_OPTIONS.find((o) => o.value === score)?.code ?? "";
}

export default function FormView({ form, scores, treatments, reviews, reviewerNames }: Props) {
  const isManagerial = !!form.is_managerial;
  const aspects = isManagerial ? [...ASPECTS_COMMON, ...ASPECTS_MANAGERIAL] : ASPECTS_COMMON;
  const totals = computeTotals(scores, isManagerial);
  const grade = gradeFor(totals.avg);

  const groups: { dimensi: string; aspects: typeof aspects }[] = [];
  for (const a of aspects) {
    const last = groups[groups.length - 1];
    if (last && last.dimensi === a.dimensi) last.aspects.push(a);
    else groups.push({ dimensi: a.dimensi, aspects: [a] });
  }

  const reviewByTier = (tier: number) =>
    reviews.filter((r) => r.tier === tier && r.action === "approved").slice(-1)[0];
  const employeeSig = form.employee_signature;

  const sigBlock = (
    title: string,
    subtitle: string,
    name: string | null,
    date: string | null | undefined,
    sig: string | null | undefined
  ) => (
    <div style={{ textAlign: "center", padding: "8px 6px", minWidth: 140 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
      <div className="muted small" style={{ marginBottom: 8 }}>{subtitle}</div>
      <div style={{ height: 70, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {sig ? <img src={sig} alt="tanda tangan" className="sig-img" /> : <span className="muted small">(belum ditandatangani)</span>}
      </div>
      <div style={{ fontWeight: 600, marginTop: 6 }}>({name ?? "..................................."})</div>
      <div className="muted small">Tanggal: {date ? fmtDate(date) : "..................."}</div>
    </div>
  );

  return (
    <div className="print-area">
      {/* Header */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>FORM PENILAIAN KARYAWAN</div>
            <div className="muted small">{FORM_CODE}</div>
          </div>
          {isManagerial && <span className="badge badge-review">Posisi Managerial</span>}
        </div>
        <div className="form-head-grid">
          <span className="muted">Nama</span><span>:</span><b>{form.employee_name}</b>
          <span className="muted">Divisi</span><span>:</span><span>{form.division ?? "-"}</span>
          <span className="muted">No. ID</span><span>:</span><span>{form.emp_no}</span>
          <span className="muted">Departemen</span><span>:</span><span>{form.department ?? "-"}</span>
          <span className="muted">Jabatan</span><span>:</span><span>{form.position_name ?? "-"}</span>
          <span className="muted">Tgl. Masuk</span><span>:</span><span>{fmtDate(form.join_date)}</span>
          <span className="muted">Periode</span><span>:</span>
          <span>{fmtDate(form.period_start)} s/d {fmtDate(form.period_end)}</span>
        </div>
      </div>

      {/* Scores */}
      <div className="card">
        <div className="legend-bar">
          {SCORE_OPTIONS.map((o) => (
            <span key={o.code}>
              <b>{o.code}</b> = {o.value} {o.label}
            </span>
          ))}
        </div>

        {groups.map((g) => (
          <div key={g.dimensi}>
            <div className="section-label">{g.dimensi}</div>
            {g.aspects.map((a) => (
              <div className="aspect-row" key={a.no}>
                <div className="no">{a.no}</div>
                <div>
                  <div className="name">{a.name}</div>
                  <div className="desc">{a.desc}</div>
                </div>
                <div className="score-btns">
                  {SCORE_OPTIONS.map((o) => (
                    <span key={o.code} className={`score-btn ${scores[a.no] === o.value ? "sel" : ""}`}>
                      {o.code}
                    </span>
                  ))}
                </div>
                <div className="score-val">{scores[a.no] ?? "–"}</div>
              </div>
            ))}
          </div>
        ))}

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

      {/* Review comments */}
      {reviews.length > 0 && (
        <div className="card print-block no-print-none">
          <div className="card-title">Riwayat Review</div>
          <table className="data">
            <thead>
              <tr><th>Tanggal</th><th>Tier</th><th>Reviewer</th><th>Keputusan</th><th>Komentar</th></tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td className="small">{fmtDate(r.acted_at)}</td>
                  <td>Tier {r.tier}</td>
                  <td>{r.reviewer_name} <span className="muted small">({r.reviewer_emp_no})</span></td>
                  <td>
                    {r.action === "approved"
                      ? <span className="badge badge-completed">Disetujui</span>
                      : <span className="badge badge-returned">Dikembalikan</span>}
                  </td>
                  <td className="small">{r.comment ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Signatures — mirrors paper form: Dibuat oleh / Diketahui oleh / Disetujui oleh */}
      <div className="card print-block">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {sigBlock("Dibuat oleh", "Yang Dinilai", form.employee_name ?? null, form.employee_signed_at, employeeSig)}
          {sigBlock(
            "Diketahui oleh",
            "Atasan / Unit Head",
            reviewerNames[0]?.name ?? null,
            reviewByTier(1)?.acted_at ?? null,
            reviewByTier(1)?.signature
          )}
          {sigBlock(
            "Diketahui oleh",
            "Reviewer Tier 2",
            reviewerNames[1]?.name ?? null,
            reviewByTier(2)?.acted_at ?? null,
            reviewByTier(2)?.signature
          )}
          {sigBlock(
            "Disetujui oleh",
            "Top Management",
            reviewerNames[2]?.name ?? null,
            reviewByTier(3)?.acted_at ?? null,
            reviewByTier(3)?.signature
          )}
        </div>
      </div>
    </div>
  );
}
