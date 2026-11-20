import { useEffect, useState } from "react";

// Typed bridge to the Electron main process (see main/preload.ts and main/main.ts).

type Bridge = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, cb: (payload: unknown) => void) => () => void;
};

declare global {
  interface Window {
    ats?: Bridge;
  }
}

export const inElectron = () => typeof window !== "undefined" && !!window.ats;

export async function call<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  if (!inElectron()) throw new Error("Desktop features are only available inside the Desktop ATS app.");
  try {
    return (await window.ats!.invoke(channel, ...args)) as T;
  } catch (e) {
    // Strip Electron's "Error invoking remote method 'x': Error:" prefix
    const msg = String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
    throw new Error(msg);
  }
}

export function on(channel: string, cb: (payload: unknown) => void) {
  return inElectron() ? window.ats!.on(channel, cb) : () => undefined;
}

/* ---------- Shared types ---------- */
export const STAGES = ["Applied", "Screened", "Interviewed", "Offered", "Hired", "Rejected"] as const;
export const SOURCES = ["Email", "LinkedIn", "Careers Page", "Referral", "Job Board", "Other"] as const;

export type Applicant = {
  id: number;
  name: string;
  email: string | null;
  phone: string;
  position: string;
  source: string;
  stage: string;
  notes: string;
  created_at: string;
  unread?: number;
  next_interview?: string | null;
  score?: number | null;
  role_id?: number | null;
};

export type EmailRow = {
  id: number;
  message_id: string;
  applicant_id: number | null;
  applicant_name?: string | null;
  from_addr: string;
  from_name: string;
  to_addr: string;
  subject: string;
  preview?: string;
  text?: string;
  html?: string;
  date: string;
  is_read: number;
  attachments: string;
};

export type Interview = {
  id: number;
  applicant_id: number;
  applicant_name?: string;
  applicant_email?: string;
  title: string;
  start: string;
  end: string;
  platform: string;
  link: string;
  status: string;
};

export type Recording = {
  id: number;
  applicant_id: number;
  audio_path: string;
  transcript_path: string | null;
  status: string;
  created_at: string;
};

export type FileNode = { name: string; path: string; isDir: boolean; size: number; mtime: string; children?: FileNode[] };

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Hydration-safe check: false during static prerender and first paint, true once mounted inside Electron. */
export function useIsElectron() {
  const [v, setV] = useState<boolean | null>(null); // null = not mounted yet
  useEffect(() => setV(inElectron()), []);
  return v;
}
