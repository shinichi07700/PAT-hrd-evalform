import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { allForms, listEmployees } from "@/lib/repo";
import AdminFormsTable from "@/components/AdminFormsTable";

export const dynamic = "force-dynamic";

export default async function AdminFormsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const forms = allForms().map((f) => ({
    id: f.id,
    employee_name: f.employee_name!,
    emp_no: f.emp_no!,
    position_name: f.position_name ?? null,
    period_start: f.period_start,
    period_end: f.period_end,
    status: f.status,
    created_at: f.created_at,
    reviewer1_id: f.reviewer1_id,
    reviewer2_id: f.reviewer2_id,
    reviewer3_id: f.reviewer3_id,
  }));
  const employees = listEmployees()
    .filter((e) => e.role === "employee")
    .map((e) => ({ id: e.id, name: e.name, emp_no: e.emp_no }));

  return (
    <div className="container-wide">
      <h1>Kelola Form Penilaian</h1>
      <AdminFormsTable forms={forms} employees={employees} />
    </div>
  );
}
