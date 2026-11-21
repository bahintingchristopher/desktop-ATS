import { BrowserWindow, WebContentsView, shell } from "electron";

let view: WebContentsView | null = null;

export type Bounds = { x: number; y: number; width: number; height: number };

const ALLOWED = /(^|\.)meet\.google\.com$|(^|\.)zoom\.us$|(^|\.)accounts\.google\.com$/;
const MEETING_ZOOM = 0.7;

/** Normalize a meeting link. Zoom "/j/<id>" links go to Zoom's web client so the call runs inside the app. */
function normalize(raw: string) {
  const u = new URL(raw.trim());
  if (!ALLOWED.test(u.hostname)) throw new Error("Only Google Meet and Zoom links are supported");
  if (u.hostname.endsWith("zoom.us")) {
    const m = u.pathname.match(/\/j\/(\d+)/);
    if (m) {
      const pwd = u.searchParams.get("pwd");
      return `https://app.zoom.us/wc/join/${m[1]}${pwd ? `?pwd=${encodeURIComponent(pwd)}` : ""}`;
    }
  }
  return u.toString();
}

export function openMeeting(win: BrowserWindow, url: string, bounds: Bounds) {
  closeMeeting(win);
  const target = normalize(url);
  view = new WebContentsView({ webPreferences: { partition: "persist:meetings" } });
  const wc = view.webContents;
  // Keep the call at a fixed 70% so it fits the Tools stage: re-apply after every navigation
  // (zoom is per-origin) and undo Ctrl+wheel / Ctrl+± / pinch zoom changes.
  const lockZoom = () => {
    if (wc.isDestroyed?.()) return;
    wc.setZoomFactor(MEETING_ZOOM);
    wc.setVisualZoomLevelLimits?.(1, 1)?.catch(() => undefined);
  };
  lockZoom();
  wc.on("did-finish-load", lockZoom);
  wc.on("did-navigate", lockZoom);
  wc.on("did-navigate-in-page", lockZoom);
  wc.on("zoom-changed", lockZoom);
  wc.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && ["+", "=", "-", "_", "0"].includes(input.key)) event.preventDefault();
  });
  // Stay inside the ATS: never hand the call off to the Zoom/Meet desktop apps.
  const isAppLaunch = (url: string) => /^(zoommtg|zoomus|zoomphonecall):/i.test(url);
  wc.on("will-navigate", (event, url) => {
    if (isAppLaunch(url)) event.preventDefault();
  });
  wc.session.setPermissionRequestHandler((_wc, perm, cb) =>
    cb(["media", "display-capture", "notifications", "clipboard-sanitized-write"].includes(perm)),
  );
  wc.setWindowOpenHandler(({ url }) => {
    try {
      if (isAppLaunch(url)) return { action: "deny" };
      if (ALLOWED.test(new URL(url).hostname)) wc.loadURL(url);
      else shell.openExternal(url);
    } catch {
      /* ignore bad url */
    }
    return { action: "deny" };
  });
  wc.on("enter-html-full-screen", () => {
    wc.executeJavaScript("document.exitFullscreen && document.exitFullscreen()").catch(() => undefined);
  });
  // Present as a regular Chrome browser so Meet/Zoom serve their normal web clients.
  wc.setUserAgent(wc.getUserAgent().replace(/\s?Electron\/\S+/, "").replace(/\s?desktop-ats\/\S+/i, ""));
  win.contentView.addChildView(view);
  setMeetingBounds(bounds);
  wc.loadURL(target);
}

export function setMeetingBounds(b: Bounds) {
  view?.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
}

export function setMeetingVisible(visible: boolean) {
  view?.setVisible(visible);
}

export function closeMeeting(win: BrowserWindow) {
  if (!view) return;
  win.contentView.removeChildView(view);
  view.webContents.close();
  view = null;
}
