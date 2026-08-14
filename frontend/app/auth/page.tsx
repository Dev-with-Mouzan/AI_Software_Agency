"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { ArrowLeft, Check, Circle, ClipboardList, Database, Eye, EyeOff, FolderKanban, Loader2, LockKeyhole, Mail, Monitor, ShieldCheck, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth-context";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

type Mode = "signup" | "login";

const EASE = [0.22, 1, 0.36, 1] as const;

function BrandMark() {
  return (
    <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-primary/30">
      {/* eslint-disable-next-line @next/next/no-img-element -- brand logo */}
      <img src="/logo.png" alt="" className="h-full w-full object-contain" />
    </span>
  );
}

function GoogleG({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.56-5.17 3.56-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.44 1.15-4.07 1.15-3.13 0-5.79-2.12-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.36-2.28V6.63H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.37l3.99-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A12 12 0 0 0 1.28 6.63l3.99 3.09C6.21 6.87 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

function PasswordField({
  label,
  htmlFor,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  hint,
  invalid,
}: {
  label: string;
  htmlFor: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  hint?: string;
  invalid?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} htmlFor={htmlFor} hint={hint}>
      <div className="relative">
        <Input
          id={htmlFor}
          type={visible ? "text" : "password"}
          required
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          minLength={minLength}
          aria-invalid={invalid}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-text-dim transition-colors hover:text-text"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>
    </Field>
  );
}

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 text-[11px] transition-colors duration-200",
        met ? "text-success" : "text-faint",
      )}
    >
      <AnimatePresence initial={false} mode="wait">
        {met ? (
          <motion.span
            key="met"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
            className="flex"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
          </motion.span>
        ) : (
          <motion.span
            key="unmet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex"
          >
            <Circle className="h-3 w-3" aria-hidden />
          </motion.span>
        )}
      </AnimatePresence>
      {label}
    </span>
  );
}

