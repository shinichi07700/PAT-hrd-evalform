import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { listEmployees, listPositions } from "@/lib/repo";
import EmployeeManager from "@/components/EmployeeManager";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const employees = listEmployees();
  const positions = listPositions();

  return (
    <div className="container-wide">
      <h1>Kelola Karyawan</h1>
      <p className="muted">
        Tambahkan karyawan beserta jabatan (dari Template Job Position Structure) dan atasannya. Rantai review 3
        tingkat ditentukan otomatis dari struktur atasan.
      </p>
      <EmployeeManager
        employees={employees.map((e) => ({
          id: e.id,
          emp_no: e.emp_no,
          name: e.name,
          position_id: e.position_id,
          join_date: e.join_date,
          supervisor_id: e.supervisor_id,
          is_top_management: !!e.is_top_management,
          department: e.department,
          division: e.division,
          position_name: e.position_name,
          is_managerial: !!e.is_managerial,
          supervisor_name: e.supervisor_name,
          role: e.role,
        }))}
        positions={positions.map((p) => ({
          id: p.id,
          department: p.department,
          division: p.division,
          name: p.name,
          is_managerial: p.is_managerial,
        }))}
      />
    </div>
  );
}
