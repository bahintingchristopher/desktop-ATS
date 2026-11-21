"use client";
import { useState } from "react";
import { call, type Interview } from "@/lib/ats";
import { Button, ErrorText, Field, Input, Modal } from "./ui";

const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function AppointmentEditModal({
  interview,
  onClose,
  onSaved,
}: {
  interview: Interview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const diff = new Date(interview.end).getTime() - new Date(interview.start).getTime();
  const [start, setStart] = useState(localInput(new Date(interview.start)));
  const [minutes, setMinutes] = useState(Number.isFinite(diff) ? Math.max(15, Math.round(diff / 60_000)) : 45);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const validMinutes = Number.isFinite(minutes) && minutes >= 15;
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const s = new Date(start);
      const e = new Date(s.getTime() + minutes * 60_000);
      await call("interviews:save", {
        id: interview.id,
        applicant_id: interview.applicant_id,
        title: interview.title,
        start: s.toISOString(),
        end: e.toISOString(),
        platform: interview.platform,
        link: interview.link,
        status: interview.status || "Scheduled",
      });
      const timeChanged = s.getTime() !== new Date(interview.start).getTime() || e.getTime() !== new Date(interview.end).getTime();
      if (notify && timeChanged && interview.applicant_email) {
        // Same interview id → same calendar UID, so the applicant's calendar entry is updated.
        const ics = await call<string>("interviews:ics", { id: interview.id, title: interview.title, start: s.toISOString(), end: e.toISOString(), link: interview.link, attendee: interview.applicant_email });
        const when = s.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" });
        const body = `Hi ${interview.applicant_name || ""},

Your interview has been rescheduled.

When: ${when} (${minutes} min)
Where: ${interview.platform}${interview.link ? `
Link: ${interview.link}` : ""}`;
        await call("mail:send", { to: interview.applicant_email, subject: `Rescheduled: ${interview.title}`, body, applicantId: interview.applicant_id, ics });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete appointment for ${interview.applicant_name || "this applicant"}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await call("interviews:delete", interview.id);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit appointment" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{interview.applicant_name || `Applicant #${interview.applicant_id}`} · {interview.platform}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date & time">
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" min={15} step={15} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Field>
        </div>
        {interview.applicant_email && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Email the applicant the updated time
          </label>
        )}
        {!validMinutes && <p className="text-xs text-red-400">Duration must be at least 15 minutes.</p>}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="danger" onClick={remove} disabled={busy}>Delete</Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy || !start || !validMinutes}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
