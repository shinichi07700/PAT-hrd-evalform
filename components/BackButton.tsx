"use client";

import { useRouter } from "next/navigation";

// Tombol kembali: selalu menuju dashboard utama.
export default function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-sm btn-back no-print"
      style={{ marginBottom: 10 }}
      onClick={() => router.push("/")}
    >
      ← Kembali
    </button>
  );
}
