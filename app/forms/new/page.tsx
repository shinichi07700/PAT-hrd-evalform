import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getEmployee } from "@/lib/repo";
import FormEditor from "@/components/FormEditor";

export const dynamic = "force-dynamic";

export default async function NewFormPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "employee") redirect("/");

  const emp = getEmployee(user.id)!;
  return (
    <div className="container">
      <h1>Form Penilaian Karyawan Baru</h1>
      <FormEditor
        formId={null}
        employee={{
          name: emp.name,
          emp_no: emp.emp_no,
          position_name: emp.position_name,
          department: emp.department,
          division: emp.division,
          join_date: emp.join_date,
          is_managerial: !!emp.is_managerial,
        }}
        initial={null}
      />
    </div>
  );
}
