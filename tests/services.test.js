const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ats-tests-"));
const userData = path.join(temp, "userData");
const dataFolder = path.join(temp, "MyATS_Data");
const bundledResources = path.join(temp, "resources");
const shellCalls = [];

fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(path.join(dataFolder, "Applicants"), { recursive: true });
fs.mkdirSync(path.join(bundledResources, "models"), { recursive: true });
for (const file of ["ffmpeg.exe", "whisper-cli.exe", path.join("models", "ggml-large-v3.bin")]) {
  fs.writeFileSync(path.join(bundledResources, file), "test");
}

const electronMock = {
  app: {
    getPath: (name) => (name === "userData" ? userData : name === "documents" ? temp : path.join(temp, name)),
    getAppPath: () => temp,
    isPackaged: false,
  },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: {
    openPath: async (p) => { shellCalls.push(["open", p]); return ""; },
    showItemInFolder: (p) => shellCalls.push(["show", p]),
    openExternal: async (p) => shellCalls.push(["external", p]),
  },
  BrowserWindow: { getAllWindows: () => [] },
  WebContentsView: class {
    constructor() {
      const wc = {
        handlers: {},
        session: { setPermissionRequestHandler: (fn) => { wc.permissionHandler = fn; } },
        setWindowOpenHandler: () => undefined,
        getUserAgent: () => "Test Electron/1",
        setUserAgent(ua) { this.userAgent = ua; },
        setZoomFactor(factor) { this.zoomFactor = factor; },
        loadURL(url) { this.loaded = url; },
        on(event, handler) { this.handlers[event] = handler; },
        executeJavaScript(code) { this.executed = code; return Promise.resolve(); },
        close() { this.closed = true; },
      };
      this.webContents = wc;
    }
    setBounds(bounds) { this.bounds = bounds; }
    setVisible(visible) { this.visible = visible; }
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return electronMock;
  return originalLoad.call(this, request, parent, isMain);
};

const { getDb } = require("../dist-main/db");
const settings = require("../dist-main/services/settings");
const data = require("../dist-main/services/data");
const files = require("../dist-main/services/files");
const mail = require("../dist-main/services/mail");
const meetings = require("../dist-main/services/meetings");
const screening = require("../dist-main/services/screening");
const setup = require("../dist-main/services/setup");
const transcribe = require("../dist-main/services/transcribe");

test.after(() => {
  try { getDb().close(); } catch {}
  Module._load = originalLoad;
  fs.rmSync(temp, { recursive: true, force: true });
});

test("settings and mail config", () => {
  assert.deepEqual(data.STAGES.slice(0, 3), ["Applied", "Screened", "For Interview"]);
  assert.equal(settings.MAIL_PRESETS["gmail.com"].imapHost, "imap.gmail.com");

  settings.setSetting("data.folder", dataFolder);
  settings.setSetting("mail.email", "hr@gmail.com");
  settings.setSetting("mail.password", "abc def");
  assert.equal(settings.getSetting("mail.password"), "abc def");
  assert.equal(settings.getAllSettings()["mail.password"], "********");

  settings.saveSettings({ "mail.password": "********", "mail.email": " hr@gmail.com ", "ui.theme": "dark" });
  assert.equal(settings.getSetting("mail.password"), "abc def");
  assert.equal(settings.getSetting("mail.email"), "hr@gmail.com");
  assert.equal(settings.getSetting("ui.theme"), "dark");

  const config = settings.mailConfig();
  assert.equal(config.imapHost, "imap.gmail.com");
  assert.equal(config.smtpHost, "smtp.gmail.com");
  assert.equal(config.displayName, "hr@gmail.com");
});

test("applicants, interviews, and analytics", () => {
  const id = data.saveApplicant({ name: "Jane Doe", email: "Jane@Example.com", position: "Node.js Developer", source: "Email" });
  assert.ok(id > 0);
  assert.equal(data.getApplicant(id).applicant.email, "jane@example.com");
  assert.ok(data.listApplicants().some((a) => a.id === id));

  data.setStage(id, "Screened");
  assert.equal(data.getApplicant(id).applicant.stage, "Screened");

  const interviewId = data.saveInterview({
    applicant_id: id,
    title: "Technical Interview",
    start: "2030-01-01 10:00:00",
    end: "2030-01-01 11:00:00",
    platform: "Google Meet",
    link: "https://meet.google.com/abc",
  });
  assert.ok(interviewId > 0);
  assert.equal(data.getApplicant(id).applicant.stage, "For Interview");
  assert.ok(data.listInterviews("2030-01-01", "2030-01-02").some((i) => i.id === interviewId));

  const soonerId = data.saveInterview({
    applicant_id: id,
    title: "Screening Call",
    start: "2029-01-01 10:00:00",
    end: "2029-01-01 10:30:00",
    platform: "Google Meet",
    link: "https://meet.google.com/soon",
  });
  const pastId = data.saveInterview({
    applicant_id: id,
    title: "Old Interview",
    start: "2020-01-01 10:00:00",
    end: "2020-01-01 11:00:00",
    platform: "Google Meet",
    link: "https://meet.google.com/old",
  });
  const upcoming = data.listInterviews("2026-01-01");
  assert.ok(upcoming.findIndex((i) => i.id === soonerId) < upcoming.findIndex((i) => i.id === interviewId));
  assert.ok(!upcoming.some((i) => i.id === pastId));

  data.saveInterview({
    id: soonerId,
    applicant_id: id,
    title: "Screening Call",
    start: "2029-01-02 14:00:00",
    end: "2029-01-02 14:30:00",
    platform: "Google Meet",
    link: "https://meet.google.com/soon",
    status: "Scheduled",
  });
  const updated = data.listInterviews("2029-01-01", "2029-01-03").find((i) => i.id === soonerId);
  assert.equal(updated.start, "2029-01-02 14:00:00");
  assert.equal(updated.title, "Screening Call");
  assert.equal(updated.link, "https://meet.google.com/soon");

  data.deleteInterview(interviewId);
  data.deleteInterview(soonerId);
  data.deleteInterview(pastId);
  assert.ok(!data.listInterviews("2030-01-01", "2030-01-02").some((i) => i.id === interviewId));

  const invite = data.buildIcs({ id: interviewId, title: "Interview", start: "2030-01-01T10:00:00Z", end: "2030-01-01T11:00:00Z", attendee: "jane@example.com" });
  assert.match(invite, /ORGANIZER:mailto:hr@gmail\.com/);
  assert.match(invite, /ATTENDEE;RSVP=TRUE:mailto:jane@example\.com/);

  const stats = data.analytics("2000-01-01", "2100-01-01");
  assert.ok(stats.totals.applicants >= 1);
  assert.ok(stats.funnel.some((f) => f.stage === "Screened"));
  assert.ok(stats.funnel.some((f) => f.stage === "For Interview"));
  assert.ok(stats.funnel.some((f) => f.stage === "Rejected"));
  assert.ok(Array.isArray(stats.byStage));
});

test("emails", () => {
  const messageId = `test-${Date.now()}@example.com`;
  getDb().prepare(`INSERT INTO emails (message_id, folder, from_addr, from_name, subject, text, date, is_read)
    VALUES (?, 'INBOX', 'jane@example.com', 'Jane', 'Test Subject', 'Hello', datetime('now'), 0)`).run(messageId);
  const row = getDb().prepare("SELECT id FROM emails WHERE message_id=?").get(messageId);
  assert.ok(data.listEmails("INBOX", "Test Subject").some((e) => e.id === row.id));
  assert.equal(data.unreadInboxCount(), 1);
  assert.equal(data.getEmail(row.id).is_read, 1);
  assert.equal(data.unreadInboxCount(), 0);

  const unreadMessageId = `unread-${Date.now()}@example.com`;
  getDb().prepare(`INSERT INTO emails (message_id, folder, from_addr, from_name, subject, text, date, is_read)
    VALUES (?, 'INBOX', 'jane@example.com', 'Jane', 'Unread Subject', 'Hello', datetime('now'), 0)`).run(unreadMessageId);
  const unreadRow = getDb().prepare("SELECT id FROM emails WHERE message_id=?").get(unreadMessageId);
  assert.equal(data.unreadInboxCount(), 1);
  assert.equal(mail.deleteEmail(unreadRow.id), true);
  assert.equal(data.unreadInboxCount(), 0);

  assert.equal(mail.deleteEmail(row.id), true);
  assert.equal(getDb().prepare("SELECT deleted FROM emails WHERE id=?").get(row.id).deleted, 1);
  assert.ok(!data.listEmails("INBOX", "Test Subject").some((e) => e.id === row.id));
  assert.equal(mail.deleteEmail(-1), false);
});

test("files and applicant delete flow", async () => {
  const id = data.saveApplicant({ name: "Delete Me", email: "delete@example.com" });
  const dir = files.applicantDir(id);
  assert.equal(files.dataRoot(), dataFolder);
  assert.ok(fs.existsSync(path.join(dataFolder, "Applicants")));
  assert.ok(fs.existsSync(path.join(dir, "resume")));
  assert.equal(fs.existsSync(path.join(dir, "emails")), false);
  assert.equal(files.applicantDirPath(id), dir);
  assert.throws(() => files.applicantDirPath(99999999), /Applicant not found/);

  const attachment = files.saveAttachment(id, "My Resume.PDF", Buffer.from("cv"), "resume");
  assert.equal(fs.readFileSync(attachment, "utf8"), "cv");
  assert.equal(files.readText(attachment), "cv");
  assert.ok(Buffer.isBuffer(files.readBinary(attachment)));
  assert.ok(files.listTree(files.dataRoot()).some((n) => n.isDir));

  const recording = files.saveRecording(id, new TextEncoder().encode("audio").buffer);
  assert.ok(fs.existsSync(recording.path));
  assert.ok(data.getApplicant(id).recordings.some((r) => r.id === recording.id));

  const interviews = path.dirname(recording.path);
  const staleTemps = [
    "2026-11-20T13-04-29_call_left.wav",
    "2026-11-20T13-04-29_call_right.wav",
    "2026-11-20T13-04-29_call_left.json",
    "2026-11-20T13-04-29_call_right.json",
    "2026-11-20T13-04-29_call_left.txt",
    "2026-11-20T13-04-29_call_right.txt",
  ];
  for (const name of staleTemps) fs.writeFileSync(path.join(interviews, name), "tmp");
  const keepWebm = path.join(interviews, "2026-11-20T13-05-00_call.webm");
  const keepTranscript = path.join(interviews, "2026-11-20T13-05-00_call_transcript.txt");
  fs.writeFileSync(keepWebm, "audio");
  fs.writeFileSync(keepTranscript, "text");
  files.cleanupInterviewTemps();
  for (const name of staleTemps) assert.equal(fs.existsSync(path.join(interviews, name)), false);
  assert.ok(fs.existsSync(keepWebm));
  assert.ok(fs.existsSync(keepTranscript));
  assert.ok(fs.existsSync(recording.path));

  await files.openPath(attachment);
  files.showInFolder(attachment);
  assert.ok(shellCalls.some(([action]) => action === "open"));
  assert.ok(shellCalls.some(([action]) => action === "show"));

  assert.throws(() => files.removeApplicantFolder(files.dataRoot()), /Not an applicant folder/);
  assert.throws(() => files.removeApplicantFolder(path.join(temp, "outside")), /Path outside data folder/);

  const orphan = path.join(files.dataRoot(), "Applicants", "Old Applicant_99999998");
  fs.mkdirSync(orphan, { recursive: true });
  fs.writeFileSync(path.join(orphan, "resume.txt"), "old");
  const orphanPaths = files.orphanApplicantFolders().map((n) => n.path);
  assert.ok(orphanPaths.includes(orphan));
  assert.ok(!orphanPaths.includes(dir));

  const legacyEmails = path.join(dir, "emails");
  fs.mkdirSync(legacyEmails);
  files.removeLegacyEmailFolders();
  assert.equal(fs.existsSync(legacyEmails), false);

  files.removeApplicantFolder(orphan);
  assert.equal(fs.existsSync(orphan), false);
  assert.equal(data.getApplicant(99999998).applicant, undefined);

  files.removeApplicantFolder(dir);
  data.deleteApplicant(id);
  assert.equal(fs.existsSync(dir), false);
  assert.deepEqual(data.getApplicant(id).applicant, undefined);
});

test("roles and screening", async () => {
  const id = data.saveApplicant({ name: "Screen Me", email: "screen@example.com", position: "Application for Node.js Developer" });
  fs.writeFileSync(path.join(files.applicantDir(id), "resume", "resume.txt"), "5 years Node.js and TypeScript, remote");

  const roleId = screening.saveRole({
    title: "Node.js Developer",
    required_skills: ["Node.js"],
    preferred_skills: ["TypeScript"],
    min_years: 3,
    locations: ["Remote"],
    threshold: 60,
    auto_advance: true,
    active: true,
  });
  const role = screening.getRole(roleId);
  assert.deepEqual(role.required_skills, ["Node.js"]);
  assert.ok(screening.listRoles().some((r) => r.id === roleId));

  const direct = screening.scoreText(role, "5 years Node.js and TypeScript, remote", ["resume.txt"]);
  assert.equal(direct.score, 100);
  assert.equal(direct.passed, true);

  const result = await screening.screenApplicant(id, roleId);
  assert.equal(result.score, 100);
  assert.equal(data.getApplicant(id).applicant.stage, "Screened");
  assert.ok(screening.rankings(roleId).some((r) => r.id === id));
  assert.ok((await screening.screenRole(roleId, false)).some((r) => r.id === id));
  assert.equal(screening.guessRole("Application for Node.js Developer").id, roleId);
  assert.ok(await screening.autoScreen(id));

  screening.deleteRole(roleId);
  assert.equal(screening.getRole(roleId), null);
});

test("mail guards", async () => {
  settings.setSetting("mail.password", "");
  await assert.rejects(mail.testConnection(), /Email is not set up/);
  await assert.rejects(mail.syncInbox(), /Email is not set up/);
  assert.deepEqual(await mail.saveEmailAttachments(99999999, 1), []);
});

test("applicant details from replied email", () => {
  assert.deepEqual(mail.applicantFromReply({ from_addr: "CBahinting@BYUPathway.edu", from_name: "Christopher Bahinting", subject: "Application for Software Developer" }, ""), {
    name: "Christopher Bahinting",
    email: "cbahinting@byupathway.edu",
    position: "Software Developer",
    source: "Email",
    stage: "Applied",
  });
  assert.deepEqual(mail.applicantFromReply({ from_addr: "foo@example.com", from_name: "", subject: "Re: Hello" }, ""), {
    name: "foo",
    email: "foo@example.com",
    position: "Hello",
    source: "Email",
    stage: "Applied",
  });
});

test("sent mail stage detection", () => {
  assert.equal(mail.stageFromSentMail("Offer", "", ""), "Offered");
  assert.equal(mail.stageFromSentMail("Rejection", "", ""), "Rejected");
  assert.equal(mail.stageFromSentMail(undefined, "Job offer", "We are pleased to offer you the role"), "Offered");
  assert.equal(mail.stageFromSentMail(undefined, "Update", "We have decided to move forward with other candidates"), "Rejected");
  assert.equal(mail.stageFromSentMail("Acknowledge", "We received your application", "Thank you", true), "Applied");
  assert.equal(mail.stageFromSentMail("Invitation", "Interview invitation", "We are pleased to offer you the role", true), "Applied");
  assert.equal(mail.stageFromSentMail("Acknowledge", "We received your application", "Thank you"), null);
  assert.equal(mail.stageFromSentMail("Invitation", "Interview invitation", "Please join the interview"), null);
});

test("meetings", async () => {
  const win = { contentView: { views: [], addChildView(v) { this.views.push(v); }, removeChildView(v) { this.views = this.views.filter((x) => x !== v); } } };
  const bounds = { x: 1, y: 2, width: 3, height: 4 };

  await meetings.openMeeting(win, "https://meet.google.com/abc", bounds);
  const view = win.contentView.views[0];
  assert.equal(view.webContents.loaded, "https://meet.google.com/abc");
  assert.equal(view.webContents.zoomFactor, 0.7);
  view.webContents.handlers["did-finish-load"]();
  assert.equal(view.webContents.zoomFactor, 0.7);
  assert.deepEqual(view.bounds, bounds);
  assert.doesNotMatch(view.webContents.userAgent, /Electron/);
  const permission = (perm) => new Promise((resolve) => view.webContents.permissionHandler({}, perm, resolve));
  assert.equal(await permission("media"), true);
  assert.equal(await permission("display-capture"), true);
  assert.equal(await permission("fullscreen"), false);
  view.webContents.handlers["enter-html-full-screen"]();
  assert.match(view.webContents.executed, /exitFullscreen/);

  meetings.setMeetingBounds({ x: 5, y: 6, width: 7, height: 8 });
  assert.deepEqual(view.bounds, { x: 5, y: 6, width: 7, height: 8 });
  meetings.setMeetingVisible(false);
  assert.equal(view.visible, false);
  meetings.closeMeeting(win);
  assert.equal(view.webContents.closed, true);
  assert.equal(win.contentView.views.length, 0);

  await meetings.openMeeting(win, "https://zoom.us/j/123456?pwd=abc", bounds);
  assert.equal(win.contentView.views[0].webContents.loaded, "https://app.zoom.us/wc/join/123456?pwd=abc");
  meetings.closeMeeting(win);

  await assert.rejects(async () => meetings.openMeeting(win, "https://example.com", bounds), /Only Google Meet and Zoom/);
  meetings.closeMeeting(win);
});

test("tools and transcription guards", async () => {
  const toolDir = path.join(temp, "tools");
  fs.mkdirSync(path.join(toolDir, "models"), { recursive: true });
  for (const file of ["ffmpeg.exe", "whisper-cli.exe", path.join("models", "ggml-large-v3.bin")]) {
    fs.writeFileSync(path.join(toolDir, file), "test");
  }
  assert.deepEqual(setup.missing(toolDir, "ggml-large-v3.bin"), { ffmpeg: false, whisper: false, model: false });
  assert.deepEqual(await setup.installTools(toolDir), { ffmpeg: false, whisper: false, model: false });
  assert.match(setup.TOOL_URLS.ffmpeg, /ffmpeg-release-essentials\.zip/);

  const status = transcribe.toolStatus();
  assert.equal(status.ffmpeg, true);
  assert.equal(status.whisper, true);
  assert.equal(status.model, true);
  assert.equal(status.modelName, "ggml-large-v3.bin");
  assert.deepEqual(await transcribe.installTranscriptionTools(), status);
  await assert.rejects(transcribe.transcribe(99999999), /Recording not found/);

  const dialogue = transcribe.dialogue(
    [
      { from: 0, text: "Hello, how are you?" },
      { from: 6, text: "I am happy being with you tonight." },
    ],
    [
      { from: 2, text: "Hi, I am fine." },
      { from: 8, text: "Me too." },
    ],
    "Mercy",
  );
  assert.equal(dialogue, "HR: Hello, how are you?\nMercy: Hi, I am fine.\nHR: I am happy being with you tonight.\nMercy: Me too.\n");
});
