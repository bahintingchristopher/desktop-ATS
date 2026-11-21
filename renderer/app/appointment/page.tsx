"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, Empty, ErrorText, PageHeader } from "@/components/ui";
import { call, inElectron, on, type Interview } from "@/lib/ats";

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const videoPlatform = (p: string) => p === "Google Meet" || p === "Zoom";

const toolsHref = (i: Interview) => {
  const fallback = i.platform === "Zoom" ? "https://app.zoom.us/wc/home" : "https://meet.google.com/";
  const query = new URLSearchParams({ applicant: String(i.applicant_id), link: i.link || fallback, autojoin: "1" });
  return `/tools/?${query.toString()}`;
};

export default function AppointmentPage() {
  const [rows, setRows] = useState<Interview[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!inElectron()) return;
    call<Interview[]>("interviews:list", startOfToday())
      .then((list) => {
        setRows(
          list
            .filter((i) => (i.status || "Scheduled") === "Scheduled" && videoPlatform(i.platform))
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
        );
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    load();
    return on("mail:updated", load);
  }, [load]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Appointment" />
      <Card className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <ErrorText error={error} />
        ) : rows.length === 0 ? (
          <Empty>
            <div className="text-center">
              <p>No upcoming video-call appointments.</p>
              <p className="mt-1 text-xs text-muted">Schedule an interview from Applicants to see it here.</p>
            </div>
          </Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Applicant Name</th>
                <th className="px-4 py-3">Appointment Date</th>
                <th className="px-4 py-3">Appointment Time</th>
                <th className="px-4 py-3">Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="border-t border-line">
                  <td className="px-4 py-3">{i.applicant_name || `Applicant #${i.applicant_id}`}</td>
                  <td className="px-4 py-3">{fmtDate(i.start)}</td>
                  <td className="px-4 py-3">{fmtTime(i.start)}</td>
                  <td className="px-4 py-3">
                    <Link className="text-accent underline" href={toolsHref(i)}>
                      {i.link ? "Join" : i.platform === "Zoom" ? "Open Zoom" : "Open Meet"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
