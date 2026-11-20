"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { call } from "@/lib/ats";
import { Button, ErrorText, Field, Input, Modal, Select, Textarea } from "./ui";

export const TEMPLATES: Record<string, { subject: string; body: string }> = {
  Blank: { subject: "", body: "" },
  Acknowledge: {
    subject: "We received your application",
    body: "Hi {name},\n\nThank you for applying{position}. We have received your application and our team is reviewing it. We will get back to you soon.\n\nBest regards,",
  },
  Invitation: {
    subject: "Interview invitation",
    body: "Hi {name},\n\nWe would like to invite you to an interview{position}. Please see the calendar invite attached with the date, time and meeting link.\n\nLooking forward to speaking with you.\n\nBest regards,",
  },
  Offer: {
    subject: "Job offer",
    body: "Hi {name},\n\nWe are pleased to offer you the role{position}. Please find the details below and let us know if you have any questions.\n\nBest regards,",
  },
  Rejection: {
    subject: "Update on your application",
    body: "Hi {name},\n\nThank you for your interest{position} and for the time you invested. After careful consideration, we have decided to move forward with other candidates.\n\nWe wish you the best in your search.\n\nBest regards,",
  },
};

export function fillTemplate(tpl: string, name?: string, position?: string) {
  return tpl.replace(/\{name\}/g, (name || "there").split(" ")[0]).replace(/\{position\}/g, position ? ` for the ${position} position` : "");
}

export type ComposeInit = {
  to?: string;
  subject?: string;
  body?: string;
  applicantId?: number | null;
  applicantName?: string;
  position?: string;
  inReplyTo?: string | null;
  ics?: string | null;
  template?: string;
};

export default function ComposeModal({ init, onClose, onSent }: { init: ComposeInit; onClose: () => void; onSent?: () => void }) {
  const [to, setTo] = useState(init.to ?? "");
  const [subject, setSubject] = useState(init.subject ?? "");
  const [body, setBody] = useState(init.body ?? "");
  const [tpl, setTpl] = useState(init.template ?? "Blank");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyTemplate = (name: string) => {
    setTpl(name);
    const t = TEMPLATES[name];
    if (!t.subject && !t.body) return;
    const isReply = !!init.inReplyTo;
    setSubject(isReply ? subject || `Re: ${t.subject}` : t.subject);
    setBody(fillTemplate(t.body, init.applicantName, init.position));
  };

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await call("mail:send", { to, subject, body, applicantId: init.applicantId, inReplyTo: init.inReplyTo, ics: init.ics, template: tpl });
      onSent?.();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={init.inReplyTo ? "Reply" : "New email"} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <Field label="To">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="applicant@example.com" />
          </Field>
          <Field label="Template">
            <Select value={tpl} onChange={(e) => applyTemplate(e.target.value)}>
              {Object.keys(TEMPLATES).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Subject">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="Message">
          <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        {init.ics && <p className="text-xs text-muted">A calendar invite (.ics) is attached to this email.</p>}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={send} disabled={busy || !to || !subject}>
            <Send size={15} /> {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
