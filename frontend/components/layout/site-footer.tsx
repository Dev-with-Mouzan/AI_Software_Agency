import Link from "next/link";
import {
  ArrowUp,
  Bot,
  Github,
  Globe,
  Mail,
  MessagesSquare,
  Workflow,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/agents", label: "Agents" },
  { href: "/projects", label: "Projects" },
  { href: "/workflows", label: "Workflows" },
  { href: "/activity", label: "Activity" },
];

const RESOURCES = [
  { href: "/settings", label: "Settings" },
  { href: "/api/proxy/docs", label: "API Docs" },
  { href: "/chat", label: "Chat" },
];

const FOOT_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/workflows", label: "Workflows" },
  { href: "/activity", label: "Activity" },
  { href: "/agents", label: "Agents" },
  { href: "/settings", label: "Settings" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 mt-24 overflow-hidden border-t border-edge bg-surface/40">
      {/* Top glow hairline */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />

      {/* Watermark wordmark */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 select-none text-center font-display text-[22vw] font-extrabold leading-none tracking-tighter text-edge/25 md:text-[14rem]"
      >
        DevPilot AI
      </div>

      <div className="relative mx-auto max-w-[1300px] px-4 pb-10 pt-16 sm:px-6">
        {/* Top: brand + quick links */}
        <div className="flex flex-col gap-10 border-b border-edge-soft pb-12 lg:flex-row lg:items-start lg:justify-between">
          {/* Brand */}
          <div className="max-w-sm">
            <Link href="/" className="flex items-center gap-2.5" aria-label="DevPilot AI home">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
                <Bot className="h-[18px] w-[18px] text-primary" aria-hidden />
                <span className="absolute -right-px -top-px h-2 w-2 rounded-full bg-primary">
                  <span className="absolute inset-0 animate-ping-slow rounded-full bg-primary" />
                </span>
              </span>
              <span className="leading-tight">
                <span className="block font-display text-[15px] font-bold tracking-tight text-text">
                  DevPilot AI
                </span>
                <span className="mt-1 block font-mono text-[9px] font-medium uppercase tracking-[0.24em] text-faint">
                  AI software studio
                </span>
              </span>
            </Link>

            <p className="mt-4 text-sm leading-6 text-muted">
              DevPilot AI — your software studio with an agentic crew that
              orchestrates projects, workflows, and deployments from a single
              command center.
            </p>

            {/* Status line */}
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-edge bg-surface-2/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-success">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              All systems nominal
            </div>
          </div>

          {/* Columns */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-14">
            <nav aria-label="Navigate">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-faint">
                Navigate
              </p>
              <ul className="mt-4 space-y-2.5">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-text-dim transition-colors hover:text-primary"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label="Resources">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-faint">
                Resources
              </p>
              <ul className="mt-4 space-y-2.5">
                {RESOURCES.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-text-dim transition-colors hover:text-primary"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-faint">
                Connect
              </p>
              <div className="mt-4 flex gap-3">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="GitHub (external)"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge bg-surface-2 text-text-dim transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Github className="h-4 w-4" aria-hidden />
                </a>
                <a
                  href="mailto:mouzan.ai.dev@gmail.com"
                  aria-label="Email DevPilot AI"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge bg-surface-2 text-text-dim transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Mail className="h-4 w-4" aria-hidden />
                </a>
                <a
                  href="https://my-portfolio-jz1h.vercel.app/"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="My Portfolio"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge bg-surface-2 text-text-dim transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Globe className="h-4 w-4" aria-hidden />
                </a>
              </div>
              <Link
                href="/chat"
                className="mt-5 inline-flex items-center gap-2 rounded-lg border border-edge bg-surface-2/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-text-dim transition-colors hover:border-primary/40 hover:text-primary"
              >
                <MessagesSquare className="h-3 w-3 text-primary" aria-hidden />
                Chat with the team
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col items-center justify-between gap-4 pt-6 sm:flex-row">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            {FOOT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-faint transition-colors hover:text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-faint">
              <Workflow className="h-3.5 w-3.5" aria-hidden />
              Engine v0.1.0
            </span>
            <span className="h-3 w-px bg-edge" aria-hidden />
            <p className="font-mono text-[11px] text-faint">
              © {year} DevPilot AI
            </p>
            <a
              href="#top"
              aria-label="Back to top"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge bg-surface-2 text-text-dim transition-colors hover:border-primary/40 hover:text-primary"
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
