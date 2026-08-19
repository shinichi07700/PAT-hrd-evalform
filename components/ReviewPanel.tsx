"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "./SignaturePad";
import { reviewAction } from "@/lib/actions";
import { TREATMENTS } from "@/lib/scoring";

export default function ReviewPanel({
  formId,
  tier,
  showTreatments = false,
  initialTreatments = [],
  initialTreatmentOther = "",
}: {
  formId: number;
  tier: number;
  showTreatments?: boolean;
  initialTreatments?: string[];
  initialTreatmentOther?: string;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<"approve" | "return">("approve");
  const [comment, setComment] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [treatments, setTreatments] = useState<string[]>(initialTreatments);
  const [treatmentOther, setTreatmentOther] = useState(initialTreatmentOther);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (decision === "approve" && !signature) {
      return setError("Tanda tangan wajib dibuat untuk menyetujui form.");
    }
    if (decision === "return" && !comment.trim()) {
      return setError("Mohon isi komentar/alasan ketika mengembalikan form.");
    }
    setBusy(true);
    setError(null);
    const res = await reviewAction({
      formId,
      decision,
      comment,
      signature: signature ?? "",
      ...(decision === "approve" && showTreatments
        ? { treatments, treatment_other: treatmentOther }
        : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Gagal memproses review.");
    router.push("/");
    router.refresh();
  };

  return (
    <div className="card" style={{ border: "2px solid var(--brand)" }}>
      <div className="card-title">Panel Review — Tier {tier}</div>
      <div className="alert alert-info">
        Anda adalah reviewer untuk tahap ini. Periksa form di atas, lalu setujui atau kembalikan ke karyawan.
      </div>

      <div className="field">
        <label>Keputusan</label>
        <div className="row">
          <label className="checkbox-row" style={{ fontWeight: 400, color: "var(--ink)" }}>
            <input type="radio" name="decision" checked={decision === "approve"} onChange={() => setDecision("approve")} />
            Setujui
          </label>
          <label className="checkbox-row" style={{ fontWeight: 400, color: "var(--ink)" }}>
            <input type="radio" name="decision" checked={decision === "return"} onChange={() => setDecision("return")} />
            Kembalikan ke karyawan
          </label>
        </div>
      </div>

      <div className="field">
        <label>Komentar / Catatan Review</label>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>

      {showTreatments ? (
        <div className="field">
          <label>Treatment Berdasarkan Hasil Penilaian (disimpan saat menyetujui)</label>
          <div className="grid-2" style={{ marginTop: 6 }}>
            {TREATMENTS.map((t) => (
              <label key={t.key} className="checkbox-row" style={{ fontWeight: 400, color: "var(--ink)" }}>
                <input
                  type="checkbox"
                  checked={treatments.includes(t.key)}
                  onChange={(e) =>
                    setTreatments((prev) => (e.target.checked ? [...prev, t.key] : prev.filter((k) => k !== t.key)))
                  }
                />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
          {treatments.includes("lain_lain") && (
            <div className="field" style={{ marginTop: 8 }}>
              <label>Lain-lain (sebutkan)</label>
              <input type="text" value={treatmentOther} onChange={(e) => setTreatmentOther(e.target.value)} />
            </div>
          )}
        </div>
      ) : (
        treatments.length > 0 && (
          <div className="field">
            <label>Treatment Berdasarkan Hasil Penilaian (diisi oleh Reviewer Tier 2)</label>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {TREATMENTS.filter((t) => treatments.includes(t.key)).map((t) => (
                <li key={t.key}>{t.label}</li>
              ))}
              {treatments.includes("lain_lain") && treatmentOther && <li>Lain-lain: {treatmentOther}</li>}
            </ul>
          </div>
        )
      )}

      {decision === "approve" && (
        <div className="field">
          <label>Tanda Tangan Reviewer</label>
          <SignaturePad onChange={setSignature} />
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          className={decision === "approve" ? "btn btn-ok" : "btn btn-danger"}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "Memproses..." : decision === "approve" ? "Setujui Form" : "Kembalikan Form"}
        </button>
      </div>
    </div>
  );
}
