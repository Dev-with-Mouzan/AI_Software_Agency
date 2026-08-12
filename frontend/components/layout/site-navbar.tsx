"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useScroll } from "motion/react";
import {
  Bot,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Moon,
  ScrollText,
  Settings,
  Sun,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useHealth } from "@/lib/hooks";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Home",
    icon: LayoutDashboard,
    match: (p) => p === "/",
  },
  {
    href: "/agents",
    label: "Agents",
    icon: Bot,
    match: (p) => p.startsWith("/agents"),
  },
  {
    href: "/projects",
    label: "Projects",
    icon: FolderKanban,
    match: (p) => p.startsWith("/projects"),
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: Workflow,
    match: (p) => p.startsWith("/workflows"),
  },
  {
    href: "/activity",
    label: "Activity",
    icon: ScrollText,
    match: (p) => p.startsWith("/activity"),
  },
];

function NavLink({
  item,
  onNavigate,
  pillId = "nav-pill",
}: {
  item: NavItem;
  onNavigate?: () => void;
  pillId?: string;
}) {
  const pathname = usePathname();
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 font-display text-[13px] font-semibold tracking-tight transition-colors duration-150",
        active ? "text-primary-ink" : "text-text-dim hover:text-text",
      )}
    >
      {active && (
        <motion.span
          layoutId={pillId}
          className="absolute inset-0 rounded-full bg-primary shadow-glow"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}
      <Icon className="relative h-4 w-4" aria-hidden />
      <span className="relative whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  return (
    <motion.div
      className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-primary via-accent to-info"
      style={{ scaleX: scrollYProgress }}
      aria-hidden
    />
  );
}

export function SiteNavbar() {
  const pathname = usePathname();
  const health = useHealth(30_000);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setTheme(
      window.localStorage.getItem("agency-theme") === "light" ? "light" : "dark",
    );
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isOnline = health.data?.status === "ok";

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("agency-theme", next);
    document.documentElement.classList.toggle("light", next === "light");
  };

  return (
    <>
      <ScrollProgress />
      <header
        className={cn(
          "navbar-mobile relative sticky top-0 z-40 transition-all duration-300",
          scrolled
            ? "glass-strong border-b border-edge shadow-panel"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div
          className={cn(
            "relative mx-auto flex max-w-[1300px] items-center justify-between px-4 transition-all duration-300 sm:px-6",
            scrolled ? "h-14 max-lg:h-16" : "h-16",
          )}
        >
          {/* Brand */}
          <div className="flex shrink-0 items-center">
            <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="DevPilot AI home">
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
          </div>

          {/* Desktop nav — takes the full remaining width, truly centered */}
          <nav
            className="hidden flex-1 items-center justify-center gap-2 whitespace-nowrap lg:flex"
            aria-label="Main"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <span
              className={cn(
                "hidden items-center gap-2 rounded-full border border-edge bg-surface/70 px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] md:flex",
                isOnline ? "text-success" : "text-danger",
              )}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full rounded-full",
                    isOnline ? "animate-ping bg-success" : "bg-danger",
                  )}
                />
                <span
                  className={cn(
                    "relative inline-flex h-1.5 w-1.5 rounded-full",
                    isOnline ? "bg-success" : "bg-danger",
                  )}
                />
              </span>
              {isOnline ? "Online" : "Offline"}
            </span>

            <motion.button
              type="button"
              onClick={toggleTheme}
              whileTap={{ scale: 0.9 }}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-edge bg-surface/70 text-text-dim transition-colors hover:text-text"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ rotate: -60, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 60, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="flex"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </motion.span>
              </AnimatePresence>
            </motion.button>

            <Link
              href="/settings"
              aria-label="Settings"
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-edge bg-surface/70 text-text-dim transition-colors hover:text-text sm:flex"
            >
              <Settings className="h-4 w-4" />
            </Link>

            <motion.button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              whileTap={{ scale: 0.9 }}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-edge bg-surface/70 text-text-dim transition-colors hover:text-text lg:hidden"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </motion.button>
          </div>
        </div>

        {/* Glow line under the navbar to separate it from the background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-5 z-0 h-5 bg-gradient-to-b from-primary/15 to-transparent blur-sm"
        />

        {/* Mobile drawer — anchored to the header so it tracks the navbar height */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ type: "spring", stiffness: 400, damping: 34 }}
              className="glass-strong absolute inset-x-3 top-full z-50 mt-2 max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-2xl border border-edge p-2 shadow-pop scrollbar-none lg:hidden"
              aria-label="Mobile"
            >
              <div className="space-y-1">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pillId="nav-pill-mobile"
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
              </div>
              <div className="mt-2 border-t border-edge-soft pt-2">
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-lg border border-edge bg-surface-2 px-3 py-2.5 font-display text-[13px] font-semibold text-text-dim transition-colors hover:text-text"
                >
                  <Settings className="h-4 w-4" /> Settings
                </Link>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      {/* Mobile drawer overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-30 bg-overlay backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}
      </AnimatePresence>
    </>
  );
}
