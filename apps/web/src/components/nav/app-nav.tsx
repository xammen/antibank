"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBalance } from "@/hooks/use-balance";

const navItems = [
  { href: "/dashboard", label: "home", icon: "~" },
  { href: "/casino", label: "casino", icon: "$" },
  { href: "/braquages", label: "braquages", icon: "!" },
  { href: "/dahkacoin", label: "dahka", icon: "%" },
  { href: "/justice", label: "justice", icon: "&" },
];

export function AppNav({ initialBalance }: { initialBalance: string }) {
  const pathname = usePathname();
  const { displayBalance } = useBalance(initialBalance);

  // Determine active section
  const getActiveSection = () => {
    if (pathname === "/dashboard") return "/dashboard";
    if (pathname.startsWith("/casino")) return "/casino";
    if (pathname.startsWith("/braquages")) return "/braquages";
    if (pathname.startsWith("/dahkacoin")) return "/dahkacoin";
    if (pathname.startsWith("/justice")) return "/justice";
    if (pathname.startsWith("/shop")) return "/dashboard";
    if (pathname.startsWith("/settings")) return "/dashboard";
    return "/dashboard";
  };

  const activeSection = getActiveSection();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur-sm lg:top-0 lg:bottom-auto lg:border-t-0 lg:border-b">
      <div className="max-w-[800px] mx-auto px-4">
        <div className="flex items-center justify-between h-14 lg:h-12">
          {/* Balance - Always visible */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="text-[0.7rem] text-[var(--text-muted)] uppercase tracking-widest">bal</span>
            <span className="text-sm font-mono tabular-nums">
              {displayBalance.toFixed(2)}€
            </span>
          </div>

          {/* Nav items */}
          <div className="flex items-center justify-around flex-1 lg:justify-center lg:gap-1">
            {navItems.map((item) => {
              const isActive = activeSection === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex flex-col items-center justify-center px-3 py-2 
                    lg:flex-row lg:gap-1.5 lg:px-4 lg:py-1.5
                    transition-all duration-150
                    ${isActive 
                      ? "text-[var(--text)]" 
                      : "text-[var(--text-muted)] hover:text-[var(--text)]"
                    }
                  `}
                >
                  <span className={`
                    text-base lg:text-sm font-mono
                    ${isActive ? "text-green-400" : ""}
                  `}>
                    {item.icon}
                  </span>
                  <span className="text-[0.6rem] lg:text-[0.7rem] uppercase tracking-widest">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Mobile balance + Settings */}
          <div className="flex items-center gap-3">
            <div className="lg:hidden text-right">
              <span className="text-xs font-mono tabular-nums">
                {displayBalance.toFixed(2)}€
              </span>
            </div>
            <Link
              href="/settings"
              className={`
                p-2 transition-colors
                ${pathname.startsWith("/settings") 
                  ? "text-[var(--text)]" 
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }
              `}
            >
              <span className="text-sm">*</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
