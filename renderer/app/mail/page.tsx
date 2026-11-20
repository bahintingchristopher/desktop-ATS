"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Inbox, Paperclip, PenSquare, RefreshCw, Reply, Send, UserPlus } from "lucide-react";
import { call, fmtDate, inElectron, on, useIsElectron, type Applicant, type EmailRow } from "@/lib/ats";
import ComposeModal, { type ComposeInit } from "@/components/ComposeModal";
import ScheduleModal from "@/components/ScheduleModal";
import { Button, cx, Empty, ErrorText, Input, PageHeader } from "@/components/ui";

export default function MailPage() {
  const electron = useIsElectron();
  const [folder, setFolder] = useState<"INBOX" | "SENT">("INBOX");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<EmailRow[]>([]);
  const [sel, setSel] = useState<EmailRow | null>(null);
  const [compose, setCompose] = useState<ComposeInit | null>(null);
  const [schedule, setSchedule] = useState<number | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!inElectron()) return;
    call<EmailRow[]>("mail:list", folder, search).then(setList).catch((e) => setError(e.message));
    call<Applicant[]>("applicants:list").then(setApplicants);
  }, [folder, search]);

  useEffect(() => {
    load();
    return on("mail:updated", load);
  }, [load]);

  const open = async (m: EmailRow) => {
    setSel(await call<EmailRow>("mail:get", m.id));
    load();
  };

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await call("mail:sync");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const createApplicant = async (m: EmailRow) => {
    const id = await call<number>("applicants:save", {
      name: m.from_name || m.from_addr.split("@")[0],
      email: m.from_addr,
      source: "Email",
      position: m.subject.replace(/^(re|fwd?):\s*/i, "").replace(/application( for)?/i, "").trim().slice(0, 80),
    });
    if (JSON.parse(m.attachments || "[]").length) await call("mail:saveAttachments", m.id, id).catch(() => undefined);
    await call("screening:auto", id).catch(() => undefined);
    setSel(await call<EmailRow>("mail:get", m.id));
    load();
  };

  const applicantOf = (m: EmailRow) => applicants.find((a) => a.id === m.applicant_id);

  const reply = (m: EmailRow) => {
    const a = applicantOf(m);
    setCompose({
      to: folder === "INBOX" ? m.from_addr : m.to_addr,
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      inReplyTo: m.message_id,
      applicantId: m.applicant_id,
      applicantName: a?.name ?? m.from_name,
      position: a?.position,
      body: `\n\n\nOn ${new Date(m.date).toLocaleString()}, ${m.from_name || m.from_addr} wrote:\n${(m.text ?? "").split("\n").map((l) => "> " + l).join("\n")}`,
    });
  };

  const atts: { filename: string; size: number }[] = sel ? JSON.parse(sel.attachments || "[]") : [];

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Mail">
        <Button onClick={sync} disabled={syncing}>
          <RefreshCw size={15} className={cx(syncing && "animate-spin")} /> Sync
        </Button>
        <Button variant="primary" onClick={() => setCompose({})}>
          <PenSquare size={15} /> Compose
        </Button>
      </PageHeader>
      <ErrorText error={error} />

      <div className="mt-2 grid min-h-0 flex-1 grid-cols-[360px_1fr] gap-4">
        <div className="flex min-h-0 flex-col rounded-lg border border-line bg-panel">
          <div className="flex gap-1 border-b border-line p-2">
            {(["INBOX", "SENT"] as const).map((f) => (
              <Button key={f} variant={folder === f ? "default" : "ghost"} onClick={() => { setFolder(f); setSel(null); }}>
                {f === "INBOX" ? <Inbox size={15} /> : <Send size={15} />} {f === "INBOX" ? "Inbox" : "Sent"}
              </Button>
            ))}
            <Input className="ml-auto max-w-40" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <ul className="min-h-0 flex-1 overflow-auto">
            {list.length === 0 && <Empty>{electron ? "No emails yet. Set up your email in Settings, then Sync." : "Open in desktop app"}</Empty>}
            {list.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => open(m)}
                  className={cx("block w-full border-b border-line px-3 py-2.5 text-left hover:bg-panel-2", sel?.id === m.id && "bg-accent-soft")}
                >
                  <div className="flex items-center gap-2">
                    {!m.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
                    <span className={cx("flex-1 truncate text-sm", !m.is_read && "font-semibold")}>
                      {folder === "INBOX" ? m.from_name || m.from_addr : `To: ${m.to_addr}`}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{fmtDate(m.date)}</span>
                  </div>
                  <div className="truncate text-sm">{m.subject}</div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {m.applicant_name && <span className="rounded bg-accent-soft px-1.5 text-fg">{m.applicant_name}</span>}
                    {JSON.parse(m.attachments || "[]").length > 0 && <Paperclip size={12} />}
                    <span className="truncate">{m.preview}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-h-0 overflow-auto rounded-lg border border-line bg-panel p-5">
          {!sel ? (
            <Empty>Select an email to read</Empty>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-medium">{sel.subject}</h2>
                <p className="text-sm text-muted">
                  From <span className="text-fg">{sel.from_name || sel.from_addr}</span> &lt;{sel.from_addr}&gt; · To {sel.to_addr} · {fmtDate(sel.date)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => reply(sel)}>
                  <Reply size={15} /> Reply
                </Button>
                {sel.applicant_id ? (
                  <Button onClick={() => setSchedule(sel.applicant_id!)}>
                    <CalendarPlus size={15} /> Schedule interview
                  </Button>
                ) : (
                  folder === "INBOX" && (
                    <Button onClick={() => createApplicant(sel)}>
                      <UserPlus size={15} /> Create applicant
                    </Button>
                  )
                )}
              </div>
              {atts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {atts.map((a, i) => (
                    <span key={i} className="flex items-center gap-1 rounded border border-line px-2 py-1 text-xs">
                      <Paperclip size={12} /> {a.filename} <span className="text-muted">({Math.round(a.size / 1024)} KB)</span>
                    </span>
                  ))}
                  {sel.applicant_id && <span className="self-center text-xs text-muted">Saved to the applicant&apos;s resume folder</span>}
                </div>
              )}
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{sel.text || "(no text content)"}</pre>
            </div>
          )}
        </div>
      </div>

      {compose && <ComposeModal init={compose} onClose={() => setCompose(null)} onSent={load} />}
      {schedule && <ScheduleModal applicants={applicants} applicantId={schedule} onClose={() => setSchedule(null)} onSaved={load} />}
    </div>
  );
}
