import { app, shell } from "electron";
import fs from "fs";
import path from "path";
import { getDb } from "../db";
import { getSetting } from "./settings";

export function dataRoot() {
  const root = getSetting("data.folder") || path.join(app.getPath("documents"), "MyATS_Data");
  fs.mkdirSync(path.join(root, "Applicants"), { recursive: true });
  return root;
}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9-_ ]/g, "").trim().replace(/\s+/g, "_") || "Applicant";

export function applicantDir(applicantId: number) {
  const a = getDb().prepare("SELECT id,name FROM applicants WHERE id=?").get(applicantId) as { id: number; name: string } | undefined;
  if (!a) throw new Error("Applicant not found");
  const dir = path.join(dataRoot(), "Applicants", `${safe(a.name)}_${a.id}`);
  for (const sub of ["interviews", "resume", "emails"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  return dir;
}

/** Ensure a path is inside the data root (prevents renderer path traversal). */
function assertInside(p: string) {
  const root = path.resolve(dataRoot());
  const full = path.resolve(p);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Path outside data folder");
  return full;
}

export type FileNode = { name: string; path: string; isDir: boolean; size: number; mtime: string; children?: FileNode[] };

export function listTree(dir = dataRoot(), depth = 4): FileNode[] {
  const full = assertInside(dir);
  if (!fs.existsSync(full)) return [];
  return fs
    .readdirSync(full, { withFileTypes: true })
    .map((e) => {
      const p = path.join(full, e.name);
      const st = fs.statSync(p);
      return {
        name: e.name,
        path: p,
        isDir: e.isDirectory(),
        size: st.size,
        mtime: st.mtime.toISOString(),
        children: e.isDirectory() && depth > 0 ? listTree(p, depth - 1) : undefined,
      };
    })
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
}

export function readText(p: string) {
  return fs.readFileSync(assertInside(p), "utf8");
}
export function readBinary(p: string) {
  return fs.readFileSync(assertInside(p));
}
export function openPath(p: string) {
  return shell.openPath(assertInside(p));
}
export function showInFolder(p: string) {
  shell.showItemInFolder(assertInside(p));
}

export function saveAttachment(applicantId: number, filename: string, content: Buffer, sub = "resume") {
  const p = path.join(applicantDir(applicantId), sub, safe(path.parse(filename).name) + path.extname(filename));
  fs.writeFileSync(p, content);
  return p;
}

export function saveRecording(applicantId: number, data: ArrayBuffer, interviewId?: number) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const p = path.join(applicantDir(applicantId), "interviews", `${stamp}_call.webm`);
  fs.writeFileSync(p, Buffer.from(data));
  const info = getDb()
    .prepare("INSERT INTO recordings(applicant_id,interview_id,audio_path) VALUES(?,?,?)")
    .run(applicantId, interviewId ?? null, p);
  return { id: Number(info.lastInsertRowid), path: p };
}
