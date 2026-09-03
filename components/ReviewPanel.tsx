"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "./SignaturePad";
import { reviewAction } from "@/lib/actions";
import { TREATMENTS } from "@/lib/scoring";

interface Props {
  formId: number;
  tier: number;
  signerName: string;
  treatments: string[];
  treatmentOther: string;
}

export default function ReviewPanel({ formId, tier, signerName, treatments: initialTr, treatmentOther: initialOther }: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [treatments, setTreatments] = useState<string[]>(initialTr);
  const [treatmentOther, setTreatmentOther] = useState(initialOther);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!signature) {
      return setError("Tanda tangan wajib dibuat untuk menyetujui form.");
    }
    if (tier === 2 && !comment.trim()) {
      return setError("Komentar / catatan review wajib diisi oleh reviewer Tier 2.");
    }
    if (tier === 2 && treatments.length === 0) {
      return setError("Treatment wajib dipilih minimal satu sebelum menyetujui.");
    }
    if (tier === 2 && treatments.includes("lain_lain") && !treatmentOther.trim()) {
      return setError('Treatment "Lain-lain" wajib dituliskan maksudnya.');
    }
    setBusy(true);
    setError(null);
    const res = await reviewAction({
      formId,
      comment,
      signature: signature ?? "",
      ...(tier === 2 ? { treatments, treatment_other: treatmentOther } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Gagal memproses review.");
    router.push("/");
    router.refresh();
  };

  return (
    <div className="card" style={{ border: "2px solid var(--brand)" }}>
      <div className="card-title">Panel Review — Tahap {tier === 2 ? "Atasan (Tier 2)" : "Managing Director"}</div>
      <div className="alert alert-info">
        {tier === 2
          ? "Anda adalah reviewer Tier 2 — periksa hasil penilaian, revisi nilai bila perlu (bagian yang diubah akan ditandai), tetapkan treatment, lalu setujui."
          : "Anda adalah approver akhir (MD) — periksa hasil dan treatment yang ditetapkan Tier 2, lalu setujui untuk menyelesaikan form."}
      </div>

      {tier === 2 ? (
        <div className="field">
          <label>Treatment (berdasarkan hasil penilaian) * (wajib dipilih)</label>
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
              <label>Lain-lain (sebutkan) * (wajib diisi)</label>
              <input type="text" value={treatmentOther} onChange={(e) => setTreatmentOther(e.target.value)} />
            </div>
          )}
        </div>
      ) : (
        <div className="field">
          <label>Treatment (ditetapkan oleh Tier 2)</label>
          {initialTr.length > 0 ? (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {initialTr.map((k) => (
                <span key={k} className="badge badge-review">
                  {TREATMENTS.find((t) => t.key === k)?.label ?? k}
                </span>
              ))}
              {initialTr.includes("lain_lain") && initialOther && <span className="muted small">{initialOther}</span>}
            </div>
          ) : (
            <span className="muted small">Tidak ada treatment ditetapkan.</span>
          )}
        </div>
      )}

      <div className="field">
        <label>
          Komentar / Catatan Review {tier === 2 ? "* (wajib diisi)" : "(opsional)"}
        </label>
        <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
      </div>

      <div className="field">
        <label>Tanda Tangan Reviewer</label>
        <SignaturePad onChange={setSignature} signerName={signerName} />
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ok" onClick={submit} disabled={busy}>
          {busy ? "Memproses..." : "Tandatangani & Setujui"}
        </button>
      </div>
    </div>
  );
}
