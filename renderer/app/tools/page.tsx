"use client";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Circle, FileText, FileVideo, Folder, PhoneOff, Square, Video } from "lucide-react";
import { call, inElectron, on, useIsElectron, type Applicant, type FileNode } from "@/lib/ats";
import { Button, Card, cx, Empty, ErrorText, Input, Select } from "@/components/ui";

export default function ToolsPage() {
  return (
    <Suspense>
      <InterviewRoom />
    </Suspense>
  );
}

function InterviewRoom() {
  const params = useSearchParams();
  const electron = useIsElectron();
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [aid, setAid] = useState<number>(Number(params.get("applicant")) || 0);
  const [platform, setPlatform] = useState<"meet" | "zoom">(params.get("link")?.includes("zoom") ? "zoom" : "meet");
  const [link, setLink] = useState(params.get("link") ?? "");
  const [inCall, setInCall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const autoJoinedRef = useRef(false);

  const syncMeetingBounds = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.round(Math.max(0, r.left) + 1);
    const top = Math.round(Math.max(0, r.top) + 1);
    const right = Math.round(Math.min(window.innerWidth, r.right) - 1);
    const bottom = Math.round(Math.min(window.innerHeight, r.bottom) - 1);
    const width = Math.max(0, right - left);
    const height = Math.max(0, bottom - top);
    const visible = width > 2 && height > 2 && r.bottom > 1 && r.right > 1 && r.top < window.innerHeight - 1 && r.left < window.innerWidth - 1;
    call("meeting:visible", visible);
    call("meeting:bounds", { x: left, y: top, width, height });
  }, []);

  // Recording state
  const recRef = useRef<{ rec: MediaRecorder; streams: MediaStream[]; ctx: AudioContext } | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  // Applicant folder + transcript preview
  const [files, setFiles] = useState<FileNode[]>([]);
  const [transcript, setTranscript] = useState<string>("");

  useEffect(() => {
    if (!inElectron()) return;
    call<Applicant[]>("applicants:list").then((l) => {
      setApplicants(l);
      setAid((cur) => cur || l[0]?.id || 0);
    });
  }, []);

  const loadFiles = useCallback(async () => {
    if (!aid) return setFiles([]);
    const dir = await call<string>("files:applicantDir", aid);
    const tree = await call<FileNode[]>("files:tree", dir + "\\interviews");
    setFiles(tree);
    const latest = tree.filter((f) => f.name.endsWith("_transcript.txt")).sort((a, b) => b.mtime.localeCompare(a.mtime))[0];
    setTranscript(latest ? await call<string>("files:readText", latest.path) : "");
  }, [aid]);

  useEffect(() => { if (inElectron()) loadFiles(); }, [loadFiles]);
  useEffect(() => on("transcribe:progress", (p) => {
    const s = (p as { status: string; error?: string }).status;
    setStatus(s === "done" ? "Transcript ready" : s === "installing" ? "Setting up transcription (first time only)…" : s === "error" ? `Transcription failed: ${(p as { error?: string }).error}` : "Transcribing…");
    loadFiles();
  }), [loadFiles]);

  useEffect(() => {
    if (!inCall || !stageRef.current) return;
    const el = stageRef.current;
    let frame = 0;
    const push = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(syncMeetingBounds);
    };
    syncMeetingBounds();
    const ro = new ResizeObserver(push);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener("resize", push);
    window.addEventListener("scroll", push, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", push);
    vv?.addEventListener("scroll", push);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", push);
      window.removeEventListener("scroll", push, true);
      vv?.removeEventListener("resize", push);
      vv?.removeEventListener("scroll", push);
    };
  }, [inCall, syncMeetingBounds]);

  useLayoutEffect(() => { if (inCall) syncMeetingBounds(); });

  // Leave the call when navigating away from Tools.
  useEffect(() => () => { if (inElectron()) call("meeting:close"); }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const join = useCallback(async () => {
    setError(null);
    const url = link.trim() || (platform === "meet" ? "https://meet.google.com/" : "https://app.zoom.us/wc/home");
    try {
      setInCall(true);
      await new Promise((r) => requestAnimationFrame(r));
      const r = stageRef.current!.getBoundingClientRect();
      await call("meeting:open", url, { x: r.left, y: r.top, width: r.width, height: r.height });
      syncMeetingBounds();
    } catch (e) {
      setInCall(false);
      setError((e as Error).message);
    }
  }, [link, platform, syncMeetingBounds]);

  useEffect(() => {
    if (autoJoinedRef.current || !electron || !aid || !link) return;
    if (params.get("autojoin") !== "1") return;
    autoJoinedRef.current = true;
    void join();
  }, [aid, electron, join, link, params]);

  const leave = async () => {
    if (recording) await stopRecording();
    await call("meeting:close");
    setInCall(false);
  };

  const startRecording = async () => {
    setError(null);
    if (!aid) return setError("Choose the applicant first so the recording is saved to their folder.");
    try {
      // Screen video with remote audio on the left channel and your microphone on the right,
      // so Whisper's stereo diarization can label each party. Recording runs until Stop Recording.
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      // Keep the two sides on separate channels: force a discrete 2-channel destination
      // (otherwise the stereo mix can be up/down-mixed so both channels end up identical).
      dest.channelCount = 2;
      dest.channelCountMode = "explicit";
      dest.channelInterpretation = "discrete";
      const merger = ctx.createChannelMerger(2);
      merger.connect(dest);
      // Downmix each source to mono before it enters its merger input.
      const toMono = (src: AudioNode) => {
        const g = ctx.createGain();
        g.channelCount = 1;
        g.channelCountMode = "explicit";
        g.channelInterpretation = "speakers";
        src.connect(g);
        return g;
      };
      if (display.getAudioTracks().length) {
        toMono(ctx.createMediaStreamSource(new MediaStream(display.getAudioTracks()))).connect(merger, 0, 0);
      } else {
        setError("Other participants' audio was not captured (no system audio). Only your microphone will be recorded.");
      }
      toMono(ctx.createMediaStreamSource(mic)).connect(merger, 0, 1);
      const tracks = [...display.getVideoTracks(), ...dest.stream.getAudioTracks()];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const rec = new MediaRecorder(new MediaStream(tracks), { mimeType });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        const buf = await new Blob(chunks, { type: "audio/webm" }).arrayBuffer();
        const saved = await call<{ id: number }>("recording:save", aid, buf);
        setStatus("Saved recording. Transcribing…");
        loadFiles();
        call("transcribe:run", saved.id).catch((e) => setStatus(`Transcription failed: ${e.message}`));
      };
      rec.start(1000);
      recRef.current = { rec, streams: [display, mic], ctx };
      const screenTrack = display.getVideoTracks()[0];
      if (screenTrack) screenTrack.onended = () => { if (recRef.current?.rec === rec && rec.state !== "inactive") stopRecording(); };
      setElapsed(0);
      setRecording(true);
      setStatus("Recording. Let participants know the call is being recorded.");
    } catch (e) {
      setError(`Could not start recording: ${(e as Error).message}`);
    }
  };

  const stopRecording = async () => {
    const r = recRef.current;
    if (!r) return;
    r.rec.stop();
    r.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    await r.ctx.close();
    recRef.current = null;
    setRecording(false);
  };

  const applicant = applicants.find((a) => a.id === aid);
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="grid h-full grid-cols-[1fr_340px] gap-4">
      <Card className="flex min-h-0 flex-col" title={<span className="flex items-center gap-2"><Video size={16} /> Interview Room</span>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select className="w-56" value={aid} onChange={(e) => setAid(Number(e.target.value))} disabled={recording}>
            <option value={0}>Select applicant…</option>
            {applicants.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <div className="flex rounded-md border border-line">
            {(["meet", "zoom"] as const).map((p) => (
              <Button key={p} variant={platform === p ? "default" : "ghost"} onClick={() => setPlatform(p)} disabled={inCall}>
                {p === "meet" ? "Google Meet" : "Zoom"}
              </Button>
            ))}
          </div>
          <Input
            className="min-w-56 flex-1"
            placeholder={platform === "meet" ? "https://meet.google.com/abc-defg-hij (empty = new meeting)" : "https://zoom.us/j/123456789?pwd=…"}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            disabled={inCall}
          />
          {!inCall ? (
            <Button variant="primary" onClick={join} disabled={!electron}>Join</Button>
          ) : (
            <Button variant="danger" onClick={leave}><PhoneOff size={15} /> Leave</Button>
          )}
        </div>

        {applicant && (
          <div className="mb-2 flex items-center gap-2 text-sm">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-panel-2">{applicant.name[0]}</div>
            <span>{applicant.name}</span>
            <span className="text-muted">{applicant.position}</span>
          </div>
        )}

        <div ref={stageRef} className={cx("relative min-h-[240px] flex-1 overflow-hidden border border-line bg-black/40", !inCall && "rounded-lg")}>
          {!inCall && (
            <Empty>
              <div className="text-center">
                <p>Paste a {platform === "meet" ? "Google Meet" : "Zoom"} link and click Join.</p>
                <p className="mt-1 text-xs">The first time, sign in to your Google/Zoom account inside this window.</p>
              </div>
            </Empty>
          )}
        </div>

        <div className="mt-3 flex items-center gap-3">
          {!recording ? (
            <Button variant="danger" onClick={startRecording} disabled={!electron}><Circle size={14} fill="currentColor" /> Start Recording</Button>
          ) : (
            <Button variant="danger" onClick={stopRecording}><Square size={14} fill="currentColor" /> Stop Recording ({mmss})</Button>
          )}
          {recording && <span className="flex items-center gap-1 text-sm text-red-300"><span className="h-2 w-2 animate-pulse rounded-full bg-bad" /> REC</span>}
          {status && <span className="text-sm text-muted">{status}</span>}
        </div>
        <div className="mt-2"><ErrorText error={error} /></div>
      </Card>

      <div className="flex min-h-0 flex-col gap-4">
        <Card title={<span className="flex items-center gap-2"><Folder size={16} /> Applicant Folder</span>} className="max-h-[45%] overflow-auto">
          {!aid ? <p className="text-sm text-muted">Select an applicant.</p> : files.length === 0 ? <p className="text-sm text-muted">interviews/ is empty</p> : (
            <ul className="space-y-1 text-sm">
              {files.map((f) => (
                <li key={f.path} className="flex items-center gap-2">
                  {f.name.endsWith(".webm") ? <FileVideo size={14} className="text-accent" /> : <FileText size={14} className="text-muted" />}
                  <button className="truncate hover:underline" onClick={() => call("files:open", f.path)}>{f.name}</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Transcript Preview" className={cx("min-h-0 flex-1 overflow-auto")}>
          {transcript ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{transcript}</pre> : <p className="text-sm text-muted">The latest transcript for this applicant appears here.</p>}
        </Card>
      </div>
    </div>
  );
}
