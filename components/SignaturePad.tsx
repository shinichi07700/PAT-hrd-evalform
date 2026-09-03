"use client";

import { useState } from "react";

interface Props {
  initial?: string | null;
  signerName: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

const TXT = "txt:";

// Tanda tangan digital: centang persetujuan → nama tercetak sebagai tanda tangan.
export default function SignaturePad({ initial, signerName, onChange, disabled }: Props) {
  const [agreed, setAgreed] = useState(!!initial && initial.startsWith(TXT));

  const toggle = (checked: boolean) => {
    if (disabled) return;
    setAgreed(checked);
    onChange(checked ? `${TXT}${signerName}` : null);
  };

  return (
    <div className="sig-box" style={{ maxWidth: 480 }}>
      <label className="checkbox-row" style={{ fontWeight: 400, color: "var(--ink)" }}>
        <input type="checkbox" checked={agreed} disabled={disabled} onChange={(e) => toggle(e.target.checked)} />
        <span>
          Saya setuju menandatangani form ini secara digital sebagai <b>{signerName}</b>, dan menyatakan isi
          form ini benar menurut saya.
        </span>
      </label>
      <div className={`sig-typed-preview ${agreed ? "on" : ""}`}>
        {agreed ? (
          <span className="sig-typed">{signerName}</span>
        ) : (
          <span className="muted small">Nama Anda akan muncul di sini setelah dicentang</span>
        )}
      </div>
      <span className="muted small">
        {agreed ? "Tanda tangan digital aktif — sesuai data akun Anda" : "Centang untuk membubuhkan tanda tangan digital"}
      </span>
    </div>
  );
}
