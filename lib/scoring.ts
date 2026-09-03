// Scoring model for PAT-F-HRD-13 Rev.06 — FORM PENILAIAN KARYAWAN

export interface Aspect {
  no: number;
  dimensi: "Knowledge" | "Skill" | "Attitude" | "Managerial";
  name: string;
  desc: string;
}

// Aspek 1–18: dinilai untuk semua karyawan (Sub Total A)
export const ASPECTS_COMMON: Aspect[] = [
  { no: 1, dimensi: "Knowledge", name: "Pengetahuan tentang Pekerjaan", desc: "Pengetahuan karyawan terhadap pekerjaan yang dilakukan serta area kerjanya" },
  { no: 2, dimensi: "Knowledge", name: "Daya Tangkap", desc: "Kemampuan untuk memahami instruksi yang diberikan" },
  { no: 3, dimensi: "Skill", name: "Keterampilan Kerja", desc: "Kemampuan melakukan tugas sesuai dengan tuntutan pekerjaan" },
  { no: 4, dimensi: "Skill", name: "Mutu Pekerjaan", desc: "Hasil kerja yang dicapai sesuai dengan standar yang ditetapkan" },
  { no: 5, dimensi: "Skill", name: "Ketelitian", desc: "Kemampuan memperhatikan detail dari pekerjaan yang dilakukan" },
  { no: 6, dimensi: "Skill", name: "Kreativitas", desc: "Kemampuan menemukan pola baru yang lebih baik dalam melakukan pekerjaan" },
  { no: 7, dimensi: "Attitude", name: "Kesopanan", desc: "Kemampuan menunjukkan perilaku yang menjunjung tinggi tata krama dan etika dalam berinteraksi dengan atasan, bawahan atau sesama rekan kerja" },
  { no: 8, dimensi: "Attitude", name: "Kehadiran", desc: "Frekuensi absensi ybs di lingkungan perusahaan serta ketepatan saat waktu masuk kerja" },
  { no: 9, dimensi: "Attitude", name: "Kecepatan", desc: "Kemampuan bekerja dengan cepat dan tepat sesuai target" },
  { no: 10, dimensi: "Attitude", name: "Kerapian", desc: "Kemampuan menata hasil kerja secara sistematis" },
  { no: 11, dimensi: "Attitude", name: "Inisiatif", desc: "Kemampuan untuk mengemukakan ide / perilaku yang mempermudah proses kerja serta pengembangan diri pribadi" },
  { no: 12, dimensi: "Attitude", name: "Tanggung Jawab", desc: "Kemampuan menangani pekerjaan hingga selesai serta mengatasi semua resiko pekerjaan yang mungkin dapat terjadi" },
  { no: 13, dimensi: "Attitude", name: "Kepatuhan", desc: "Ketaatan mengikuti arahan/instruksi dalam melaksanakan pekerjaan serta menjalankan Peraturan Perusahaan yang ada" },
  { no: 14, dimensi: "Attitude", name: "Pengendalian Diri", desc: "Kemampuan untuk menyikapi masalah kerja yang ada dengan rasional dan logis" },
  { no: 15, dimensi: "Attitude", name: "Kerjasama", desc: "Kemampuan menjalin hubungan dua arah dengan rekan kerja, atasan, bawahan dan konsumen" },
  { no: 16, dimensi: "Attitude", name: "Kerajinan", desc: "Kemampuan untuk menampilkan kinerja di atas standar yang ditetapkan" },
  { no: 17, dimensi: "Attitude", name: "Kerjasama Tim", desc: "Kemampuan untuk terlibat sebagai anggota tim yang turut memberi saran, bantuan dan menghargai rekan satu tim" },
  { no: 18, dimensi: "Attitude", name: "Konsistensi", desc: "Kemampuan untuk mempertahankan perilaku kerja yang positif dengan stabil" },
];

// Aspek 19–24: tambahan khusus level Manager up / Unit Head / yang memiliki bawahan (Sub Total B)
export const ASPECTS_MANAGERIAL: Aspect[] = [
  { no: 19, dimensi: "Managerial", name: "Perencanaan", desc: "Kemampuan menetapkan sasaran & tujuan spesifik serta membuat rencana kerja yang efektif untuk mencapainya" },
  { no: 20, dimensi: "Managerial", name: "Pengorganisasian", desc: "Kemampuan mengatur pekerjaan dan sistem kerja yang baik" },
  { no: 21, dimensi: "Managerial", name: "Kepemimpinan", desc: "Kemampuan memimpin, mengarahkan, memotivasi dan menasehati bawahan" },
  { no: 22, dimensi: "Managerial", name: "Pemecahan Masalah", desc: "Kemampuan mengidentifikasi masalah, mengumpulkan dan menganalisa data, mengembangkan & memilih alternatif penyelesaian" },
  { no: 23, dimensi: "Managerial", name: "Kemampuan Interpersonal", desc: "Kemampuan membina hubungan baik dan bekerjasama dengan rekan kerja serta memberi teladan yang baik kepada bawahan" },
  { no: 24, dimensi: "Managerial", name: "Monitoring & Evaluasi", desc: "Kemampuan memonitor penyelesaian pekerjaan bawahan serta memberikan evaluasi yang objektif terhadap hasil kinerja bawahan" },
];

