"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "./SignaturePad";
import {
  ASPECTS_COMMON,
  ASPECTS_MANAGERIAL,
  SCORE_OPTIONS,
  FORM_CODE,
  computeTotals,
  gradeFor,
  divisorFor,
} from "@/lib/scoring";
import { saveDraftAction, submitFormAction } from "@/lib/actions";

export interface EmployeeInfo {
  name: string;
  emp_no: string;
  position_name: string | null;
  department: string | null;
  division: string | null;
  join_date: string | null;
  is_managerial: boolean;
}

export interface FormInitial {
  period_start: string;
  period_end: string;
  scores: Record<number, number>;
  notes: string;
  signature: string | null;
}

export default function FormEditor({
  formId,
  employee,
  initial,
}: {
  formId: number | null;
  employee: EmployeeInfo;
  initial: FormInitial | null;
}) {
  const router = useRouter();
  const [periodStart, setPeriodStart] = useState(initial?.period_start ?? "");
  const [periodEnd, setPeriodEnd] = useState(initial?.period_end ?? "");
  const [scores, setScores] = useState<Record<number, number>>(initial?.scores ?? {});
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [signature, setSignature] = useState<string | null>(initial?.signature ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  const aspects = employee.is_managerial ? [...ASPECTS_COMMON, ...ASPECTS_MANAGERIAL] : ASPECTS_COMMON;
  const totals = useMemo(() => computeTotals(scores, employee.is_managerial), [scores, employee.is_managerial]);
  const grade = gradeFor(totals.avg);

  // group aspects by dimensi (preserve order)
  const groups = useMemo(() => {
    const g: { dimensi: string; aspects: typeof aspects }[] = [];
    for (const a of aspects) {
      const last = g[g.length - 1];
      if (last && last.dimensi === a.dimensi) last.aspects.push(a);
      else g.push({ dimensi: a.dimensi, aspects: [a] });
    }
    return g;
  }, [aspects]);

  const inputPayload = () => ({
    formId,
    period_start: periodStart,
    period_end: periodEnd,
    scores,
    notes,
  });

  const saveDraft = async () => {
    setBusy("draft");
    setError(null);
    const res = await saveDraftAction(inputPayload());
    setBusy(null);
    if (!res.ok) return setError(res.error ?? "Gagal menyimpan draft.");
    router.push(`/forms/${res.formId}`);
    router.refresh();
  };

  const submit = async () => {
    if (!signature) return setError("Silakan buat tanda tangan terlebih dahulu sebelum submit.");
    if (!confirm("Setelah submit, form akan dikirim ke reviewer dan tidak dapat diubah lagi. Lanjutkan?")) return;
    setBusy("submit");
    setError(null);
    const res = await submitFormAction({ ...inputPayload(), signature });
    setBusy(null);
    if (!res.ok) return setError(res.error ?? "Gagal submit form.");
    router.push(`/forms/${res.formId}`);
    router.refresh();
  };

  const fmtDate = (s: string | null) => {
    if (!s) return "-";
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? s : d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  };

  return (
    <div>
      {/* Header info */}
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>FORM PENILAIAN KARYAWAN</div>
            <div className="muted small">{FORM_CODE}</div>
          </div>
          {employee.is_managerial && <span className="badge badge-review">Posisi Managerial — 24 aspek</span>}
        </div>
        <div className="form-head-grid">
          <span className="muted">Nama</span><span>:</span><b>{employee.name}</b>
          <span className="muted">Divisi</span><span>:</span><span>{employee.division ?? "-"}</span>
          <span className="muted">No. ID</span><span>:</span><span>{employee.emp_no}</span>
          <span className="muted">Departemen</span><span>:</span><span>{employee.department ?? "-"}</span>
          <span className="muted">Jabatan</span><span>:</span><span>{employee.position_name ?? "-"}</span>
          <span className="muted">Tgl. Masuk</span><span>:</span><span>{fmtDate(employee.join_date)}</span>
        </div>
        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Periode Penilaian — Mulai</label>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Periode Penilaian — Selesai</label>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Score list */}
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
                    <button
                      type="button"
                      key={o.code}
                      className={`score-btn ${scores[a.no] === o.value ? "sel" : ""}`}
                      onClick={() => setScores((s) => ({ ...s, [a.no]: o.value }))}
                    >
                      {o.code}
                    </button>
                  ))}
                </div>
                <div className="score-val">{scores[a.no] ?? "–"}</div>
              </div>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <div className="total-row">
            <span>Sub Total Nilai (A){employee.is_managerial ? " — aspek 1–18" : ""}</span>
            <b>{totals.counted > 0 ? totals.subA : "–"}</b>
          </div>
          {employee.is_managerial && (
            <>
              <div className="total-row">
                <span>Sub Total Nilai (B) — aspek 19–24 (Managerial)</span>
                <b>{totals.counted > 0 ? totals.subB : "–"}</b>
              </div>
              <div className="total-row">
                <span>Total Nilai (C) = A + B</span>
                <b>{totals.counted > 0 ? totals.totalC : "–"}</b>
              </div>
            </>
          )}
          <div className="total-row grand">
            <span>
              Nilai Rata-rata (X) = Total (C) ÷ {divisorFor(employee.is_managerial)}
              {totals.counted > 0 && (
                <span className="badge badge-completed" style={{ marginLeft: 10 }}>
                  Kriteria {grade.letter} ({grade.label})
                </span>
              )}
            </span>
            <b>{totals.counted > 0 ? totals.avg.toFixed(2) : "–"}</b>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="card">
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Catatan Tambahan</label>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      {/* Signature */}
      <div className="card">
        <div className="card-title">Tanda Tangan (Yang Dinilai)</div>
        <SignaturePad initial={initial?.signature} onChange={setSignature} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={saveDraft} disabled={busy !== null}>
          {busy === "draft" ? "Menyimpan..." : "Simpan Draft"}
        </button>
        <button className="btn btn-primary" onClick={submit} disabled={busy !== null}>
          {busy === "submit" ? "Mengirim..." : "Submit & Tanda Tangani"}
        </button>
      </div>
    </div>
  );
}
