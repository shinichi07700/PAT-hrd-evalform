"use client";

import { useRouter } from "next/navigation";

// Tutup form: selalu kembali ke dashboard. Opsional konfirmasi sebelum menutup.
export default function CloseButton({ confirmText }: { confirmText?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-sm btn-close no-print"
      onClick={() => {
        if (confirmText && !window.confirm(confirmText)) return;
        router.push("/");
      }}
    >
      ✕ Tutup
    </button>
  );
}
