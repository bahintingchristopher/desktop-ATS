// Downloads the transcription tools (ffmpeg, whisper.cpp, Whisper model) into a folder.
// No Electron imports, so it is used both by the app (Settings → Install) and by
// scripts/fetch-tools.js at build time to bake the tools into the installer.
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

export const TOOL_URLS = {
  ffmpeg: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
  // Pinned: the newest whisper.cpp release that ships Windows x64 binaries.
  whisper: "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip",
  model: (name: string) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${name}`,
};

export type Progress = { step: "ffmpeg" | "whisper" | "model"; phase: "download" | "extract" | "done" | "skip"; received?: number; total?: number };

export function missing(dir: string, model: string) {
  return {
    ffmpeg: !fs.existsSync(path.join(dir, "ffmpeg.exe")),
    whisper: !fs.existsSync(path.join(dir, "whisper-cli.exe")),
    model: !fs.existsSync(path.join(dir, "models", model)),
  };
}

async function download(url: string, dest: string, onBytes: (received: number, total: number) => void) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status}) ${url}`);
  const total = Number(res.headers.get("content-length")) || 0;
  let received = 0;
  let last = 0;
  const body = Readable.fromWeb(res.body as never);
  body.on("data", (c: Buffer) => {
    received += c.length;
    if (received - last > 1_000_000 || received === total) { last = received; onBytes(received, total); }
  });
  const tmp = dest + ".part";
  await pipeline(body, fs.createWriteStream(tmp));
  if (total && fs.statSync(tmp).size !== total) throw new Error(`Incomplete download: ${url}`);
  fs.renameSync(tmp, dest);
}

/** Extract a .zip with Windows' built-in tar.exe (bsdtar, available on Windows 10+). */
function unzip(zip: string, out: string) {
  const tar = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  fs.mkdirSync(out, { recursive: true });
  return new Promise<void>((resolve, reject) => {
    const p = spawn(tar, ["-xf", zip, "-C", out], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`Unzip failed: ${err}`))));
  });
}

function findFile(dir: string, name: string): string | null {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const f = findFile(p, name); if (f) return f; }
    else if (e.name.toLowerCase() === name) return p;
  }
  return null;
}

/** Install whatever is missing into `dir`. Safe to re-run; finished parts are skipped. */
export async function installTools(dir: string, model = "ggml-base.bin", onProgress: (p: Progress) => void = () => undefined) {
  fs.mkdirSync(path.join(dir, "models"), { recursive: true });
  const need = missing(dir, model);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "ats-tools-"));
  try {
    if (need.ffmpeg) {
      const zip = path.join(work, "ffmpeg.zip");
      await download(TOOL_URLS.ffmpeg, zip, (received, total) => onProgress({ step: "ffmpeg", phase: "download", received, total }));
      onProgress({ step: "ffmpeg", phase: "extract" });
      await unzip(zip, path.join(work, "ffmpeg"));
      const exe = findFile(path.join(work, "ffmpeg"), "ffmpeg.exe");
      if (!exe) throw new Error("ffmpeg.exe not found in archive");
      fs.copyFileSync(exe, path.join(dir, "ffmpeg.exe"));
    }
    onProgress({ step: "ffmpeg", phase: need.ffmpeg ? "done" : "skip" });

    if (need.whisper) {
      const zip = path.join(work, "whisper.zip");
      await download(TOOL_URLS.whisper, zip, (received, total) => onProgress({ step: "whisper", phase: "download", received, total }));
      onProgress({ step: "whisper", phase: "extract" });
      await unzip(zip, path.join(work, "whisper"));
      const exe = findFile(path.join(work, "whisper"), "whisper-cli.exe");
      if (!exe) throw new Error("whisper-cli.exe not found in archive");
      // whisper-cli needs the DLLs that sit next to it.
      for (const f of fs.readdirSync(path.dirname(exe))) {
        if (/\.(exe|dll)$/i.test(f)) fs.copyFileSync(path.join(path.dirname(exe), f), path.join(dir, f));
      }
    }
    onProgress({ step: "whisper", phase: need.whisper ? "done" : "skip" });

    if (need.model) {
      await download(TOOL_URLS.model(model), path.join(dir, "models", model), (received, total) => onProgress({ step: "model", phase: "download", received, total }));
    }
    onProgress({ step: "model", phase: need.model ? "done" : "skip" });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return missing(dir, model);
}
