# Desktop ATS Workspace

An applicant tracking system for Windows, built with Electron + Next.js. All data stays on your laptop.

| Menu | What it does |
|---|---|
| 1. Mail | Inbox/Sent for your email account. Reply with templates (Acknowledge, Invitation, Offer, Rejection) and create applicants from incoming emails. Attachments are saved to the applicant's `resume/` folder. |
| 2. Applicants | Pipeline stages (Applied → Screened → Interviewed → Offered → Hired/Rejected), applicant details, and a **Calendar** tab. Scheduling an interview emails the applicant an invite with a `.ics` calendar attachment. |
| 3. Tools | Interview Room. Google Meet or Zoom (web client) runs inside the app. **Start Recording** captures your mic plus the call's audio. When you stop, the recording is saved and transcribed automatically. |
| 4. Analytics | KPIs (active applicants, interviews in the next 7 days, offers, hires, rejections), applicant sources, applications per month, and the pipeline funnel. |
| 5. Settings | Your email and **app password**, data folder, signature and Whisper model. |
| 6. Folder | `Documents\MyATS_Data\Applicants\<Name>_<id>\` with `interviews/`, `resume/` and `emails/` subfolders. Play call audio, and the matching transcript line is highlighted. Click a line to jump to that point. |

## Setup

```bash
npm install                 # root (Electron + main-process deps)
npm --prefix renderer install
npm run dev                 # starts Next.js on :3000 and opens the Electron window
```

### Email
Settings → enter your email and an **app password** → **Save & test connection**.
- Gmail: turn on 2-Step Verification, then go to https://myaccount.google.com/apppasswords
- Outlook/Hotmail: account.microsoft.com → Security → App passwords
- Other providers: open "Show server settings" and enter the IMAP/SMTP host and port.

The password is encrypted with Windows DPAPI (Electron `safeStorage`). The inbox syncs every 60 s.

### Transcription (local, offline)
Put these files in `resources/`:
```
resources/ffmpeg.exe                     https://www.gyan.dev/ffmpeg/builds/  (essentials build → bin/ffmpeg.exe)
resources/whisper-cli.exe (+ its .dll)   https://github.com/ggml-org/whisper.cpp/releases  (whisper-bin-x64.zip)
resources/models/ggml-base.en.bin        https://huggingface.co/ggerganov/whisper.cpp/tree/main
```
Settings → Transcription shows whether each file was found.

### Build the installer
```bash
npm run dist     # outputs dist/Desktop ATS Workspace Setup x.y.z.exe
```

## Structure
```
main/                  Electron main process (TypeScript → dist-main/)
  main.ts              window, app:// protocol, IPC routes, screen/audio capture permissions
  preload.ts           window.ats bridge (invoke / on)
  db/index.ts          SQLite schema (applicants, emails, interviews, recordings, stage_history, settings)
  services/
    settings.ts        settings + encrypted password + IMAP/SMTP presets
    mail.ts            IMAP sync (imapflow), SMTP send (nodemailer), applicant matching
    data.ts            applicants, interviews, .ics invites, analytics queries
    files.ts           per-applicant folders, recordings, safe file access
    transcribe.ts      ffmpeg → whisper.cpp → .txt/.srt
    meetings.ts        embedded Google Meet / Zoom view
  renderer/              Next.js (static export → renderer/.next-build/)
  app/{mail,applicants,tools,analytics,settings,folder}/page.tsx
  components/          Sidebar, ui, ComposeModal, ScheduleModal, Calendar
  lib/ats.ts           typed IPC client + shared types
resources/             ffmpeg / whisper binaries + models (bundled into the installer)
```

## Notes
- Google Meet does not allow being embedded in an iframe, so the meeting opens in a native Electron view placed inside the Tools panel. Zoom `zoom.us/j/<id>` links are switched to Zoom's web client.
- Tell participants before you record. Recording laws vary by country.
