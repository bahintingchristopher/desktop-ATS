import { app, BrowserWindow } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { getDb } from "../db";
import { getSetting } from "./settings";
import { installTools, missing, type Progress } from "./setup";

/** Tools bundled with the installer (read-only, inside Program Files). */
function bundledDir() {
  return app.isPackaged ? path.join(process.resourcesPath, "resources") : path.join(app.getAppPath(), "resources");
}
/** Tools downloaded by the app at runtime (writable). */
function userToolsDir() {
  return path.join(app.getPath("userData"), "tools");
}

const modelName = () => getSetting("whisper.model") || "ggml-base.en.bin";

/** Pick the folder that has everything: bundled first, then the downloaded copy. */
function toolsDir() {
  const m = modelName();
  const b = missing(bundledDir(), m);
  if (!b.ffmpeg && !b.whisper && !b.model) return bundledDir();
  return userToolsDir();
}

/** Resolve each tool from bundled or downloaded locations (they may be split, e.g. a bundled exe plus a downloaded model). */
function resolveTools() {
  const m = modelName();
  const pick = (rel: string) => [bundledDir(), userToolsDir()].map((d) => path.join(d, rel)).find((p) => fs.existsSync(p)) ?? null;
  return { ffmpeg: pick("ffmpeg.exe"), whisper: pick("whisper-cli.exe"), model: pick(path.join("models", m)), modelName: m };
}

export function toolStatus() {
  const t = resolveTools();
  return { dir: toolsDir(), ffmpeg: !!t.ffmpeg, whisper: !!t.whisper, model: !!t.model, modelName: t.modelName };
}

function broadcast(channel: string, payload: unknown) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
}

let installing: Promise<unknown> | null = null;

/** Settings → "Install transcription tools": downloads anything not already bundled. */
export function installTranscriptionTools() {
  if (installing) return installing;
  const t = resolveTools();
  // Only download what is missing everywhere; the downloader skips files already in the target dir.
  const target = userToolsDir();
  installing = (async () => {
    if (t.ffmpeg && t.whisper && t.model) return toolStatus();
    // If a tool exists in the bundled dir, copy nothing and let installTools skip it by pre-linking.
    fs.mkdirSync(path.join(target, "models"), { recursive: true });
    if (t.ffmpeg && !fs.existsSync(path.join(target, "ffmpeg.exe"))) fs.copyFileSync(t.ffmpeg, path.join(target, "ffmpeg.exe"));
    if (t.whisper && !fs.existsSync(path.join(target, "whisper-cli.exe"))) {
      const src = path.dirname(t.whisper);
      for (const f of fs.readdirSync(src)) if (/\.(exe|dll)$/i.test(f)) fs.copyFileSync(path.join(src, f), path.join(target, f));
    }
    if (t.model && !fs.existsSync(path.join(target, "models", t.modelName))) fs.copyFileSync(t.model, path.join(target, "models", t.modelName));
    await installTools(target, t.modelName, (p: Progress) => broadcast("setup:progress", p));
    return toolStatus();
  })().finally(() => (installing = null));
  return installing;
}

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true, cwd: path.dirname(cmd) });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.slice(-500)}`)),
    );
  });
}

/** webm -> 16kHz mono wav (ffmpeg) -> whisper.cpp -> .txt + .srt saved next to the audio. */
export async function transcribe(recordingId: number) {
  const db = getDb();
  const rec = db.prepare("SELECT * FROM recordings WHERE id=?").get(recordingId) as { audio_path: string } | undefined;
  if (!rec) throw new Error("Recording not found");
  let t = resolveTools();
  if (!t.ffmpeg || !t.whisper || !t.model) {
    // First use: fetch the tools automatically, then continue.
    broadcast("transcribe:progress", { recordingId, status: "installing" });
    await installTranscriptionTools();
    t = resolveTools();
    if (!t.ffmpeg || !t.whisper || !t.model) throw new Error("Transcription tools could not be installed. Check your internet connection.");
  }
  const base = rec.audio_path.replace(/\.webm$/, "");
  const wav = base + ".wav";
  db.prepare("UPDATE recordings SET status='transcribing' WHERE id=?").run(recordingId);
  broadcast("transcribe:progress", { recordingId, status: "transcribing" });
  try {
    await run(t.ffmpeg!, ["-y", "-i", rec.audio_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav]);
    await run(t.whisper!, ["-m", t.model!, "-f", wav, "-otxt", "-osrt", "-of", base + "_transcript"]);
    fs.rmSync(wav, { force: true });
    const txt = base + "_transcript.txt";
    db.prepare("UPDATE recordings SET status='done', transcript_path=? WHERE id=?").run(txt, recordingId);
    broadcast("transcribe:progress", { recordingId, status: "done", transcript: txt });
    return txt;
  } catch (e) {
    db.prepare("UPDATE recordings SET status='error' WHERE id=?").run(recordingId);
    broadcast("transcribe:progress", { recordingId, status: "error", error: String(e) });
    throw e;
  }
}
