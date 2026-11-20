// Build the Next.js UI, retrying on Windows' occasional "PageNotFoundError" file-timing glitch
// (happens mostly while `npm run dev` is running at the same time).
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..", "renderer");
for (let attempt = 1; attempt <= 3; attempt++) {
  fs.rmSync(path.join(dir, ".next-build"), { recursive: true, force: true });
  const r = spawnSync("npx", ["next", "build"], { cwd: dir, stdio: "inherit", shell: true });
  if (r.status === 0) process.exit(0);
  console.log(`\nUI build failed (attempt ${attempt}/3)${attempt < 3 ? ", retrying…" : ""}\n`);
}
process.exit(1);
