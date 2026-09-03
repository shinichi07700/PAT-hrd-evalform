import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import {
  getForm,
  getFormScores,
  getFormTreatments,
  getFormReviews,
  getReviewerNames,
  currentTier,
  currentReviewerId,
  STATUS_LABEL,
} from "@/lib/repo";
import FormEditor from "@/components/FormEditor";
import FormView from "@/components/FormView";
import ReviewPanel from "@/components/ReviewPanel";
import AcknowledgePanel from "@/components/AcknowledgePanel";
import PrintButton from "@/components/PrintButton";
import BackButton from "@/components/BackButton";
import CloseButton from "@/components/CloseButton";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function FormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const formId = Number(id);
  const form = getForm(formId);
  if (!form) notFound();

  const scores = getFormScores(formId);
  const treatments = getFormTreatments(formId);
  const reviews = getFormReviews(formId);
  const reviewerNames = getReviewerNames(form);
  const tier = currentTier(form);
  const isSubject = form.employee_id === user.id;      // karyawan yang dinilai (hanya konfirmasi)
  const isEvaluator = form.evaluator_id === user.id;   // atasan yang mengisi & menilai
  const isAdmin = user.role === "admin";
  const isCurrentReviewer = tier !== null && currentReviewerId(form) === user.id;
  const isAnyReviewer = [form.reviewer1_id, form.reviewer2_id, form.reviewer3_id].includes(user.id);

  if (!isSubject && !isEvaluator && !isAdmin && !isAnyReviewer) {
    return (
      <div className="container">
        <div className="alert alert-error">Anda tidak memiliki akses ke form ini.</div>
      </div>
    );
  }

  // Alur: Penilai (Tier 1) -> [Atasan Tier 2] -> Konfirmasi Karyawan -> [Managing Director] -> Selesai
  const approvedAt = (t: number) => !!reviews.find((r) => r.tier === t && r.action === "approved");
  const awaitingAck = form.status === "awaiting_ack";
  const steps = [
    { label: `Dinilai Penilai${form.evaluator_name ? ` — ${form.evaluator_name}` : ""}`, done: !!form.employee_signed_at, current: form.status === "draft", hidden: false },
    { label: `Review Atasan / Tier 2${reviewerNames[1]?.name ? ` — ${reviewerNames[1].name}` : ""}`, done: approvedAt(2), current: tier === 2, hidden: !form.reviewer2_id },
    { label: "Konfirmasi Karyawan", done: !!form.ack_at, current: awaitingAck, hidden: false },
    { label: `Persetujuan MD${reviewerNames[2]?.name ? ` — ${reviewerNames[2].name}` : ""}`, done: approvedAt(3), current: tier === 3, hidden: !form.reviewer3_id },
    { label: "Selesai", done: form.status === "completed", current: false, hidden: false },
  ];

  const lastReturn = [...reviews].reverse().find((r) => r.action === "returned");
  const canEdit = isEvaluator && form.status === "draft";
  // Tier 2 dapat mengedit form kiriman Tier 1 sebelum menyetujui
  const canReviewEdit = tier === 2 && isCurrentReviewer && form.status === "review2";

  // penanda revisi Tier 2: daftar aspek yang berubah dari nilai asli kiriman Tier 1
  const parseJson = <T,>(s: string | null | undefined, fallback: T): T => {
    try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
  };
  const originalScores = parseJson<Record<number, number>>(form.original_scores, {});
  const editedAspects = parseJson<number[]>(form.tier2_edits, []);

  return (
    <div className="container">
      <div className="no-print">
        <BackButton />
      </div>
      <div className="row no-print" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Form Penilaian #{form.id}</h1>
          <div className="row">
            <StatusBadge status={form.status} />
            <span className="muted small">{STATUS_LABEL[form.status]}</span>
          </div>
        </div>
        <PrintButton />
      </div>

      <div className="steps no-print">
        {steps.filter((s) => !s.hidden).map((s, i) => (
          <div key={i} className={`step ${s.done ? "done" : s.current ? "current" : ""} ${form.status === "returned" && s.current ? "rejected" : ""}`}>
            {s.done ? "✓" : s.current ? "●" : "○"} {s.label}
          </div>
        ))}
      </div>

      {form.status === "returned" && (isEvaluator || isAdmin) && lastReturn && (
        <div className="alert alert-warn no-print">
          <b>Form dikembalikan oleh {lastReturn.reviewer_name}:</b> {lastReturn.comment ?? "tanpa komentar"} —
          form telah diteruskan ke Admin/HR untuk ditindaklanjuti.
        </div>
      )}

      {awaitingAck && isSubject && (
        <div className="alert alert-ok no-print">
          <b>Penilaian oleh atasan Anda telah selesai.</b> Silakan periksa hasil penilaian di bawah, lalu tanda
          tangani untuk mengonfirmasi. {form.reviewer3_id ? "Setelah itu, form menunggu persetujuan Managing Director." : ""}
        </div>
      )}

      {canEdit || canReviewEdit ? (
        <>
          {canReviewEdit && (
            <div className="alert alert-info no-print">
              <b>Mode Review Tier 2.</b> Anda dapat memperbaiki penilaian di bawah bila perlu, simpan perubahan,
              lalu tetapkan treatment dan setujui di panel review.
            </div>
          )}
          <FormEditor
            formId={formId}
            employeeId={form.employee_id}
            signerName={user.name}
            reviewEdit={canReviewEdit}
            employee={{
              name: form.employee_name!,
              emp_no: form.emp_no!,
              position_name: form.position_name ?? null,
              department: form.department ?? null,
              division: form.division ?? null,
              join_date: form.join_date ?? null,
              is_managerial: !!form.is_managerial,
            }}
            initial={{
              period_start: form.period_start,
              period_end: form.period_end,
              scores,
              notes: form.notes ?? "",
              signature: form.employee_signature,
            }}
            originalScores={originalScores}
          />
          {canReviewEdit && (
            <div className="no-print" style={{ marginTop: 16 }}>
              <ReviewPanel
                formId={formId}
                tier={2}
                signerName={user.name}
                treatments={treatments}
                treatmentOther={form.treatment_other ?? ""}
              />
            </div>
          )}
        </>
      ) : (
        <>
          <FormView
            form={form}
            scores={scores}
            treatments={treatments}
            reviews={reviews}
            reviewerNames={reviewerNames}
            editedAspects={editedAspects}
            originalScores={originalScores}
          />
          {awaitingAck && isSubject && (
            <div className="no-print">
              <AcknowledgePanel formId={formId} signerName={user.name} />
            </div>
          )}
          {isCurrentReviewer && (
            <div className="no-print">
              <ReviewPanel
                formId={formId}
                tier={tier!}
                signerName={user.name}
                treatments={treatments}
                treatmentOther={form.treatment_other ?? ""}
              />
            </div>
          )}
        </>
      )}

      {/* Tutup di bagian bawah — tidak perlu scroll ke atas lagi */}
      <div className="row no-print" style={{ justifyContent: "center", marginTop: 16 }}>
        <CloseButton
          confirmText={(canEdit || canReviewEdit) ? "Yakin ingin menutup? Perubahan yang belum disubmit/disimpan akan hilang." : undefined}
        />
      </div>
    </div>
  );
}
