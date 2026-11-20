"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Interview } from "@/lib/ats";
import { Button, cx } from "./ui";

/** Simple month calendar of interviews. Click a day to schedule, click an event to open it. */
export default function Calendar({
  interviews,
  onDayClick,
  onEventClick,
}: {
  interviews: Interview[];
  onDayClick: (d: Date) => void;
  onEventClick: (i: Interview) => void;
}) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [cursor]);

  const byDay = useMemo(() => {
    const m = new Map<string, Interview[]>();
    for (const i of interviews) {
      const k = new Date(i.start).toDateString();
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    return m;
  }, [interviews]);

  const today = new Date().toDateString();
  const shift = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></Button>
        <span className="w-40 text-center font-medium">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        <Button variant="ghost" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></Button>
        <Button variant="ghost" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }}>Today</Button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-panel-2 px-2 py-1 text-xs text-muted">{d}</div>
        ))}
        {days.map((d) => {
          const evs = byDay.get(d.toDateString()) ?? [];
          const other = d.getMonth() !== cursor.getMonth();
          return (
            <div
              key={d.toISOString()}
              onClick={() => { const s = new Date(d); s.setHours(10, 0, 0, 0); onDayClick(s); }}
              className={cx("min-h-24 cursor-pointer bg-panel p-1.5 hover:bg-panel-2", other && "opacity-40")}
            >
              <div className={cx("mb-1 text-xs", d.toDateString() === today ? "inline-block rounded-full bg-accent px-1.5 text-white" : "text-muted")}>
                {d.getDate()}
              </div>
              {evs.map((e) => (
                <button
                  key={e.id}
                  onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                  className="mb-1 block w-full truncate rounded bg-accent-soft px-1.5 py-0.5 text-left text-xs hover:bg-accent"
                  title={e.title}
                >
                  {new Date(e.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} {e.applicant_name}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
