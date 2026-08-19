"use client";

export default function PrintButton() {
  return (
    <button className="btn no-print" onClick={() => window.print()}>
      Cetak / Simpan PDF
    </button>
  );
}
