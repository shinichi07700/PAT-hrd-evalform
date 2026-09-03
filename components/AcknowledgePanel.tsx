"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "./SignaturePad";
import { acknowledgeAction } from "@/lib/actions";

export default function AcknowledgePanel({ formId, signerName }: { formId: number; signerName: string }) {
  const router = useRouter();
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!signature) return setError("Tanda tangan wajib dibuat untuk mengonfirmasi hasil penilaian.");
    setBusy(true);
    setError(null);
    const res = await acknowledgeAction({ formId, signature });
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Gagal menyimpan konfirmasi.");
    router.push("/");
    router.refresh();
  };

  return (
    <div className="card" style={{ border: "2px solid var(--brand)" }}>
      <div className="card-title">Konfirmasi Hasil Penilaian</div>
      <div className="alert alert-info">
        Atasan Anda telah menyelesaikan penilaian. Silakan periksa hasil di atas, lalu tanda tangani untuk
        mengonfirmasi bahwa Anda telah melihat dan mengetahuinya. Setelah ini, hasil akan disahkan oleh Managing
        Director.
      </div>
      <div className="field">
        <label>Tanda Tangan Konfirmasi</label>
        <SignaturePad onChange={setSignature} signerName={signerName} />
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn btn-ok" onClick={submit} disabled={busy}>
          {busy ? "Memproses..." : "Konfirmasi & Tanda Tangani"}
        </button>
      </div>
    </div>
  );
}
