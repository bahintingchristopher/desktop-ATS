"use client";
import { X } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Card({ title, actions, className, children }: { title?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cx("rounded-lg border border-line bg-panel p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-fg">{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = "default", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" | "ghost" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-accent text-white hover:brightness-110",
        variant === "danger" && "bg-bad text-white hover:brightness-110",
        variant === "default" && "border border-line bg-panel-2 hover:bg-accent-soft",
        variant === "ghost" && "text-muted hover:bg-panel-2 hover:text-fg",
        className,
      )}
    />
  );
}

const field = "w-full rounded-md border border-line bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent";

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(field, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(field, className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(field, className)} />;

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className={cx("max-h-[90vh] w-full overflow-auto rounded-lg border border-line bg-panel p-5 shadow-2xl", wide ? "max-w-3xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const STAGE_COLORS: Record<string, string> = {
  Applied: "bg-slate-500/20 text-slate-300",
  Screened: "bg-sky-500/20 text-sky-300",
  Interviewed: "bg-indigo-500/20 text-indigo-300",
  Offered: "bg-amber-500/20 text-amber-300",
  Hired: "bg-green-500/20 text-green-300",
  Rejected: "bg-red-500/20 text-red-300",
};

export const StageBadge = ({ stage }: { stage: string }) => (
  <span className={cx("rounded px-2 py-0.5 text-xs", STAGE_COLORS[stage] ?? "bg-panel-2 text-muted")}>{stage}</span>
);

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-xl font-medium">{title}</h1>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export const ErrorText = ({ error }: { error?: string | null }) =>
  error ? <p className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-red-300">{error}</p> : null;

export function Empty({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted">{children}</div>;
}
