"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type LoginState } from "@/actions/auth";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);
  return (
    <form action={action} className="w-full max-w-sm space-y-4 rounded-lg border border-[#E5E9F0] bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-xl font-semibold text-[#172033]">Sign in to RosterIQ</h1>
        <p className="mt-1 text-sm text-[#697586]">Use your organization account to continue.</p>
      </div>
      <label className="block space-y-1 text-xs font-medium text-[#344054]">
        Email
        <input name="email" type="email" autoComplete="username" required maxLength={254} className="h-10 w-full rounded-md border border-[#E5E9F0] px-3 text-sm" />
      </label>
      <label className="block space-y-1 text-xs font-medium text-[#344054]">
        Password
        <input name="password" type="password" autoComplete="current-password" required maxLength={128} className="h-10 w-full rounded-md border border-[#E5E9F0] px-3 text-sm" />
      </label>
      {state.error && <p role="alert" className="text-xs text-[#B42318]">{state.error}</p>}
      <button disabled={pending} className="h-10 w-full rounded-md bg-[#315EAA] text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-center text-xs text-[#697586]">
        Want a preview? <Link href="/demo" className="font-medium text-[#315EAA] hover:underline">View the public demo</Link>
      </p>
    </form>
  );
}
