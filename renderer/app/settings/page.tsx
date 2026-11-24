"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Download, Eye, EyeOff, Plug, Save } from "lucide-react";
import { call, inElectron, on } from "@/lib/ats";
import { Button, Card, ErrorText, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";

type S = Record<string, string>;
type Tools = { dir: string; ffmpeg: boolean; whisper: boolean; model: boolean; modelName: string };

const APP_PASSWORD_HELP: Record<string, string> = {
  "gmail.com": "Gmail: turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords",
  "almallc.net": "ALMA Google Workspace: turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords using your almallc.net account",
  "outlook.com": "Outlook: account.microsoft.com → Security → Advanced security options → App passwords",
  "hotmail.com": "Outlook: account.microsoft.com → Security → Advanced security options → App passwords",
  "yahoo.com": "Yahoo: Account Info → Account security → Generate app password",
};

export default function SettingsPage() {
  const [s, setS] = useState<S>({});
  const [tools, setTools] = useState<Tools | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // The saved password comes back masked ("********"); fetch the real one only when the user asks to see it.
  const togglePw = async () => {
    if (!showPw && s["mail.password"] === "********") {
      const real = await call<string>("settings:revealPassword").catch(() => "");
      setS((p) => ({ ...p, "mail.password": real }));
    }
    setShowPw((v) => !v);
  };
  const [firstRun, setFirstRun] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    if (!inElectron()) return;
    call<S>("settings:get").then(setS);
    call<boolean>("settings:configured").then((ok) => setFirstRun(!ok));
    call<Tools>("transcribe:status").then(setTools);
    return on("setup:progress", (p) => {
      const x = p as { step: string; phase: string; received?: number; total?: number };
      const label = { ffmpeg: "Audio converter", whisper: "Transcriber", model: "Speech model" }[x.step] ?? x.step;
      setInstalling(x.phase === "download" && x.total ? `${label}: ${Math.round((x.received! / x.total) * 100)}%` : `${label}: ${x.phase}`);
    });
  }, []);

  const installTools = async () => {
    setError(null);
    setInstalling("Starting…");
    try {
      setTools(await call<Tools>("setup:installTools"));
    } catch (e) {
      setError(`Install failed: ${(e as Error).message}`);
    } finally {
      setInstalling(null);
    }
  };
  const toolsReady = !!tools && tools.ffmpeg && tools.whisper && tools.model;

  const set = (k: string) => (e: { target: { value: string } }) => setS((p) => ({ ...p, [k]: e.target.value }));
  const domain = (s["mail.email"] ?? "").split("@")[1]?.toLowerCase() ?? "";

  const save = async () => {
    setError(null);
    setMsg(null);
    try {
      await call("settings:save", s);
      setMsg("Settings saved.");
      call<Tools>("transcribe:status").then(setTools);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const test = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await call("settings:save", s);
      await call("mail:test");
      setMsg("Connected! The app can now receive and send email. You're all set.");
      setFirstRun(false);
      call("mail:sync").catch(() => undefined);
    } catch (e) {
      setError(friendlyError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings">
        <Button variant="primary" onClick={save}>
          <Save size={15} /> Save
        </Button>
      </PageHeader>

      <div className="space-y-4">
        {firstRun && (
          <div className="rounded-lg border border-accent bg-accent-soft p-4">
            <h2 className="font-medium">Welcome to Desktop ATS 👋</h2>
            <p className="mt-1 text-sm text-muted">
              One-time setup: enter your work email and its app password below, then click <b className="text-fg">Save &amp; test connection</b>.
              Everything else (calendar, interviews, recording, transcription, folders) is already set up.
            </p>
          </div>
        )}
        <Card title="Email account">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Your email address">
                <Input value={s["mail.email"] ?? ""} onChange={set("mail.email")} placeholder="hr@yourcompany.com" />
              </Field>
              <Field label="Display name">
                <Input value={s["mail.displayName"] ?? ""} onChange={set("mail.displayName")} placeholder="HR Team" />
              </Field>
            </div>
            <Field label="Send-as email (From)" hint="Applicants see this address and replies go here. Defaults to your email above.">
              <Input value={s["mail.fromEmail"] ?? s["mail.email"] ?? ""} onChange={set("mail.fromEmail")} placeholder="hr@yourcompany.com" />
            </Field>
            <Field label="App password" hint={<>{APP_PASSWORD_HELP[domain] ?? "Use an app password from your email provider (not your normal password)."}{" "}<Link href="/help/" className="text-accent underline">How do I get an app password?</Link></>}>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={s["mail.password"] ?? ""}
                  onChange={set("mail.password")}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={togglePw}
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-fg"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  title={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <button className="text-xs text-accent hover:underline" onClick={() => setAdvanced((v) => !v)}>
              {advanced ? "Hide" : "Show"} server settings (auto-detected for Gmail, ALMA, Outlook, Yahoo)
            </button>
            {advanced && (
              <div className="grid grid-cols-4 gap-3">
                <Field label="IMAP host"><Input value={s["mail.imapHost"] ?? ""} onChange={set("mail.imapHost")} placeholder={`imap.${domain || "example.com"}`} /></Field>
                <Field label="IMAP port"><Input value={s["mail.imapPort"] ?? ""} onChange={set("mail.imapPort")} placeholder="993" /></Field>
                <Field label="SMTP host"><Input value={s["mail.smtpHost"] ?? ""} onChange={set("mail.smtpHost")} placeholder={`smtp.${domain || "example.com"}`} /></Field>
                <Field label="SMTP port"><Input value={s["mail.smtpPort"] ?? ""} onChange={set("mail.smtpPort")} placeholder="465" /></Field>
              </div>
            )}
            <Field label="Email signature">
              <Textarea rows={3} value={s["mail.signature"] ?? ""} onChange={set("mail.signature")} placeholder={"Jane Doe\nHR Manager, Acme Inc."} />
            </Field>
            <Button onClick={test} disabled={busy || !s["mail.email"] || !s["mail.password"]}>
              <Plug size={15} /> {busy ? "Testing…" : "Save & test connection"}
            </Button>
          </div>
        </Card>

        <Card title="Applicant data folder">
          <Field label="Folder location" hint="Leave empty to use Documents\MyATS_Data. Each applicant gets a folder with interviews/, resume/ and emails/.">
            <Input value={s["data.folder"] ?? ""} onChange={set("data.folder")} placeholder="C:\Users\you\Documents\MyATS_Data" />
          </Field>
        </Card>

        <Card title="Transcription (local Whisper)">
          <div className="space-y-3">
            <Field label="Whisper model file" hint="large-v3 is the most accurate (~3 GB download, slowest). large-v3-turbo is nearly as accurate and several times faster.">
              <Select
                value={!s["whisper.model"] || s["whisper.model"].endsWith(".en.bin") ? "ggml-large-v3.bin" : s["whisper.model"]}
                onChange={set("whisper.model")}
              >
                <option value="ggml-large-v3.bin">large-v3: best accuracy, slow (recommended)</option>
                <option value="ggml-large-v3-turbo.bin">large-v3-turbo: near-best, much faster</option>
                <option value="ggml-small.bin">small: lighter, less accurate</option>
              </Select>
            </Field>
            <Field label="Interview language" hint="Pick the main language of your calls. Taglish works best with Tagalog.">
              <Select value={s["whisper.language"] || "tl"} onChange={set("whisper.language")}>
                <option value="tl">Tagalog / Taglish</option>
                <option value="en">English</option>
                <option value="auto">Auto-detect (less reliable)</option>
              </Select>
            </Field>
            {tools && toolsReady && (
              <p className="flex items-center gap-1.5 text-sm text-green-300">
                <CheckCircle2 size={15} /> Ready. Interview recordings are transcribed automatically, offline.
              </p>
            )}
            {tools && !toolsReady && (
              <div className="space-y-2">
                <p className="text-sm text-amber-300">
                  The selected model isn&apos;t installed yet. It downloads automatically on first use, or you can install it now.
                </p>
                <Button onClick={installTools} disabled={!!installing}>
                  <Download size={15} /> {installing ?? "Install now"}
                </Button>
              </div>
            )}
          </div>
        </Card>

        <ErrorText error={error} />
        {msg && <p className="rounded-md border border-good/40 bg-good/10 px-3 py-2 text-sm text-green-300">{msg}</p>}
      </div>
    </div>
  );
}

/** Turn mail-server errors into plain language for non-technical users. */
function friendlyError(raw: string) {
  if (/application-specific password|InvalidSecondFactor|5\.7\.9/i.test(raw))
    return "This looks like your normal email password. Gmail needs an APP PASSWORD instead (a 16-letter code from Google). See Help → \"How to get an app password\".";
  if (/invalid credentials|authentication failed|AUTHENTICATIONFAILED|535|username and password not accepted/i.test(raw))
    return "Login failed. Check that your email address is correct and re-copy your app password (not your normal password). See Help for steps.";
  if (/ENOTFOUND|getaddrinfo|ETIMEDOUT|ECONNREFUSED/i.test(raw))
    return "Can't reach the email server. Check your internet connection. For company email, open 'Show server settings' and ask IT for the IMAP/SMTP details.";
  return `Connection failed: ${raw}`;
}
