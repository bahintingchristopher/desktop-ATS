"use client";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { call, type Applicant } from "@/lib/ats";
import { fillTemplate, TEMPLATES } from "./ComposeModal";
import { Button, ErrorText, Field, Input, Modal, Select } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Schedule an interview, then optionally email the applicant an invitation with an .ics calendar invite. */
export default function ScheduleModal({
  applicants,
  applicantId,
  defaultStart,
  onClose,
  onSaved,
}: {
  applicants: Applicant[];
  applicantId?: number;
  defaultStart?: Date;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const start0 = defaultStart ?? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; })();
  const [aid, setAid] = useState<number>(applicantId ?? applicants[0]?.id ?? 0);
  const [start, setStart] = useState(localInput(start0));
  const [minutes, setMinutes] = useState(45);
  const [platform, setPlatform] = useState("Google Meet");
  const [link, setLink] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const a = applicants.find((x) => x.id === Number(aid));
    if (!a) return setError("Choose an applicant");
    setBusy(true);
    setError(null);
    try {
      const s = new Date(start);
      const e = new Date(s.getTime() + minutes * 60_000);
      const title = `Interview: ${a.name}${a.position ? ` (${a.position})` : ""}`;
      const id = await call<number>("interviews:save", { applicant_id: a.id, title, start: s.toISOString(), end: e.toISOString(), platform, link });
      if (sendInvite && a.email) {
        const ics = await call<string>("interviews:ics", { id, title, start: s.toISOString(), end: e.toISOString(), link, attendee: a.email });
        const when = s.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
        const body = `${fillTemplate(TEMPLATES.Invitation.body, a.name, a.position)}\n\nWhen: ${when} (${minutes} min)\nWhere: ${platform}${link ? `\nLink: ${link}` : ""}`;
        await call("mail:send", { to: a.email, subject: TEMPLATES.Invitation.subject, body, applicantId: a.id, ics });
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Schedule interview" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Applicant">
          <Select value={aid} onChange={(e) => setAid(Number(e.target.value))}>
            {applicants.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} {a.email ? `— ${a.email}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date & time">
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" min={15} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform">
            <Select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option>Google Meet</option>
              <option>Zoom</option>
              <option>In person</option>
            </Select>
          </Field>
          <Field label="Meeting link" hint={
            platform === "In person" ? undefined : (
              <a
                href={platform === "Zoom" ? "https://zoom.us/meeting/schedule" : "https://meet.google.com/new"}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline"
              >
                {platform === "Zoom" ? "Create a Zoom meeting ↗" : "Create a Google Meet link ↗"}
              </a>
            )
          }>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
          Email the applicant an invitation with a calendar invite
        </label>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !aid}>
            <CalendarPlus size={15} /> {busy ? "Saving…" : "Schedule"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
