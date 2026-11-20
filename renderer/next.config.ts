import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Static export so Electron can serve the UI from disk (app://ats/...).
// The production build uses its own cache folder (.next-build) so `npm run dist`
// and a running `npm run dev` (.next) never delete each other's files.
export default function config(phase: string): NextConfig {
  return {
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
    outputFileTracingRoot: __dirname,
    distDir: phase === PHASE_PRODUCTION_BUILD ? ".next-build" : ".next",
  };
}
