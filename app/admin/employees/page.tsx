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
        Setiap karyawan memiliki rantai review yang tersimpan eksplisit: Tier‑1 (penilai), Tier‑2 (reviewer kedua,
        boleh kosong), dan Top Management (approver akhir). Rantai ini yang dipakai alur form — tidak ada penurunan
        otomatis dari struktur atasan.
      </p>
      <EmployeeManager
        employees={employees.map((e) => ({
          id: e.id,
          emp_no: e.emp_no,
          name: e.name,
          email: e.email,
          position_id: e.position_id,
          join_date: e.join_date,
          tier1_id: e.tier1_id,
          tier2_id: e.tier2_id,
          top_mgmt_id: e.top_mgmt_id,
          department: e.department,
          division: e.division,
          position_name: e.position_name,
          is_managerial: !!e.is_managerial,
          tier1_name: e.tier1_name,
          tier2_name: e.tier2_name,
          top_mgmt_name: e.top_mgmt_name,
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
