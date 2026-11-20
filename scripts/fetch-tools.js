// Build step: download ffmpeg, whisper.cpp and the Whisper model into resources/
// so the installer ships with everything (HR doesn't download anything).
const path = require("path");
const { installTools } = require("../dist-main/services/setup.js");

const dir = path.join(__dirname, "..", "resources");
const model = process.argv[2] || "ggml-base.bin";
let lastPct = {};
installTools(dir, model, (p) => {
  if (p.phase === "download" && p.total) {
    const pct = Math.floor((p.received / p.total) * 10) * 10;
    if (lastPct[p.step] !== pct) { lastPct[p.step] = pct; console.log(`${p.step}: ${pct}%`); }
  } else console.log(`${p.step}: ${p.phase}`);
}).then((m) => {
  if (m.ffmpeg || m.whisper || m.model) { console.error("Still missing:", m); process.exit(1); }
  console.log("All transcription tools are in", dir);
}).catch((e) => { console.error(e); process.exit(1); });