export const ALL_ASPECTS: Aspect[] = [...ASPECTS_COMMON, ...ASPECTS_MANAGERIAL];

// Bobot nilai: SB=5, B=4, C=3, K=2, SK=1
export const SCORE_OPTIONS = [
  { value: 5, code: "SB", label: "Sangat Baik" },
  { value: 4, code: "B", label: "Baik" },
  { value: 3, code: "C", label: "Cukup" },
  { value: 2, code: "K", label: "Kurang" },
  { value: 1, code: "SK", label: "Sangat Kurang" },
] as const;

// Petunjuk pengisian skor — ditampilkan sebelum mulai menilai
export const SCORING_GUIDE = [
  { value: 5, label: "Sangat Baik", desc: "Melebihi ekspektasi, menunjukkan keunggulan konsisten" },
  { value: 4, label: "Baik", desc: "Memenuhi atau sedikit melebihi ekspektasi" },
  { value: 3, label: "Cukup", desc: "Memenuhi ekspektasi dasar" },
  { value: 2, label: "Kurang", desc: "Belum memenuhi ekspektasi penuh" },
  { value: 1, label: "Sangat Kurang", desc: "Jauh di bawah ekspektasi" },
] as const;

// Nilai di bawah kriteria (K / SK) ditandai merah
export const isBadScore = (v: number | undefined) => v !== undefined && v <= 2;

// Treatment yang dapat diberikan berdasarkan hasil akhir
export const TREATMENTS = [
  { key: "promosi", label: "Promosi — kenaikan jabatan yang lebih tinggi dari jabatan sebelumnya" },
  { key: "mutasi", label: "Mutasi — perpindahan jabatan dalam level yang setara dengan level jabatan sebelumnya" },
  { key: "demosi", label: "Demosi — penurunan jabatan ke level yang lebih rendah dari jabatan sebelumnya" },
  { key: "training", label: "Training — pendidikan, pelatihan lebih lanjut untuk meningkatkan kemampuan kerja karyawan ybs" },
  { key: "penyesuaian_gaji", label: "Penyesuaian gaji" },
  { key: "konseling", label: "Konseling — diskusi antara penilai dan yang dinilai tentang hasil penilaian kerja dan mencari solusi atas tampilan kerja yang kurang optimal" },
  { key: "phk", label: "Hubungan kerja yang telah berlangsung tidak dapat dilanjutkan" },
  { key: "lain_lain", label: "Lain-lain" },
] as const;

export function divisorFor(isManagerial: boolean): number {
  return isManagerial ? 24 : 18;
}

export function computeTotals(scores: Record<number, number | undefined>, isManagerial: boolean) {
  let subA = 0;
  let subB = 0;
  let counted = 0;
  for (const a of ASPECTS_COMMON) {
    const s = scores[a.no];
    if (s) { subA += s; counted++; }
  }
  if (isManagerial) {
    for (const a of ASPECTS_MANAGERIAL) {
      const s = scores[a.no];
      if (s) { subB += s; counted++; }
    }
  }
  const totalC = subA + subB;
  const divisor = divisorFor(isManagerial);
  const avg = counted > 0 ? totalC / divisor : 0;
  return { subA, subB, totalC, divisor, avg, counted };
}

// Kriteria Nilai berdasarkan nilai rata-rata (X)
export function gradeFor(avg: number): { letter: string; label: string } {
  if (avg > 4.5) return { letter: "A", label: "Sangat Baik" };
  if (avg > 3.5) return { letter: "B", label: "Baik" };
  if (avg > 2.5) return { letter: "C", label: "Cukup" };
  if (avg > 1.5) return { letter: "D", label: "Kurang" };
  if (avg > 0) return { letter: "E", label: "Sangat Kurang" };
  return { letter: "-", label: "-" };
}

export const FORM_CODE = "PAT-F-HRD-13 Rev.06";
export const FORM_TITLE = "FORM PENILAIAN KARYAWAN";