function AuthCard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";
  const initialMode: Mode = searchParams.get("mode") === "login" ? "login" : "signup";

  const { login, signup, loginWithGoogle } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<"details" | "code">("details");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);

  const switchMode = (m: Mode) => {
    setMode(m);
    setStep("details");
    setCode("");
    setVerifiedEmail("");
    setError(null);
    setInfo(null);
    setConfirmError(null);
    setConfirm("");
    setResendAfter(0);
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", m);
    router.replace(`/auth?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    if (resendAfter <= 0) return;
    const t = window.setTimeout(() => setResendAfter((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [resendAfter]);

  const handleSendCode = async () => {
    setError(null);
    setConfirmError(null);
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (confirm !== password) {
      setConfirmError("Passwords don't match.");
      return;
    }
    setSending(true);
    try {
      const target = email.trim().toLowerCase();
      const res = await api.post<{ sent: boolean; dev_code?: string; resend_after: number }>(
        "/auth/send-code",
        { email: target },
      );
      setVerifiedEmail(target);
      setStep("code");
      setResendAfter(res.resend_after ?? 60);
      setInfo(`We sent a 6-digit code to ${target}. Check your inbox — it expires in 15 minutes.`);
      if (res.dev_code) {
        setInfo(
          `Email delivery isn't configured — use the development code ${res.dev_code} for ${target}.`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the code. Try again.");
    } finally {
      setSending(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    if (!verifiedEmail) return;
    setSending(true);
    try {
      const res = await api.post<{ sent: boolean; resend_after: number }>("/auth/send-code", {
        email: verifiedEmail,
      });
      setResendAfter(res.resend_after ?? 60);
      setInfo(`A new code is on its way to ${verifiedEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resend the code.");
    } finally {
      setSending(false);
    }
  };

  const handleVerifyAndCreate = async () => {
    setError(null);
    if (!code.trim()) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const verified = await api.post<{ verified: boolean; verification_token: string }>(
        "/auth/verify-code",
        { email: verifiedEmail, code: code.trim() },
      );
      await signup(verifiedEmail, name.trim(), password, verified.verification_token);
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed. Try again.");
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && step === "details") {
      await handleSendCode();
      return;
    }
    if (mode === "signup" && step === "code") {
      await handleVerifyAndCreate();
      return;
    }
    // Login
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };

  const changeEmail = () => {
    setStep("details");
    setCode("");
    setInfo(null);
    setError(null);
    setResendAfter(0);
    setVerifiedEmail("");
  };

  const handleGoogle = useCallback(async () => {
    setError(null);
    if (!GOOGLE_CLIENT_ID || !window.google?.accounts?.id) {
      setError("Google sign-in isn't configured for this deployment.");
      return;
    }
    setBusy(true);
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        loginWithGoogle(response.credential)
          .then(() => {
            router.replace(next);
            router.refresh();
          })
          .catch((err: Error) => {
            setError(err.message || "Google sign-in failed.");
            setBusy(false);
          });
      },
    });
    window.google.accounts.id.prompt();
  }, [loginWithGoogle, next, router]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || window.google) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  const isSignup = mode === "signup";

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <AuthBackdrop />

      {/* 3D glow behind the card */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2"
        aria-hidden
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
          style={{
            background:
              "radial-gradient(circle at 50% 46%, color-mix(in srgb, var(--color-primary) 20%, transparent) 0%, transparent 62%)",
            filter: "blur(26px)",
          }}
        />
        <motion.div
          className="absolute inset-0 rounded-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.35 }}
          style={{
            background:
              "radial-gradient(circle at 40% 42%, color-mix(in srgb, var(--color-accent) 13%, transparent) 0%, transparent 55%)",
            filter: "blur(32px)",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.94, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.55, ease: EASE, delay: 0.18 }}
        className="relative w-full max-w-[430px]"
        style={{ perspective: 1200 }}
      >
        {/* Floor glow under the card */}
        <div
          className="pointer-events-none absolute -bottom-6 left-1/2 h-12 w-3/4 max-w-[300px] -translate-x-1/2 rounded-full bg-primary/15 blur-2xl"
          aria-hidden
        />

        <CardTilt>
          <div className="rounded-2xl bg-gradient-to-b from-primary/35 via-edge/80 to-accent/25 p-px shadow-pop">
            <div className="relative rounded-[15px] bg-surface/65 p-6 backdrop-blur-2xl sm:p-8">
              {/* Top inner highlight */}
              <div
                className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
                aria-hidden
              />

              <div className="flex flex-col items-center gap-6 text-center">
                <BrandMark />

                <div className="space-y-1.5">
                  <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-text">
                    Welcome to{" "}
                    <span className="text-gradient">DevPilot AI</span>
                  </h1>
                  <p className="mx-auto max-w-[300px] text-[13px] leading-6 text-muted">
                    Build production software with a crew of autonomous AI agents —
                    from plan to deploy, one command at a time.
                  </p>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, x: isSignup ? -12 : 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: isSignup ? 12 : -12 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="flex w-full flex-col gap-4"
                  >
                    <form onSubmit={submit} className="flex w-full flex-col gap-3.5 text-left" noValidate>
                      {isSignup && step === "code" ? (
                        <div className="flex flex-col gap-3.5">
                          <button
                            type="button"
                            onClick={changeEmail}
                            className="flex items-center gap-1.5 self-start text-xs font-medium text-primary transition-colors hover:text-primary-hover"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                            Change email
                          </button>

                          <div className="rounded-lg border border-edge bg-surface-2/40 px-3.5 py-2.5 text-[12px] leading-5">
                            <span className="font-semibold text-text">
                              {verifiedEmail || email.trim().toLowerCase()}
                            </span>
                            <span className="text-muted"> — we emailed you a 6-digit code.</span>
                          </div>

                          <Field label="Verification code" htmlFor="auth-code">
                            <Input
                              id="auth-code"
                              value={code}
                              onChange={(e) => {
                                setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                                if (error) setError(null);
                              }}
                              placeholder="000000"
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              autoFocus
                              className="font-mono text-lg tracking-[0.4em]"
                            />
                          </Field>
                        </div>
                      ) : (
                        <>
                          {isSignup && (
                            <Field label="Name" htmlFor="auth-name">
                              <Input
                                id="auth-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ada Lovelace"
                                autoComplete="name"
                                autoFocus
                              />
                            </Field>
                          )}

                          <Field label="Email" htmlFor="auth-email">
                            <Input
                              id="auth-email"
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="you@company.com"
                              autoComplete="email"
                              autoFocus={!isSignup}
                            />
                          </Field>

                          <PasswordField
                            label="Password"
                            htmlFor="auth-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete={isSignup ? "new-password" : "current-password"}
                            minLength={isSignup ? 8 : undefined}
                          />

                          {isSignup && (
                            <div className="-mt-2 flex flex-col gap-1">
                              <PasswordRequirement
                                met={password.length >= 8}
                                label="At least 8 characters"
                              />
                            </div>
                          )}

                          {isSignup && (
                            <PasswordField
                              label="Confirm password"
                              htmlFor="auth-confirm"
                              value={confirm}
                              onChange={(e) => {
                                setConfirm(e.target.value);
                                if (confirmError) setConfirmError(null);
                              }}
                              placeholder="••••••••"
                              autoComplete="new-password"
                              invalid={!!confirmError}
                            />
                          )}
                        </>
                      )}

                      <AnimatePresence>
                        {info && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden text-[12px] leading-5 text-primary"
                            role="status"
                          >
                            {info}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      <AnimatePresence>
                        {(error || confirmError) && (
                          <motion.p
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden text-[12px] leading-5 text-danger"
                            role="alert"
                          >
                            {confirmError ?? error}
                          </motion.p>
                        )}
                      </AnimatePresence>

                      {isSignup && step === "code" && (
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => void handleResend()}
                            disabled={sending || resendAfter > 0}
                            className="text-[12px] font-medium text-primary transition-colors hover:text-primary-hover disabled:cursor-not-allowed disabled:text-faint"
                          >
                            {resendAfter > 0 ? `Resend code in ${resendAfter}s` : "Resend code"}
                          </button>
                          <span className="text-[11px] text-faint">Code expires in 15 min</span>
                        </div>
                      )}

                      <Button
                        type="submit"
                        size="lg"
                        disabled={busy || sending}
                        className="mt-1 w-full"
                      >
                        {busy || sending ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : isSignup && step === "code" ? (
                          <ShieldCheck className="h-4 w-4" aria-hidden />
                        ) : isSignup ? (
                          <Mail className="h-4 w-4" aria-hidden />
                        ) : (
                          <LockKeyhole className="h-4 w-4" aria-hidden />
                        )}
                        {busy || sending
                          ? "Please wait…"
                          : isSignup && step === "code"
                            ? "Verify & Create Account"
                            : isSignup
                              ? "Send Code"
                              : "Sign In"}
                      </Button>
                    </form>

                    <div className="flex items-center gap-3">
                      <span className="h-px flex-1 bg-edge-soft" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">
                        or continue with
                      </span>
                      <span className="h-px flex-1 bg-edge-soft" />
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      onClick={() => void handleGoogle()}
                      className="w-full"
                    >
                      <GoogleG className="h-4 w-4" />
                      Continue with Google
                    </Button>
                  </motion.div>
                </AnimatePresence>

                <p className="text-[13px] text-text-dim">
                  {isSignup ? (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("login")}
                        className="font-semibold text-primary transition-colors hover:text-primary-hover"
                      >
                        Login
                      </button>
                    </>
                  ) : (
                    <>
                      New to DevPilot?{" "}
                      <button
                        type="button"
                        onClick={() => switchMode("signup")}
                        className="font-semibold text-primary transition-colors hover:text-primary-hover"
                      >
                        Create an account
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </CardTilt>
      </motion.div>
    </div>
  );
}

/** 3D project cube — translucent glass faces carrying the studio tool icons. */
const CUBE_FACES = [
  { transform: "rotateY(0deg) translateZ(32px)", icon: FolderKanban, tone: "border-primary/35 bg-primary/10 text-primary" },
  { transform: "rotateY(90deg) translateZ(32px)", icon: Workflow, tone: "border-accent/35 bg-accent/10 text-accent" },
  { transform: "rotateY(180deg) translateZ(32px)", icon: ClipboardList, tone: "border-info/35 bg-info/10 text-info" },
  { transform: "rotateY(-90deg) translateZ(32px)", icon: Database, tone: "border-success/35 bg-success/10 text-success" },
  { transform: "rotateX(90deg) translateZ(32px)", icon: Monitor, tone: "border-warning/35 bg-warning/10 text-warning" },
  { transform: "rotateX(-90deg) translateZ(32px)", icon: ShieldCheck, tone: "border-primary/35 bg-primary/10 text-primary" },
] as const;

function ProjectCube({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute", className)} aria-hidden>
      {/* Floor glow beneath the cube */}
      <div className="absolute bottom-[-14px] left-1/2 h-3 w-16 -translate-x-1/2 rounded-[100%] bg-primary/40 blur-lg" />
      <div className="relative" style={{ perspective: 500 }}>
        <div className="animate-cube-spin animate-float relative h-16 w-16" style={{ transformStyle: "preserve-3d" }}>
          {CUBE_FACES.map((face) => {
            const Icon = face.icon;
            return (
              <div
                key={face.transform}
                className={cn(
                  "absolute inset-0 flex items-center justify-center rounded-md border backdrop-blur-sm",
                  face.tone,
                )}
                style={{ transform: face.transform }}
              >
                <Icon className="h-5 w-5 opacity-70" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Animated ambient backdrop — breathing halo, faint drifting grid, rising sparks. */
function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
      {/* Breathing central halo */}
      <div
        className="animate-breathe absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--color-primary) 12%, transparent) 0%, transparent 60%)",
          filter: "blur(24px)",
        }}
      />

      {/* Faint engineering grid, slowly drifting toward the bottom-left */}
      <div
        className="animate-grid-fade absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, var(--color-edge) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-edge) 55%, transparent) 1px, transparent 1px)",
          backgroundSize: "52px 52px",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 70% at 50% 50%, black 0%, transparent 72%)",
          maskImage:
            "radial-gradient(ellipse 85% 70% at 50% 50%, black 0%, transparent 72%)",
        }}
      />

      {/* Fine orbit rings around the card */}
      <div
        className="animate-orbit-spin absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/15"
        style={{ animationDuration: "60s" }}
      />
      <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-edge/40" />

      {/* 3D project cubes — tumbling studio accents */}
      <ProjectCube className="right-[4%] top-[16%] hidden opacity-80 sm:block" />
      <ProjectCube className="bottom-[14%] left-[5%] hidden scale-75 opacity-60 md:block" />

      {/* Rising sparks — sparse and quiet */}
      {[
        { left: "12%", size: "h-1 w-1", color: "bg-primary/50", duration: "9s", delay: "0s" },
        { left: "30%", size: "h-1.5 w-1.5", color: "bg-accent/40", duration: "11s", delay: "1.4s" },
        { left: "50%", size: "h-1 w-1", color: "bg-info/40", duration: "10s", delay: "2.8s" },
        { left: "70%", size: "h-1 w-1", color: "bg-warning/35", duration: "12s", delay: "0.8s" },
        { left: "88%", size: "h-1.5 w-1.5", color: "bg-primary/40", duration: "9.5s", delay: "3.6s" },
      ].map((spark) => (
        <span
          key={spark.left}
          className={`animate-rise absolute rounded-full ${spark.color} ${spark.size}`}
          style={{
            left: spark.left,
            bottom: "-4%",
            animationDuration: spark.duration,
            animationDelay: spark.delay,
          }}
        />
      ))}
    </div>
  );
}

/** Subtle pointer-driven 3D tilt. Stays flat on touch / reduced motion. */
function CardTilt({ children }: { children: React.ReactNode }) {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const spring = { stiffness: 170, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(my, [0, 1], [4.5, -4.5]), spring);
  const rotateY = useSpring(useTransform(mx, [0, 1], [-4.5, 4.5]), spring);

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    const rect = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - rect.left) / rect.width);
    my.set((e.clientY - rect.top) / rect.height);
  };

  const onPointerLeave = () => {
    mx.set(0.5);
    my.set(0.5);
  };

  return (
    <motion.div
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
    >
      {children}
    </motion.div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthCard />
    </Suspense>
  );
}
