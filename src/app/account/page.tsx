import { UserRole } from "@prisma/client";
import { changeOwnPassword } from "@/actions/auth";
import { requireRoles } from "@/lib/auth";

export default async function AccountPage() {
  const user = await requireRoles([UserRole.ADMIN, UserRole.OPERATIONS_MANAGER, UserRole.POD_LEAD, UserRole.EMPLOYEE]);
  return (
    <div className="p-4 md:p-6">
      <div className="mb-5"><h2 className="text-lg font-semibold text-[#172033]">My account</h2><p className="mt-1 text-xs text-[#697586]">Manage your sign-in credentials.</p></div>
      <section className="max-w-xl border border-[#E5E9F0] bg-white p-5">
        <dl className="mb-5 grid gap-3 text-xs sm:grid-cols-2">
          <div><dt className="text-[#697586]">Name</dt><dd className="mt-1 font-medium text-[#172033]">{user.fullName}</dd></div>
          <div><dt className="text-[#697586]">Role</dt><dd className="mt-1 font-medium text-[#172033]">{user.role.replaceAll("_", " ")}</dd></div>
          <div className="sm:col-span-2"><dt className="text-[#697586]">Email</dt><dd className="mt-1 font-medium text-[#172033]">{user.email}</dd></div>
        </dl>
        <h3 className="mb-3 text-sm font-semibold text-[#172033]">Change password</h3>
        <form action={changeOwnPassword} className="space-y-3">
          <label className="block space-y-1 text-xs text-[#344054]">Current password<input name="currentPassword" type="password" autoComplete="current-password" minLength={1} maxLength={128} required className="h-9 w-full rounded-md border border-[#E5E9F0] px-3"/></label>
          <label className="block space-y-1 text-xs text-[#344054]">New password (12–128 characters)<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required className="h-9 w-full rounded-md border border-[#E5E9F0] px-3"/></label>
          <button className="h-9 rounded-md bg-[#315EAA] px-4 text-xs font-semibold text-white">Update password</button>
        </form>
      </section>
    </div>
  );
}
