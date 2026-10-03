"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/map", label: "Live map" },
  { href: "/machines", label: "Machines" },
  { href: "/maintenance", label: "Maintenance" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface p-3 md:w-52 md:flex-col md:border-r md:border-b-0">
      <div className="hidden px-2 py-1 font-semibold md:mb-4 md:block">Fleet & Rentals</div>
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2 py-1.5 text-sm whitespace-nowrap ${
              active ? "bg-foreground/10 font-medium" : "text-muted hover:bg-foreground/5"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
