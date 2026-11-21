"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, CircleHelp, Folder, Mail, Settings, Users, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { call, inElectron, on, useIsElectron } from "@/lib/ats";
import { cx } from "./ui";

const NAV = [
  { href: "/mail/", label: "Mail", icon: Mail },
  { href: "/applicants/", label: "Applicants", icon: Users },
  { href: "/appointment/", label: "Appointment", icon: CalendarDays },
  { href: "/tools/", label: "Tools", icon: Video, hint: "Zoom · Meet" },
  { href: "/analytics/", label: "Analytics", icon: BarChart3 },
  { href: "/settings/", label: "Settings", icon: Settings },
  { href: "/folder/", label: "Folder", icon: Folder },
  { href: "/help/", label: "Help", icon: CircleHelp },
];

export default function Sidebar() {
  const path = usePathname();
  const electron = useIsElectron();
  const [unread, setUnread] = useState(0);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    if (!inElectron()) return;
    const load = () => {
      call<number>("mail:unreadCount").then(setUnread).catch(() => undefined);
      call<boolean>("settings:configured").then(setConfigured).catch(() => undefined);
    };
    load();
    const off = on("mail:updated", (payload) => {
      load();
      const unread = (payload as { unread?: number } | undefined)?.unread;
      if (typeof unread === "number") setUnread(unread);
    });
    const t = setInterval(load, 30_000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [path]);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-line bg-sidebar">
      <div className="px-3 pb-3 pt-4">
        <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- static export, plain img is fine */}
          <img src="/logo-wide.webp" alt="ALMA" className="mx-auto h-12 w-auto object-contain" />
        </div>
        <p className="mt-2 text-center text-xs font-medium tracking-wide text-slate-300/80">Desktop ATS Workspace</p>
      </div>
      <nav className="flex-1 space-y-1 px-2">
        {NAV.map(({ href, label, icon: Icon, hint }) => {
          const active = path?.startsWith(href.slice(0, -1));
          return (
            <Link
              key={href}
              href={href}
              className={cx(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                active ? "bg-sidebar-active text-white" : "text-slate-300/80 hover:bg-sidebar-active/60 hover:text-white",
              )}
            >
              <Icon size={17} />
              <span className="flex-1">{label}</span>
              {label === "Mail" && unread > 0 && (
                <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-bad px-1.5 py-0.5 text-[10px] font-bold text-white">
                  <Mail size={10} /> {unread}
                </span>
              )}
              {label === "Settings" && !configured && <span className="h-2 w-2 rounded-full bg-warn" title="Email not set up" />}
              {hint && <span className="text-[10px] text-slate-400/70">{hint}</span>}
            </Link>
          );
        })}
      </nav>
      {electron === false && (
        <p className="m-3 rounded-md border border-warn/40 bg-warn/10 p-2 text-xs text-amber-200">
          Browser preview. Run the desktop app (npm run dev at project root) for email, files and meetings.
        </p>
      )}
    </aside>
  );
}
