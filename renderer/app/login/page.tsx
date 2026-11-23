"use client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, KeyRound, LockKeyhole, Mail, ShieldCheck, UserPlus } from "lucide-react";
import { call, inElectron } from "@/lib/ats";
import { Button, ErrorText, Field, Input, cx } from "@/components/ui";

type Mode = "login" | "create" | "forgot";
type AuthStatus = { hasAccount: boolean; authenticated: boolean; email: string | null };

const TABS: { mode: Mode; label: string }[] = [
  { mode: "login", label: "Login" },
  { mode: "create", label: "Create account" },
  { mode: "forgot", label: "Forgot password" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inElectron()) return;
    call<AuthStatus>("auth:status")
      .then((s) => {
        if (!s.hasAccount) setMode("create");
      })
      .catch(() => undefined);
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setForgotSent(false);
  };

  const afterAuth = async () => {
    const configured = await call<boolean>("settings:configured").catch(() => false);
    router.replace(configured ? "/analytics/" : "/settings/");
  };

  const sendCode = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim()) return setError("Enter your email address.");
    setBusy(true);
    try {
      await call("auth:requestReset", email.trim());
      setForgotSent(true);
      setNotice("If an account exists for that email, a reset code has been sent.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await call("auth:login", { email: email.trim(), password });
        await afterAuth();
        return;
      }
      if (mode === "create") {
        if (password !== confirm) throw new Error("Passwords do not match.");
        const created = await call<{ email: string }>("auth:create", { email: email.trim(), password });
        setEmail(created.email);
        await afterAuth();
        return;
      }
      if (!resetCode.trim()) throw new Error("Enter the emailed reset code.");
      await call("auth:resetEmail", { email: email.trim(), code: resetCode.trim(), newPassword });
      await afterAuth();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-bg p-4"
      style={{ background: "linear-gradient(145deg, #0a192f 0%, #111827 55%, #1e1e2e 100%)" }}
    >
      <div className="w-full max-w-md rounded-2xl border border-[#313244] bg-[#1e1e2e] p-5 shadow-2xl">
        <div className="mb-4 text-center">
          <Image src="/logo-wide.webp" alt="ALMA" width={240} height={64} unoptimized className="mx-auto h-10 w-auto object-contain" />
          <div className="mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#c9963a]/15 text-[#c9963a]">
            <ShieldCheck size={16} />
          </div>
          <h1 className="mt-2 text-lg font-medium text-fg">Welcome to ALMA ATS</h1>
          <p className="mt-0.5 text-xs text-muted">Sign in to continue</p>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-[#0a192f]/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.mode}
              type="button"
              onClick={() => switchMode(t.mode)}
              className={cx(
                "rounded-md px-2 py-1 text-xs transition",
                mode === t.mode ? "bg-[#313244] text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t.mode === "create" && <UserPlus size={12} className="mr-1 inline" />}
              {t.label}
            </button>
          ))}
        </div>

        <ErrorText error={error} />
        {notice && <p className="mb-2 rounded-md border border-[#313244] bg-[#0a192f]/50 px-2 py-1 text-xs text-muted">{notice}</p>}

        <form onSubmit={submit} className="space-y-3">
          <Field label="Email address">
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-2.5 text-muted" />
              <Input
                autoFocus
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hr@yourcompany.com"
                className="pl-9"
              />
            </div>
          </Field>

          {mode !== "forgot" && (
            <Field label="Password">
              <div className="relative">
                <LockKeyhole size={15} className="absolute left-3 top-2.5 text-muted" />
                <Input
                  type="password"
                  required
                  autoComplete={mode === "create" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="pl-9"
                />
              </div>
            </Field>
          )}

          {mode === "create" && (
            <Field label="Confirm password">
              <Input
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat password"
              />
            </Field>
          )}

          {mode === "forgot" && !forgotSent && (
            <Button type="button" variant="primary" className="w-full" disabled={busy} onClick={() => void sendCode()}>
              {busy ? "Sending…" : "Send reset code"}
            </Button>
          )}

          {mode === "forgot" && forgotSent && (
            <>
              <Field label="Emailed reset code" hint="6 digits, expires in 10 minutes">
                <div className="relative">
                  <KeyRound size={15} className="absolute left-3 top-2.5 text-muted" />
                  <Input
                    inputMode="numeric"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="123456"
                    className="pl-9 tracking-widest"
                  />
                </div>
              </Field>
              <Field label="New password">
                <Input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </Field>
              <Button type="submit" variant="primary" className="w-full" disabled={busy}>
                {busy ? "Resetting…" : "Set new password"}
              </Button>
            </>
          )}

          {mode !== "forgot" && (
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"}
            </Button>
          )}
        </form>

        {mode !== "login" && (
          <button onClick={() => switchMode("login")} className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-muted hover:text-fg">
            <ArrowLeft size={13} /> Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
