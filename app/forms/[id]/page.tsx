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
import PrintButton from "@/components/PrintButton";
import { StatusBadge } from "@/components/FormsTable";

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
  const isOwner = form.employee_id === user.id;
  const isAdmin = user.role === "admin";
  const isCurrentReviewer = tier !== null && currentReviewerId(form) === user.id;
  const isAnyReviewer = [form.reviewer1_id, form.reviewer2_id, form.reviewer3_id].includes(user.id);

  if (!isOwner && !isAdmin && !isAnyReviewer) {
    return (
      <div className="container">
        <div className="alert alert-error">Anda tidak memiliki akses ke form ini.</div>
      </div>
    );
  }

  // Steps timeline
  const steps = [
    { label: "Diisi & Ditandatangani", done: !!form.employee_signed_at, current: false, hidden: false },
    { label: `Review 1${reviewerNames[0]?.name ? ` — ${reviewerNames[0].name}` : ""}`, done: !!reviews.find((r) => r.tier === 1 && r.action === "approved"), current: tier === 1, hidden: false },
    { label: `Review 2${reviewerNames[1]?.name ? ` — ${reviewerNames[1].name}` : ""}`, done: !!reviews.find((r) => r.tier === 2 && r.action === "approved"), current: tier === 2, hidden: !form.reviewer2_id },
    { label: `Review 3${reviewerNames[2]?.name ? ` — ${reviewerNames[2].name}` : ""}`, done: !!reviews.find((r) => r.tier === 3 && r.action === "approved"), current: tier === 3, hidden: !form.reviewer3_id },
    { label: "Selesai", done: form.status === "completed", current: false, hidden: false },
  ];

  const lastReturn = [...reviews].reverse().find((r) => r.action === "returned");
  const canEdit = isOwner && (form.status === "draft" || form.status === "returned");
  // Treatment diisi oleh reviewer tier 2; bila tier 2 tidak ada, oleh approver terakhir
  const treatmentTier = form.reviewer2_id ? 2 : form.reviewer3_id ? 3 : 1;

  return (
    <div className="container">
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

      {form.status === "returned" && isOwner && lastReturn && (
        <div className="alert alert-warn no-print">
          <b>Form dikembalikan oleh {lastReturn.reviewer_name}:</b> {lastReturn.comment ?? "tanpa komentar"} — silakan
          perbaiki dan submit ulang.
        </div>
      )}

      {canEdit ? (
        <FormEditor
          formId={formId}
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
        />
      ) : (
        <>
          <FormView form={form} scores={scores} treatments={treatments} reviews={reviews} reviewerNames={reviewerNames} />
          {isCurrentReviewer && (
            <div className="no-print">
              <ReviewPanel
                formId={formId}
                tier={tier!}
                showTreatments={tier === treatmentTier}
                initialTreatments={treatments}
                initialTreatmentOther={form.treatment_other ?? ""}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
