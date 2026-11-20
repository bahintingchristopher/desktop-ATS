import { app, BrowserWindow } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
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

export const DEFAULT_MODEL = "ggml-large-v3.bin";
/** English-only (.en) models invent English text for Filipino speech, so they fall back to the default. */
const modelName = () => {
  const m = getSetting("whisper.model");
  return !m || /\.en\.bin$/.test(m) ? DEFAULT_MODEL : m;
};
/** Whisper language code; "auto" mis-detects Taglish, so Tagalog is the default. */
const language = () => getSetting("whisper.language") || "tl";

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

type Seg = { from: number; text: string };

/** Read whisper's JSON output and keep real speech: drops empty lines, bracketed noise tags and repeated hallucinations. */
function readSegments(jsonPath: string): Seg[] {
  if (!fs.existsSync(jsonPath)) return [];
  const j = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { transcription?: { offsets: { from: number }; text: string }[] };
  const out: Seg[] = [];
  const seen = new Map<string, number>();
  for (const s of j.transcription ?? []) {
    const text = s.text.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, "").replace(/\s+/g, " ").trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) continue;
    const key = text.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 2) continue; // same line over and over = whisper looping on silence
    if (out.length && out[out.length - 1].text.toLowerCase() === key) continue;
    out.push({ from: s.offsets.from, text });
  }
  return out;
}

/** Merge both sides by time into "Name: line" dialogue, joining consecutive lines from the same speaker. */
function dialogue(hr: Seg[], applicant: Seg[], applicantName: string) {
  const all = [...hr.map((s) => ({ ...s, who: "HR" })), ...applicant.map((s) => ({ ...s, who: applicantName }))].sort((a, b) => a.from - b.from);
  if (!all.length) return "No speech was detected in this call.\n";
  const lines: { who: string; text: string }[] = [];
  for (const s of all) {
    const last = lines[lines.length - 1];
    if (last && last.who === s.who) last.text += " " + s.text;
    else lines.push({ who: s.who, text: s.text });
  }
  return lines.map((l) => `${l.who}: ${l.text}`).join("\n") + "\n";
}

/** Recording (remote audio left, HR mic right) -> each side transcribed separately -> text-only dialogue saved next to the recording. */
export async function transcribe(recordingId: number) {
  const db = getDb();
  const rec = db
    .prepare("SELECT r.*, a.name AS applicant_name FROM recordings r LEFT JOIN applicants a ON a.id = r.applicant_id WHERE r.id=?")
    .get(recordingId) as { audio_path: string; applicant_name: string | null } | undefined;
  if (!rec) throw new Error("Recording not found");
  const applicantName = (rec.applicant_name ?? "").trim().split(/\s+/)[0] || "Applicant";
  let t = resolveTools();
  if (!t.ffmpeg || !t.whisper || !t.model) {
    // First use: fetch the tools automatically, then continue.
    broadcast("transcribe:progress", { recordingId, status: "installing" });
    await installTranscriptionTools();
    t = resolveTools();
    if (!t.ffmpeg || !t.whisper || !t.model) throw new Error("Transcription tools could not be installed. Check your internet connection.");
  }
  const base = rec.audio_path.replace(/\.webm$/, "");
  const sides = { applicant: { wav: base + "_left.wav", out: base + "_left" }, hr: { wav: base + "_right.wav", out: base + "_right" } };
  const temp = Object.values(sides).flatMap((s) => [s.wav, s.out + ".json"]);
  db.prepare("UPDATE recordings SET status='transcribing' WHERE id=?").run(recordingId);
  broadcast("transcribe:progress", { recordingId, status: "transcribing" });
  try {
    // Left channel = other participants (applicant), right channel = HR microphone.
    await run(t.ffmpeg!, [
      "-y", "-i", rec.audio_path, "-vn",
      "-filter_complex", "[0:a]channelsplit=channel_layout=stereo[l][r]",
      "-map", "[l]", "-ar", "16000", "-c:a", "pcm_s16le", sides.applicant.wav,
      "-map", "[r]", "-ar", "16000", "-c:a", "pcm_s16le", sides.hr.wav,
    ]);
    for (const s of Object.values(sides)) {
      await run(t.whisper!, [
        "-m", t.model!, "-f", s.wav, "-l", language(),
        "-t", String(Math.max(1, os.cpus().length - 1)),
        "-sns",
        "-mc", "0", // no carry-over context: stops repeated hallucinated lines
        "-nth", "0.6", // stricter no-speech threshold: skip silence instead of inventing text
        "-oj", "-of", s.out,
      ]);
    }
    const txt = base + "_transcript.txt";
    fs.writeFileSync(txt, dialogue(readSegments(sides.hr.out + ".json"), readSegments(sides.applicant.out + ".json"), applicantName), "utf8");
    for (const f of temp) fs.rmSync(f, { force: true });
    db.prepare("UPDATE recordings SET status='done', transcript_path=? WHERE id=?").run(txt, recordingId);
    broadcast("transcribe:progress", { recordingId, status: "done", transcript: txt });
    return txt;
  } catch (e) {
    for (const f of temp) fs.rmSync(f, { force: true });
    db.prepare("UPDATE recordings SET status='error' WHERE id=?").run(recordingId);
    broadcast("transcribe:progress", { recordingId, status: "error", error: String(e) });
    throw e;
  }
}
