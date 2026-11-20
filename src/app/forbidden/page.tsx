import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-lg p-10 text-center">
      <h2 className="text-lg font-semibold text-[#172033]">Access denied</h2>
      <p className="mt-2 text-sm text-[#697586]">Your account does not have permission to view this page.</p>
      <Link href="/roster" className="mt-5 inline-block text-sm font-medium text-[#315EAA]">Go to roster</Link>
    </div>
  );
}
