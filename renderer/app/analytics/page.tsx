"use client";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { call, inElectron } from "@/lib/ats";
import { Card, PageHeader, Select } from "@/components/ui";

type Data = {
  totals: { applicants: number; active: number; interviewsNext7: number; interviews: number; offered: number; hiredThisMonth: number; hired: number; rejected: number };
  sources: { name: string; value: number }[];
  monthly: { month: string; count: number }[];
  funnel: { stage: string; count: number }[];
};

const EMPTY: Data = {
  totals: { applicants: 0, active: 0, interviewsNext7: 0, interviews: 0, offered: 0, hiredThisMonth: 0, hired: 0, rejected: 0 },
  sources: [], monthly: [], funnel: [],
};

const CHART = "#c9963a";
const AXIS = { stroke: "#8b98b8", fontSize: 12 };
const TOOLTIP = { contentStyle: { background: "#16213a", border: "1px solid #24304d", borderRadius: 6 }, labelStyle: { color: "#e6eaf5" } };

const RANGES: Record<string, () => [string | undefined, string | undefined]> = {
  "All time": () => [undefined, undefined],
  "This month": () => { const d = new Date(); return [new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), undefined]; },
  "Last 3 months": () => { const d = new Date(); d.setMonth(d.getMonth() - 3); return [d.toISOString().slice(0, 10), undefined]; },
  "This year": () => [`${new Date().getFullYear()}-01-01`, undefined],
};

function Kpi({ title, value, sub }: { title: string; value: number; sub: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-panel p-4 text-center">
      <div className="text-sm text-muted">{title}</div>
      <div className="my-1 text-4xl font-semibold">{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState("All time");
  const [d, setD] = useState<Data>(EMPTY);

  useEffect(() => {
    if (!inElectron()) return;
    const [from, to] = RANGES[range]();
    call<Data>("analytics:get", from, to).then(setD);
  }, [range]);

  const t = d.totals;
  const totalSources = d.sources.reduce((s, x) => s + x.value, 0) || 1;
  const monthly = d.monthly.map((m) => ({ ...m, label: new Date(m.month + "-01").toLocaleDateString(undefined, { month: "short" }) }));

  return (
    <div>
      <PageHeader title="Hiring Analytics Overview">
        <Select className="w-40" value={range} onChange={(e) => setRange(e.target.value)}>
          {Object.keys(RANGES).map((r) => <option key={r}>{r}</option>)}
        </Select>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi title="Current Applicants" value={t.active} sub="Active Pipeline" />
          <Kpi title="Interviews Scheduled" value={t.interviewsNext7} sub="Next 7 Days" />
          <Kpi title="Offers Extended" value={t.offered} sub="Awaiting Response" />
          <Kpi title="Hired Candidates" value={t.hiredThisMonth} sub="This Month" />
          <Kpi title="Total Applicants" value={t.applicants} sub={range} />
          <Kpi title="Total Interviews" value={t.interviews} sub={range} />
          <Kpi title="Total Hired" value={t.hired} sub={range} />
          <Kpi title="Rejected" value={t.rejected} sub={range} />
        </div>

        <Card title="Applicant Source">
          {d.sources.length === 0 ? <p className="py-16 text-center text-sm text-muted">No applicants yet</p> : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={d.sources} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} stroke="#111a2e" strokeWidth={2}
                  label={({ name, value }) => `${name} ${Math.round(((value as number) / totalSources) * 100)}%`}>
                  {d.sources.map((_, i) => <Cell key={i} fill={CHART} />)}
                </Pie>
                <Tooltip {...TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Applications Received (last 12 months)">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={monthly}>
              <defs>
                <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#24304d" vertical={false} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip {...TOOLTIP} />
              <Area type="monotone" dataKey="count" name="Applications" stroke={CHART} fill="url(#fill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Pipeline Funnel">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={d.funnel}>
              <CartesianGrid stroke="#24304d" vertical={false} />
              <XAxis dataKey="stage" {...AXIS} />
              <YAxis allowDecimals={false} {...AXIS} />
              <Tooltip {...TOOLTIP} cursor={{ fill: "#16213a" }} />
              <Bar dataKey="count" name="Applicants" fill={CHART} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="count" position="top" fill="#e6eaf5" fontSize={12} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
