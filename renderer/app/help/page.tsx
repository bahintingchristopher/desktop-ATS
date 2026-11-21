"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { BarChart3, CalendarDays, ChevronDown, Folder, KeyRound, LifeBuoy, Mail, Rocket, Settings, Sparkles, Users, Video } from "lucide-react";
import { PageHeader, cx } from "@/components/ui";

type Section = { id: string; icon: typeof Mail; title: string; body: ReactNode };

const Step = ({ n, children }: { n: number; children: ReactNode }) => (
  <li className="flex gap-3">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{n}</span>
    <div className="pt-0.5">{children}</div>
  </li>
);

const Steps = ({ items }: { items: ReactNode[] }) => (
  <ol className="space-y-3">{items.map((c, i) => <Step key={i} n={i + 1}>{c}</Step>)}</ol>
);

const Tip = ({ children }: { children: ReactNode }) => (
  <p className="mt-3 rounded-md border border-accent/40 bg-accent-soft/50 px-3 py-2 text-sm">💡 {children}</p>
);

const A = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">{children}</a>
);

const SECTIONS: Section[] = [
  {
    id: "start",
    icon: Rocket,
    title: "Getting started (do this once)",
    body: (
      <>
        <Steps items={[
          <>Get an <b>app password</b> for your email (see the next section). Your normal email password will <b>not</b> work.</>,
          <>Open <Link href="/settings/" className="text-accent underline">Settings</Link>.</>,
          <>Type your <b>email address</b> and paste the <b>app password</b>.</>,
          <>Click <b>Save &amp; test connection</b>. When you see <span className="text-green-300">&quot;Connected!&quot;</span>, you&apos;re done.</>,
        ]} />
        <Tip>Everything else (calendar, recording, transcription, folders) is already set up. Nothing to install.</Tip>
      </>
    ),
  },
  {
    id: "apppassword",
    icon: KeyRound,
    title: "How to get an app password (Gmail)",
    body: (
      <>
        <p className="mb-3 text-sm text-muted">
          An app password is a special 16-letter code from Google, just for this app. It is <b className="text-fg">not</b> your
          personal Gmail password. Your Gmail login stays the same.
        </p>
        <Steps items={[
          <>Go to <A href="https://myaccount.google.com/security">myaccount.google.com/security</A> and sign in.</>,
          <>Turn on <b>2-Step Verification</b> (if it&apos;s off). Google only allows app passwords when this is on.</>,
          <>Go to <A href="https://myaccount.google.com/apppasswords">myaccount.google.com/apppasswords</A>.</>,
          <>Type a name like <b>Desktop ATS</b> and click <b>Create</b>.</>,
          <>Copy the 16-letter code (e.g. <code className="rounded bg-panel-2 px-1">abcd efgh ijkl mnop</code>) and paste it into Settings → App password.</>,
        ]} />
        <Tip>Google shows the code only once. If you lose it, delete it on the same page and create a new one.</Tip>
        <p className="mt-3 text-sm text-muted">
          <b className="text-fg">Outlook/Hotmail:</b> account.microsoft.com → Security → Advanced security options → App passwords.<br />
          <b className="text-fg">Yahoo:</b> Account Info → Account security → Generate app password.<br />
          <b className="text-fg">Company email:</b> ask your IT administrator for an app password or the IMAP/SMTP settings.
        </p>
      </>
    ),
  },
  {
    id: "mail",
    icon: Mail,
    title: "1. Mail: read and reply to applicants",
    body: (
      <Steps items={[
        <>New emails arrive automatically every minute. Click <b>Sync</b> to check right away.</>,
        <>Click an email to read it.</>,
        <>New applicant? Click <b>Create applicant</b>. Their resume attachment is saved to their folder automatically.</>,
        <>Click <b>Reply</b>, pick a <b>Template</b> (Acknowledge, Invitation, Offer, Rejection), edit if needed, and click <b>Send</b>.</>,
        <>Click <b>Compose</b> to write a new email.</>,
      ]} />
    ),
  },
  {
    id: "applicants",
    icon: Users,
    title: "2. Applicants: track each candidate and schedule interviews",
    body: (
      <>
        <Steps items={[
          <>Click a name on the left to see their details, emails, interviews and recordings.</>,
          <>Move them through the hiring steps by clicking a stage: <b>Applied → Screened → Interviewed → Offered → Hired</b> (or <b>Rejected</b>).</>,
          <>Click <b>Schedule</b>, choose the date and time, choose Google Meet or Zoom, and paste the meeting link.</>,
          <>Keep <b>&quot;Email the applicant an invitation&quot;</b> checked. They get an email with a calendar invite.</>,
          <>Open the <b>Calendar</b> tab to see all interviews. Click a day to schedule, or click an interview to join it.</>,
        ]} />
        <Tip>To create a Google Meet link, open <A href="https://meet.google.com/new">meet.google.com/new</A> and copy the address.</Tip>
      </>
    ),
  },
  {
    id: "screening",
    icon: Sparkles,
    title: "Automated screening: rank applicants by fit",
    body: (
      <>
        <Steps items={[
          <>Go to <b>Applicants → Screening</b> and click <b>New role</b>.</>,
          <>Enter the <b>job title</b> (e.g. Full-Stack Developer), <b>must-have skills</b>, <b>nice-to-have skills</b>, <b>minimum years</b> and <b>location</b>. Separate skills with commas.</>,
          <>Set the <b>pass mark</b> (default 60). Tick <b>&quot;Automatically move passing applicants&quot;</b> if you want them moved to Screened for you.</>,
          <>Click <b>Screen applicants</b>. Everyone gets a score from 0 to 100, best first.</>,
          <>Green tags = skills found, red = missing. Click a name to see the score breakdown. Use <b>Advance</b> or <b>Reject</b> to move them.</>,
        ]} />
        <Tip>
          New applicants are screened automatically when their email subject mentions an open role&apos;s title and their resume (PDF or Word) is attached.
          The score is a guide. Always read the resume before rejecting someone.
        </Tip>
      </>
    ),
  },
  {
    id: "appointment",
    icon: CalendarDays,
    title: "3. Appointment: today's and upcoming video calls",
    body: (
      <>
        <Steps items={[
          <>Schedule an interview from <b>Applicants → Schedule</b>, or from an applicant&apos;s detail card.</>,
          <>Open <Link href="/appointment/" className="text-accent underline">Appointment</Link> to see today and future Meet/Zoom interviews.</>,
          <>Rows are ordered today, tomorrow, the next day, then the following weeks.</>,
          <>Click a row&apos;s <b>Link</b> to open Tools and automatically start the embedded call for that applicant.</>,
        ]} />
        <Tip>The meeting link shown here is the one saved when the interview was scheduled. If it was left blank, Tools opens the Meet/Zoom home page.</Tip>
      </>
    ),
  },
  {
    id: "tools",
    icon: Video,
    title: "4. Tools: run the interview, record and transcribe",
    body: (
      <>
        <Steps items={[
          <>Choose the <b>applicant</b> at the top. The recording is saved to their folder.</>,
          <>Choose <b>Google Meet</b> or <b>Zoom</b>, paste the meeting link, and click <b>Join</b>. The first time, sign in to your Google/Zoom account inside the app.</>,
          <>Tell the applicant the call will be recorded, then click <b>Start Recording</b>. If Windows asks, allow screen/audio sharing.</>,
          <>When finished, click <b>Stop Recording</b>. The audio is saved and turned into text automatically. This takes a few minutes.</>,
          <>The transcript appears on the right side when it&apos;s ready.</>,
        ]} />
        <Tip>Leaving the Tools page ends the call, so stay on this page during the interview.</Tip>
      </>
    ),
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "5. Analytics: hiring numbers at a glance",
    body: (
      <p className="text-sm">
        See active applicants, interviews in the next 7 days, offers, hires and rejections, plus where applicants come from
        and how many reach each hiring step. Use the drop-down at the top right to change the date range.
      </p>
    ),
  },
  {
    id: "settings",
    icon: Settings,
    title: "6. Settings",
    body: (
      <p className="text-sm">
        Your email and app password (click the 👁 eye to show it), display name, email signature, and where applicant files are saved.
        Remember to click <b>Save</b> after changes.
      </p>
    ),
  },
  {
    id: "folder",
    icon: Folder,
    title: "7. Folder: recordings, transcripts and resumes",
    body: (
      <Steps items={[
        <>Each applicant has a folder with <b>interviews</b> (call video recording + transcript), <b>resume</b> and <b>emails</b>.</>,
        <>Click the recording (.webm) to watch the call. Click the transcript (.txt) to read the conversation, labeled by speaker (HR and the applicant).</>,
        <>Click <b>Open in Explorer</b> to see the files in Windows.</>,
      ]} />
    ),
  },
  {
    id: "trouble",
    icon: LifeBuoy,
    title: "Problems? Common fixes",
    body: (
      <ul className="space-y-3 text-sm">
        <li><b>&quot;Application-specific password required&quot;</b>: you used your normal email password. Create an app password (see above) and paste that instead.</li>
        <li><b>&quot;Invalid credentials&quot; / login failed</b>: re-copy the app password; check the email address is spelled correctly.</li>
        <li><b>No emails showing</b>: click <b>Sync</b> in Mail. Check Settings shows &quot;Connected&quot;.</li>
        <li><b>Recording has no applicant voice</b>: make sure your computer speakers/headset volume is on during the call.</li>
        <li><b>&quot;Windows protected your PC&quot; when installing</b>: click <b>More info → Run anyway</b>. This is normal for this app.</li>
      </ul>
    ),
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<string>("start");
  return (
    <div className="max-w-3xl">
      <PageHeader title="Help: How to use Desktop ATS" />
      <div className="space-y-2">
        {SECTIONS.map(({ id, icon: Icon, title, body }) => (
          <section key={id} className="rounded-lg border border-line bg-panel">
            <button onClick={() => setOpen(open === id ? "" : id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <Icon size={18} className="text-accent" />
              <span className="flex-1 font-medium">{title}</span>
              <ChevronDown size={16} className={cx("text-muted transition", open === id && "rotate-180")} />
            </button>
            {open === id && <div className="border-t border-line px-4 py-4 text-sm leading-relaxed">{body}</div>}
          </section>
        ))}
      </div>
    </div>
  );
}
