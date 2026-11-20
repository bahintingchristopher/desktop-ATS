"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, CalendarPlus, FolderOpen, List, Mail, Plus, Sparkles, Trash2, Video } from "lucide-react";
import { call, fmtDate, inElectron, on, SOURCES, STAGES, type Applicant, type EmailRow, type Interview, type Recording } from "@/lib/ats";
import Calendar from "@/components/Calendar";
import ComposeModal, { type ComposeInit } from "@/components/ComposeModal";
import ScheduleModal from "@/components/ScheduleModal";
import Screening from "@/components/Screening";
import { Button, Card, cx, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, StageBadge, Textarea } from "@/components/ui";

type Detail = { applicant: Applicant; emails: EmailRow[]; interviews: Interview[]; recordings: Recording[] };

export default function ApplicantsPage() {
  const [tab, setTab] = useState<"list" | "calendar" | "screening">("list");
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [edit, setEdit] = useState<Partial<Applicant> | null>(null);
  const [schedule, setSchedule] = useState<{ applicantId?: number; start?: Date } | null>(null);
  const [compose, setCompose] = useState<ComposeInit | null>(null);
  const [eventView, setEventView] = useState<Interview | null>(null);

  const load = useCallback(() => {
    if (!inElectron()) return;
    call<Applicant[]>("applicants:list").then(setApplicants);
    call<Interview[]>("interviews:list").then(setInterviews);
  }, []);

  const loadDetail = useCallback(() => {
    if (selId) call<Detail>("applicants:get", selId).then(setDetail);
    else setDetail(null);
  }, [selId]);

  useEffect(() => {
    load();
    return on("mail:updated", load);
  }, [load]);
  useEffect(loadDetail, [loadDetail]);
  useEffect(() => on("mail:updated", loadDetail), [loadDetail]);

  const refresh = () => { load(); loadDetail(); };

  const shown = applicants.filter(
    (a) => (stageFilter === "All" || a.stage === stageFilter) &&
      `${a.name} ${a.email} ${a.position}`.toLowerCase().includes(filter.toLowerCase()),
  );

  const changeStage = async (stage: string) => {
    if (!detail) return;
    await call("applicants:stage", detail.applicant.id, stage);
    refresh();
  };

  const remove = async () => {
    if (!detail || !confirm(`Delete ${detail.applicant.name}? Their files on disk are kept.`)) return;
    await call("applicants:delete", detail.applicant.id);
    setSelId(null);
    load();
  };

  const a = detail?.applicant;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Applicants">
        <div className="flex rounded-md border border-line">
          <Button variant={tab === "list" ? "default" : "ghost"} onClick={() => setTab("list")}><List size={15} /> List</Button>
          <Button variant={tab === "calendar" ? "default" : "ghost"} onClick={() => setTab("calendar")}><CalendarDays size={15} /> Calendar</Button>
          <Button variant={tab === "screening" ? "default" : "ghost"} onClick={() => setTab("screening")}><Sparkles size={15} /> Screening</Button>
        </div>
        <Button onClick={() => setSchedule({})} disabled={!applicants.length}><CalendarPlus size={15} /> Schedule</Button>
        <Button variant="primary" onClick={() => setEdit({ stage: "Applied", source: "Email" })}><Plus size={15} /> Add applicant</Button>
      </PageHeader>

      {tab === "screening" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <Screening onOpenApplicant={(id) => { setSelId(id); setTab("list"); }} onChanged={load} />
        </div>
      ) : tab === "calendar" ? (
        <Card>
          <Calendar
            interviews={interviews}
            onDayClick={(d) => applicants.length && setSchedule({ start: d })}
            onEventClick={setEventView}
          />
        </Card>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] gap-4">
          <div className="flex min-h-0 flex-col rounded-lg border border-line bg-panel">
            <div className="space-y-2 border-b border-line p-2">
              <Input placeholder="Search applicants" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                <option>All</option>
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </div>
            <ul className="min-h-0 flex-1 overflow-auto">
              {shown.length === 0 && <Empty>No applicants</Empty>}
              {shown.map((x) => (
                <li key={x.id}>
                  <button
                    onClick={() => setSelId(x.id)}
                    className={cx("flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left hover:bg-panel-2", selId === x.id && "bg-accent-soft")}
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-2 text-sm">{x.name[0]?.toUpperCase()}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{x.name}</div>
                      <div className="truncate text-xs text-muted">{x.position || x.email}</div>
                    </div>
                    {x.score != null && <span className="rounded bg-panel-2 px-1.5 text-xs text-muted" title="Screening score">{x.score}</span>}
                    <StageBadge stage={x.stage} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="min-h-0 overflow-auto">
            {!a ? (
              <Card><Empty>Select an applicant</Empty></Card>
            ) : (
              <div className="space-y-4">
                <Card>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="flex-1">
                      <h2 className="text-lg font-medium">{a.name}</h2>
                      <p className="text-sm text-muted">{[a.position, a.email, a.phone].filter(Boolean).join(" · ")}</p>
                      <p className="mt-1 text-xs text-muted">Source: {a.source} · Added {fmtDate(a.created_at + "Z")}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setEdit(a)}>Edit</Button>
                      <Button onClick={() => setCompose({ to: a.email ?? "", applicantId: a.id, applicantName: a.name, position: a.position })} disabled={!a.email}><Mail size={15} /> Email</Button>
                      <Button onClick={() => setSchedule({ applicantId: a.id })}><CalendarPlus size={15} /> Schedule</Button>
                      <Link href={`/folder/?applicant=${a.id}`}><Button><FolderOpen size={15} /> Folder</Button></Link>
                      <Button variant="ghost" onClick={remove} aria-label="Delete"><Trash2 size={15} /></Button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1">
                    {STAGES.map((s) => (
                      <button
                        key={s}
                        onClick={() => changeStage(s)}
                        className={cx("rounded-md border px-3 py-1 text-xs", a.stage === s ? "border-accent bg-accent text-white" : "border-line text-muted hover:text-fg")}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  {a.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{a.notes}</p>}
                </Card>

                <Card title="Interviews">
                  {detail.interviews.length === 0 ? <p className="text-sm text-muted">No interviews yet.</p> : (
                    <ul className="divide-y divide-line">
                      {detail.interviews.map((i) => (
                        <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                          <span className="w-44 text-muted">{fmtDate(i.start)}</span>
                          <span className="flex-1">{i.platform}</span>
                          {i.link && <Link href={`/tools/?applicant=${a.id}&link=${encodeURIComponent(i.link)}`}><Button><Video size={15} /> Join</Button></Link>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Emails">
                  {detail.emails.length === 0 ? <p className="text-sm text-muted">No emails.</p> : (
                    <ul className="divide-y divide-line">
                      {detail.emails.map((e) => (
                        <li key={e.id} className="py-2 text-sm">
                          <div className="flex gap-2">
                            <span className={cx("rounded px-1.5 text-xs", e.from_addr === a.email ? "bg-sky-500/20 text-sky-300" : "bg-green-500/20 text-green-300")}>
                              {e.from_addr === a.email ? "Received" : "Sent"}
                            </span>
                            <span className="flex-1 truncate">{e.subject}</span>
                            <span className="text-xs text-muted">{fmtDate(e.date)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card title="Recordings & transcripts">
                  {detail.recordings.length === 0 ? <p className="text-sm text-muted">No recordings yet. Record from Tools during a call.</p> : (
                    <ul className="divide-y divide-line">
                      {detail.recordings.map((r) => (
                        <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                          <span className="flex-1 truncate">{r.audio_path.split(/[\\/]/).pop()}</span>
                          <span className="text-xs text-muted">{r.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            )}
          </div>
        </div>
      )}

      {edit && <ApplicantForm init={edit} onClose={() => setEdit(null)} onSaved={(id) => { setSelId(id); refresh(); }} />}
      {schedule && <ScheduleModal applicants={applicants} applicantId={schedule.applicantId} defaultStart={schedule.start} onClose={() => setSchedule(null)} onSaved={refresh} />}
      {compose && <ComposeModal init={compose} onClose={() => setCompose(null)} onSent={refresh} />}
      {eventView && (
        <Modal title={eventView.title} onClose={() => setEventView(null)}>
          <div className="space-y-2 text-sm">
            <p>{new Date(eventView.start).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}</p>
            <p className="text-muted">{eventView.platform} {eventView.link && `· ${eventView.link}`}</p>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="danger" onClick={async () => { await call("interviews:delete", eventView.id); setEventView(null); refresh(); }}>Delete</Button>
              <Button onClick={() => { setSelId(eventView.applicant_id); setTab("list"); setEventView(null); }}>Open applicant</Button>
              {eventView.link && <Link href={`/tools/?applicant=${eventView.applicant_id}&link=${encodeURIComponent(eventView.link)}`}><Button variant="primary"><Video size={15} /> Join</Button></Link>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ApplicantForm({ init, onClose, onSaved }: { init: Partial<Applicant>; onClose: () => void; onSaved: (id: number) => void }) {
  const [f, setF] = useState<Partial<Applicant>>(init);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Applicant) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async () => {
    try {
      const id = await call<number>("applicants:save", { ...f, email: f.email?.trim() || null });
      onSaved(id);
      onClose();
    } catch (e) {
      setError((e as Error).message.includes("UNIQUE") ? "An applicant with this email already exists." : (e as Error).message);
    }
  };

  return (
    <Modal title={init.id ? "Edit applicant" : "Add applicant"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Full name"><Input value={f.name ?? ""} onChange={set("name")} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><Input value={f.email ?? ""} onChange={set("email")} /></Field>
          <Field label="Phone"><Input value={f.phone ?? ""} onChange={set("phone")} /></Field>
        </div>
        <Field label="Position"><Input value={f.position ?? ""} onChange={set("position")} placeholder="Full-Stack Developer" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Source">
            <Select value={f.source} onChange={set("source")}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</Select>
          </Field>
          <Field label="Stage">
            <Select value={f.stage} onChange={set("stage")}>{STAGES.map((s) => <option key={s}>{s}</option>)}</Select>
          </Field>
        </div>
        <Field label="Notes"><Textarea rows={3} value={f.notes ?? ""} onChange={set("notes")} /></Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!f.name?.trim()}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
