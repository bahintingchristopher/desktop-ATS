"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { call, inElectron } from "@/lib/ats";
import { Button, Card, cx, Empty, ErrorText, Field, Input, Modal, Select, StageBadge } from "./ui";

export type Role = {
  id: number; title: string; required_skills: string[]; preferred_skills: string[];
  min_years: number; locations: string[]; threshold: number; auto_advance: boolean; active: boolean;
};
type Details = {
  score: number; passed: boolean; matchedRequired: string[]; missingRequired: string[];
  matchedPreferred: string[]; missingPreferred: string[]; years: number | null; minYears: number;
  locationMatch: string | null; sources: string[];
  breakdown: { required: number; preferred: number; experience: number; location: number };
};
type Ranked = { id: number; name: string; email: string; position: string; stage: string; score: number | null; details: Details | null };

const scoreColor = (s: number, t: number) => (s >= t ? "bg-good" : s >= t * 0.7 ? "bg-warn" : "bg-bad");

export default function Screening({ onOpenApplicant, onChanged }: { onOpenApplicant: (id: number) => void; onChanged: () => void }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState<number>(0);
  const [rows, setRows] = useState<Ranked[]>([]);
  const [edit, setEdit] = useState<Partial<Role> | null>(null);
  const [busy, setBusy] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    if (!inElectron()) return;
    const r = await call<Role[]>("roles:list");
    setRoles(r);
    setRoleId((cur) => (r.some((x) => x.id === cur) ? cur : r[0]?.id ?? 0));
  }, []);
  const loadRows = useCallback(() => {
    if (roleId) call<Ranked[]>("screening:rankings", roleId).then(setRows);
    else setRows([]);
  }, [roleId]);

  useEffect(() => { loadRoles(); }, [loadRoles]);
  useEffect(loadRows, [loadRows]);

  const role = roles.find((r) => r.id === roleId);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setRows(await call<Ranked[]>("screening:run", roleId, true));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const move = async (id: number, stage: string) => {
    await call("applicants:stage", id, stage);
    loadRows();
    onChanged();
  };

  const shown = rows.filter((r) => (r.score ?? 0) >= minScore);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Role">
            <Select className="w-64" value={roleId} onChange={(e) => setRoleId(Number(e.target.value))}>
              {roles.length === 0 && <option value={0}>No roles yet</option>}
              {roles.map((r) => <option key={r.id} value={r.id}>{r.title}{r.active ? "" : " (closed)"}</option>)}
            </Select>
          </Field>
          {role && <Button variant="ghost" onClick={() => setEdit(role)}><Pencil size={15} /> Edit criteria</Button>}
          <Button variant="ghost" onClick={() => setEdit({ threshold: 60, min_years: 0, required_skills: [], preferred_skills: [], locations: [], active: true })}>
            <Plus size={15} /> New role
          </Button>
          <div className="flex-1" />
          <Field label={`Show score ≥ ${minScore}`}>
            <input type="range" min={0} max={100} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-40 accent-[var(--color-accent)]" />
          </Field>
          <Button variant="primary" onClick={run} disabled={!roleId || busy}>
            <Sparkles size={15} /> {busy ? "Screening…" : "Screen applicants"}
          </Button>
        </div>
        {role && (
          <p className="mt-3 text-xs text-muted">
            Must have: <b className="text-fg">{role.required_skills.join(", ") || "none"}</b> · Nice to have: {role.preferred_skills.join(", ") || "none"} ·
            Min. {role.min_years} yrs · {role.locations.length ? `Location: ${role.locations.join(", ")}` : "Any location"} · Pass mark {role.threshold}
            {role.auto_advance && " · Auto-moves passing applicants to Screened"}
          </p>
        )}
        <div className="mt-2"><ErrorText error={error} /></div>
      </Card>

      <Card title={role ? `Ranking for ${role.title}` : "Ranking"}>
        {!roleId ? (
          <Empty>Create a role (e.g. &quot;Full-Stack Developer&quot;) with the skills you need, then click Screen applicants.</Empty>
        ) : shown.length === 0 ? (
          <Empty>No screened applicants yet. Click &quot;Screen applicants&quot;. Applicants in the Applied stage are scored automatically.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((r, i) => {
              const d = r.details;
              const s = r.score ?? 0;
              return (
                <li key={r.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-right text-sm text-muted">{i + 1}</span>
                    <div className="relative h-10 w-10 shrink-0">
                      <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
                        <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-line)" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeLinecap="round"
                          className={cx(s >= (role?.threshold ?? 60) ? "stroke-good" : s >= (role?.threshold ?? 60) * 0.7 ? "stroke-warn" : "stroke-bad")}
                          strokeDasharray={`${(s / 100) * 97.4} 97.4`} />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">{s}</span>
                    </div>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        {d?.passed ? <span className="rounded bg-green-500/20 px-1.5 text-xs text-green-300">Pass</span>
                          : <span className="rounded bg-red-500/20 px-1.5 text-xs text-red-300">Below criteria</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {d?.matchedRequired.map((x) => <span key={x} className="rounded bg-green-500/15 px-1.5 text-xs text-green-300"><Check size={10} className="inline" /> {x}</span>)}
                        {d?.missingRequired.map((x) => <span key={x} className="rounded bg-red-500/15 px-1.5 text-xs text-red-300"><X size={10} className="inline" /> {x}</span>)}
                        {d?.matchedPreferred.map((x) => <span key={x} className="rounded bg-sky-500/15 px-1.5 text-xs text-sky-300">+ {x}</span>)}
                      </div>
                    </button>
                    <StageBadge stage={r.stage} />
                    <div className="flex gap-1">
                      <Button onClick={() => move(r.id, "Screened")} disabled={r.stage !== "Applied"} title="Move to Screened">Advance</Button>
                      <Button variant="ghost" onClick={() => move(r.id, "Rejected")} disabled={r.stage === "Rejected"} title="Reject">Reject</Button>
                      <Button variant="ghost" onClick={() => onOpenApplicant(r.id)}>Open</Button>
                    </div>
                  </div>
                  {expanded === r.id && d && (
                    <div className="ml-[76px] mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-panel-2 p-3 text-xs md:grid-cols-4">
                      {([
                        ["Must-have skills", d.breakdown.required, 50],
                        ["Nice-to-have", d.breakdown.preferred, 20],
                        ["Experience", d.breakdown.experience, 20],
                        ["Location", d.breakdown.location, 10],
                      ] as const).map(([label, v, max]) => (
                        <div key={label}>
                          <div className="flex justify-between text-muted"><span>{label}</span><span className="text-fg">{v}/{max}</span></div>
                          <div className="mt-1 h-1.5 rounded bg-line"><div className={cx("h-1.5 rounded", scoreColor((v / max) * 100, 60))} style={{ width: `${(v / max) * 100}%` }} /></div>
                        </div>
                      ))}
                      <p className="col-span-full mt-2 text-muted">
                        Experience found: <span className="text-fg">{d.years !== null ? `${d.years} yrs` : "not mentioned"}</span> (needs {d.minYears}) ·
                        Location: <span className="text-fg">{d.locationMatch ?? "not matched"}</span> ·
                        Read from: <span className="text-fg">{d.sources.join(", ") || "no resume found. Add one to their resume folder"}</span>
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {edit && (
        <RoleForm
          init={edit}
          onClose={() => setEdit(null)}
          onSaved={async (id) => { await loadRoles(); setRoleId(id); }}
          onDeleted={async () => { await loadRoles(); setRoleId(0); }}
        />
      )}
    </div>
  );
}

const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function RoleForm({ init, onClose, onSaved, onDeleted }: { init: Partial<Role>; onClose: () => void; onSaved: (id: number) => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(init.title ?? "");
  const [req, setReq] = useState((init.required_skills ?? []).join(", "));
  const [pref, setPref] = useState((init.preferred_skills ?? []).join(", "));
  const [years, setYears] = useState(init.min_years ?? 0);
  const [loc, setLoc] = useState((init.locations ?? []).join(", "));
  const [threshold, setThreshold] = useState(init.threshold ?? 60);
  const [auto, setAuto] = useState(init.auto_advance ?? false);
  const [active, setActive] = useState(init.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      const id = await call<number>("roles:save", {
        id: init.id, title, required_skills: toList(req), preferred_skills: toList(pref),
        min_years: years, locations: toList(loc), threshold, auto_advance: auto, active,
      });
      onSaved(id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (!init.id || !confirm(`Delete role "${init.title}"? Applicant scores for it are kept.`)) return;
    await call("roles:delete", init.id);
    onDeleted();
    onClose();
  };

  return (
    <Modal title={init.id ? "Edit role criteria" : "New role"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Job title" hint="Applicants whose email subject mentions this title are screened against it automatically.">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Full-Stack Developer" />
        </Field>
        <Field label="Must-have skills (comma separated)" hint="Worth 50 points. Missing any of these means 'Below criteria'.">
          <Input value={req} onChange={(e) => setReq(e.target.value)} placeholder="React, Node.js, SQL" />
        </Field>
        <Field label="Nice-to-have skills (comma separated)" hint="Worth 20 points.">
          <Input value={pref} onChange={(e) => setPref(e.target.value)} placeholder="Next.js, TypeScript, AWS" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum years of experience" hint="Worth 20 points.">
            <Input type="number" min={0} value={years} onChange={(e) => setYears(Number(e.target.value))} />
          </Field>
          <Field label="Location(s) (comma separated)" hint="Worth 10 points. 'Remote' in the resume also counts. Leave empty for any.">
            <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Manila, Cebu" />
          </Field>
        </div>
        <Field label={`Pass mark: ${threshold} / 100`}>
          <input type="range" min={0} max={100} step={5} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          Automatically move passing applicants from Applied to Screened
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Role is open (used for automatic screening of new emails)
        </label>
        <ErrorText error={error} />
        <div className="flex items-center justify-between gap-2 pt-1">
          {init.id ? <Button variant="ghost" onClick={remove}><Trash2 size={15} /> Delete</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!title.trim()}>Save role</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
