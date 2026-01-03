"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="
        text-[0.75rem] text-[var(--text-muted)] 
        border-b border-transparent
        hover:text-[var(--text)] hover:border-[var(--line)] 
        transition-all duration-200
      "
    >
      deconnexion
    </button>
  );
}
