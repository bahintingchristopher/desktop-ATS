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
  const [busy, setBusy] = useState(false);
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
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="danger" onClick={remove} disabled={busy}>Delete</Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy || !start}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
