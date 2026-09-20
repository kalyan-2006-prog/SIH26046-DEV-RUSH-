"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/ctri-ethics", label: "CTRI / Ethics" },
  { href: "/participants", label: "Participants" },
  { href: "/adverse-events", label: "Report AE" },
  { href: "/adverse-events/list", label: "Adverse Events" },
  { href: "/audit-logs", label: "Audit Logs" },
];

type Props = {
  title: string;
  subtitle?: string;
  userLabel?: string;
  role?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export default function AppShell({
  title,
  subtitle,
  userLabel,
  role,
  actions,
  children,
}: Props) {
  const pathname = usePathname() || "";

  // Highlight the most specific matching link only
  let activeHref = "";
  for (const l of LINKS) {
    const match = pathname === l.href || pathname.startsWith(l.href + "/");
    if (match && l.href.length > activeHref.length) activeHref = l.href;
  }

  return (
    <div className="ui">
      <header className="ui-topbar">
        <span className="ui-brand">AIIA CTMS</span>
        <nav className="ui-nav">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={l.href === activeHref ? "active" : ""}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ui-user">
          {userLabel ? <span>{userLabel}</span> : null}
          {role ? <span className="role-chip">{role}</span> : null}
          {actions}
        </div>
      </header>
      <main className="ui-page">
        <h1 className="ui-title">{title}</h1>
        {subtitle ? <p className="ui-subtitle">{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}
