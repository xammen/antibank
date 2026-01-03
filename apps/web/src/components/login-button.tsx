"use client";

import { signIn } from "next-auth/react";

export function LoginButton() {
  return (
    <button
      onClick={() => signIn("discord", { callbackUrl: "/dashboard" })}
      className="
        group relative px-6 py-3 
        border border-[var(--line)] 
        text-[0.85rem] text-[var(--text)]
        transition-all duration-300 ease-out
        hover:border-[var(--text)] hover:bg-[var(--hover)]
      "
    >
      <span className="relative z-10 flex items-center gap-2">
        <span className="opacity-50 group-hover:opacity-100 transition-opacity">●</span>
        connexion discord
      </span>
    </button>
  );
}
