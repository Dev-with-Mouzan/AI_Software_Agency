"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useScroll } from "motion/react";
import {
  Bot,
  FolderKanban,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings,
  Sun,
  UserCircle2,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { useHealth } from "@/lib/hooks";
import { useAuth } from "@/lib/auth-context";

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
  variant = "pill",
}: {
  item: NavItem;
  onNavigate?: () => void;
  pillId?: string;
  variant?: "pill" | "drawer";
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
        "relative flex items-center whitespace-nowrap font-display text-[13px] font-semibold tracking-tight transition-colors duration-150",
        variant === "drawer"
          ? "w-full gap-3 rounded-xl px-4 py-3 text-[14px]"
          : "gap-2 rounded-full px-4 py-2",
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

function AuthMenu() {
  const { status, user, avatarUrl, isAuthenticated, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (status === "loading") return null;

  if (!isAuthenticated || !user) {
    return (
      <Link
        href="/auth?mode=login"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-ink transition-colors hover:bg-primary-hover hover:shadow-glow lg:h-9 lg:w-auto lg:gap-1.5 lg:px-3.5 lg:text-[13px] lg:font-semibold"
      >
        <LogIn className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden lg:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="relative">
      {/* Profile glow beacon */}
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-3 left-1/2 h-5 w-10 -translate-x-1/2 rounded-full bg-primary/35 blur-xl"
      />
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileTap={{ scale: 0.9 }}
        aria-label="Account menu"
        aria-expanded={open}
        className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-edge bg-surface-2 text-text-dim transition-colors hover:border-primary/40 lg:h-9 lg:w-9"
      >
        <span
          aria-hidden
          className="absolute inset-x-1 bottom-0 h-1.5 rounded-full bg-primary/50 blur-md"
        />
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar served from the API proxy
          <img src={avatarUrl} alt="" className="relative h-full w-full object-cover" />
        ) : (
          <UserCircle2 className="relative h-5 w-5" aria-hidden />
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="glass-strong absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-edge p-2 shadow-pop"
            >
              <div className="flex items-center gap-2.5 rounded-xl px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-edge bg-surface-2 text-text-dim">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatar served from the API proxy
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserCircle2 className="h-5 w-5" aria-hidden />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-text">
                    {user.name || "DevPilot user"}
                  </p>
                  <p className="truncate text-[11px] text-muted">{user.email}</p>
                </div>
              </div>
              <div className="my-1 h-px bg-edge-soft" />
              <Link
                href="/settings"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
              >
                <Settings className="h-4 w-4" aria-hidden /> Settings
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
              >
                <LogOut className="h-4 w-4" aria-hidden /> Sign out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
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

  // Lock background scrolling while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const isOnline = health.data?.status === "ok";

  // The auth page is a focused screen — no navigation chrome.
  if (pathname.startsWith("/auth")) return null;

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
            : "border-b border-edge/50 lg:border-transparent",
        )}
      >
        <div
          className={cn(
            "relative mx-auto flex max-w-[1300px] items-center justify-between px-3 transition-all duration-300 sm:px-6",
            scrolled ? "h-12 lg:h-14" : "h-14 lg:h-16",
          )}
        >
          {/* Brand */}
          <div className="flex shrink-0 items-center">
            <Link href="/" className="relative flex shrink-0 items-center gap-2" aria-label="DevPilot AI home">
              {/* Logo glow beacon */}
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-3 left-0 h-6 w-full rounded-full bg-primary/30 blur-xl"
              />
              <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-primary/30 lg:h-9 lg:w-9 lg:rounded-xl">
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-2 rounded-full bg-primary/60 blur-sm"
                />
                {/* eslint-disable-next-line @next/next/no-img-element -- brand logo */}
                <img src="/logo.png" alt="" className="relative h-full w-full object-contain" />
              </span>
              <span className="relative min-w-0 leading-tight">
                <span className="block truncate font-display text-[14px] font-bold tracking-tight text-text lg:text-[15px]">
                  DevPilot AI
                </span>
                <span className="mt-0.5 block font-mono text-[8px] font-medium uppercase tracking-[0.22em] text-faint lg:mt-1 lg:text-[9px] lg:tracking-[0.24em]">
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

          <div className="flex shrink-0 items-center justify-end gap-1.5 lg:gap-2">
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

            <AuthMenu />

            <motion.button
              type="button"
              onClick={toggleTheme}
              whileTap={{ scale: 0.9 }}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface/70 text-text-dim transition-colors hover:text-text lg:h-9 lg:w-9"
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
              className="hidden h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface/70 text-text-dim transition-colors hover:text-text sm:flex lg:h-9 lg:w-9"
            >
              <Settings className="h-4 w-4" />
            </Link>

            <motion.button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              whileTap={{ scale: 0.9 }}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-surface/70 text-text-dim transition-colors hover:text-text lg:h-9 lg:w-9 lg:hidden"
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
              initial={{ opacity: 0, y: -10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.99 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="glass-strong panel-glow absolute inset-x-3 top-full z-50 mt-2 max-h-[calc(100dvh-4.5rem)] overflow-y-auto rounded-2xl border border-edge p-2 shadow-pop scrollbar-none lg:hidden"
              aria-label="Mobile"
            >
              <div className="space-y-1">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    pillId="nav-pill-mobile"
                    variant="drawer"
                    onNavigate={() => setMobileOpen(false)}
                  />
                ))}
              </div>
              <div className="mt-2 border-t border-edge-soft pt-2">
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-11 items-center gap-3 rounded-xl px-4 font-display text-[14px] font-semibold text-text-dim transition-colors hover:bg-surface-2 hover:text-text"
                >
                  <Settings className="h-4 w-4" aria-hidden /> Settings
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
