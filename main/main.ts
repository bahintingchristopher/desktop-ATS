import { app, BrowserWindow, desktopCapturer, ipcMain, net, protocol, session, shell } from "electron";
import path from "path";
import { pathToFileURL } from "url";
import { getDb } from "./db";
import * as data from "./services/data";
import * as files from "./services/files";
import * as mail from "./services/mail";
import * as meetings from "./services/meetings";
import * as screening from "./services/screening";
import { getAllSettings, getSetting, saveSettings, mailConfig } from "./services/settings";
import { installTranscriptionTools, toolStatus, transcribe } from "./services/transcribe";

const isDev = process.env.ATS_DEV === "1";
const OUT = path.join(app.getAppPath(), "renderer", ".next-build");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a192f",
    title: "Desktop ATS Workspace",
    icon: path.join(app.getAppPath(), "build", "icon.ico"),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  // First run: go straight to Settings so HR only has to enter their email.
  const c = mailConfig();
  const page = c.email && c.password ? "analytics" : "settings";
  win.loadURL(isDev ? `http://localhost:3000/${page}/` : `app://ats/${page}/`);
}

/** Serves the static Next.js export (renderer/.next-build) under app://ats/ */
function registerAppProtocol() {
  protocol.handle("app", (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (p.endsWith("/")) p += "index.html";
    let file = path.normalize(path.join(OUT, p));
    if (!file.startsWith(OUT)) return new Response("Forbidden", { status: 403 });
    if (!path.extname(file)) file += ".html";
    return net.fetch(pathToFileURL(file).toString());
  });
}

type Handler = (...args: any[]) => unknown;
function handle(channel: string, fn: Handler) {
  ipcMain.handle(channel, async (_e, ...args) => fn(...args));
}

function registerIpc() {
  // Settings
  handle("settings:get", () => getAllSettings());
  handle("settings:save", (s) => {
    saveSettings(s);
    if (mailConfig().email && mailConfig().password) mail.startAutoSync();
  });
  handle("settings:revealPassword", () => getSetting("mail.password"));
  handle("settings:configured", () => {
    const c = mailConfig();
    return !!(c.email && c.password);
  });

  // Mail
  handle("mail:test", () => mail.testConnection());
  handle("mail:sync", () => mail.syncInbox());
  handle("mail:list", (folder, search) => data.listEmails(folder, search));
  handle("mail:unreadCount", () => data.unreadInboxCount());
  handle("mail:get", (id) => {
    const email = data.getEmail(Number(id));
    mail.notifyUpdated();
    return email;
  });
  handle("mail:send", (input) => mail.sendMail(input));
  handle("mail:saveAttachments", (emailId, applicantId) => mail.saveEmailAttachments(emailId, applicantId));
  handle("mail:delete", (id) => mail.deleteEmail(Number(id)));

  // Applicants
  handle("applicants:list", () => data.listApplicants());
  handle("applicants:get", (id) => data.getApplicant(id));
  handle("applicants:save", (a) => {
    const id = data.saveApplicant(a);
    files.applicantDir(id);
    return id;
  });
  handle("applicants:stage", (id, stage) => data.setStage(id, stage));
  handle("applicants:delete", (id) => data.deleteApplicant(id));

  // Interviews / calendar
  handle("interviews:list", (from, to) => data.listInterviews(from, to));
  handle("interviews:save", (i) => data.saveInterview(i));
  handle("interviews:delete", (id) => data.deleteInterview(id));
  handle("interviews:ics", (i) => data.buildIcs(i));

  // Automated screening
  handle("roles:list", () => screening.listRoles());
  handle("roles:save", (r) => screening.saveRole(r));
  handle("roles:delete", (id) => screening.deleteRole(id));
  handle("screening:run", (roleId, includeUnassigned) => screening.screenRole(roleId, includeUnassigned));
  handle("screening:one", (applicantId, roleId) => screening.screenApplicant(applicantId, roleId));
  handle("screening:rankings", (roleId) => screening.rankings(roleId));
  handle("screening:auto", (applicantId) => screening.autoScreen(applicantId));

  // Analytics
  handle("analytics:get", (from, to) => data.analytics(from, to));

  // Files / folder
  handle("files:root", () => files.dataRoot());
  handle("files:tree", (dir) => { files.removeLegacyEmailFolders(); return files.listTree(dir); });
  handle("files:orphanApplicants", () => files.orphanApplicantFolders());
  handle("files:applicantDir", (id) => files.applicantDir(id));
  handle("files:readText", (p) => files.readText(p));
  handle("files:readBinary", (p) => files.readBinary(p));
  handle("files:open", (p) => files.openPath(p));
  handle("files:reveal", (p) => files.showInFolder(p));
  handle("files:deleteApplicant", (applicantId, folderPath) => {
    if (folderPath) files.removeApplicantFolder(folderPath);
    else files.removeApplicantFolder(files.applicantDirPath(applicantId));
    if (applicantId != null) data.deleteApplicant(Number(applicantId));
    return true;
  });

  // Recording + transcription
  handle("recording:save", (applicantId, buf, interviewId) => files.saveRecording(applicantId, buf, interviewId));
  handle("transcribe:run", (recordingId) => transcribe(recordingId));
  handle("transcribe:status", () => toolStatus());
  handle("setup:installTools", () => installTranscriptionTools());

  // Meetings (Google Meet / Zoom web client embedded as a WebContentsView)
  handle("meeting:open", (url, bounds) => win && meetings.openMeeting(win, url, bounds));
  handle("meeting:bounds", (bounds) => meetings.setMeetingBounds(bounds));
  handle("meeting:visible", (v) => meetings.setMeetingVisible(v));
  handle("meeting:close", () => win && meetings.closeMeeting(win));
}

// Only one copy of the app: opening it again just focuses the existing window.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

/**
 * After install, fetch the Whisper model (~3 GB for large-v3) in the background so the first
 * interview doesn't have to wait. Retries every 10 minutes while offline; stops once everything is present.
 */
function autoInstallTranscriptionTools() {
  const ready = () => { const t = toolStatus(); return t.ffmpeg && t.whisper && t.model; };
  const attempt = () => {
    if (ready()) return;
    installTranscriptionTools()
      .catch((e) => console.warn("Transcription tools download failed, retrying later:", e))
      .finally(() => { if (!ready()) setTimeout(attempt, 10 * 60_000); });
  };
  setTimeout(attempt, 5_000); // let the window open first
}

app.whenReady().then(() => {
  getDb();
  registerAppProtocol();
  registerIpc();

  // Allow mic for recording; getDisplayMedia returns system ("loopback") audio so both sides of the call are captured.
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(["media", "display-capture"].includes(perm)));
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => cb({ video: sources[0], audio: "loopback" }));
  });

  createWindow();
  if (mailConfig().email) mail.startAutoSync();
  autoInstallTranscriptionTools();

  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => app.quit());
