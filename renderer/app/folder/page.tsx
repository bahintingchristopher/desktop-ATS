"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, ExternalLink, FileAudio, FileText, FileVideo, Folder as FolderIcon, FolderOpen, RefreshCw, Trash2 } from "lucide-react";
import { call, inElectron, type FileNode } from "@/lib/ats";
import { Button, Card, cx, Empty, Input, PageHeader } from "@/components/ui";

type Seg = { start: number; end: number; text: string };

function parseSrt(srt: string): Seg[] {
  const t = (s: string) => { const [h, m, rest] = s.split(":"); return +h * 3600 + +m * 60 + parseFloat(rest.replace(",", ".")); };
  return srt.split(/\r?\n\r?\n/).flatMap((block) => {
    const lines = block.trim().split(/\r?\n/);
    const tm = lines.find((l) => l.includes("-->"));
    if (!tm) return [];
    const [a, b] = tm.split("-->").map((x) => x.trim());
    return [{ start: t(a), end: t(b), text: lines.slice(lines.indexOf(tm) + 1).join(" ").trim() }];
  });
}

const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const findAll = (nodes: FileNode[]): FileNode[] => nodes.flatMap((n) => [n, ...findAll(n.children ?? [])]);

export default function FolderPage() {
  return <Suspense><FolderBrowser /></Suspense>;
}

function FolderBrowser() {
  const params = useSearchParams();
  const [root, setRoot] = useState("");
  const [tree, setTree] = useState<FileNode[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<FileNode | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [orphans, setOrphans] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!inElectron()) return;
    const r = await call<string>("files:root");
    setRoot(r);
    const [t, o] = await Promise.all([
      call<FileNode[]>("files:tree", r + "\\Applicants"),
      call<FileNode[]>("files:orphanApplicants").catch(() => []),
    ]);
    setTree(t);
    setOrphans(new Set(o.map((n) => n.path)));
    const want = params.get("applicant");
    if (want) {
      const dir = t.find((n) => n.name.endsWith(`_${want}`));
      if (dir) setOpen(new Set([dir.path, ...(dir.children ?? []).map((c) => c.path)]));
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const toggle = (p: string) => setOpen((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const shown = tree.filter((n) => n.name.toLowerCase().includes(filter.toLowerCase()));
  const all = useMemo(() => findAll(tree), [tree]);

  const removeApplicant = async (n: FileNode) => {
    const id = n.name.match(/_(\d+)$/)?.[1];
    const label = n.name.replace(/_(\d+)$/, "").replace(/_/g, " ");
    if (!confirm(`Delete ${label}? This permanently removes the applicant record if it still exists and all files in their folder.`)) return;
    setBusy((s) => new Set(s).add(n.path));
    try {
      await call("files:deleteApplicant", id ? Number(id) : null, n.path);
      if (sel && (sel.path === n.path || sel.path.startsWith(n.path + "\\"))) setSel(null);
      await load();
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    } finally {
      setBusy((s) => { const next = new Set(s); next.delete(n.path); return next; });
    }
  };

  const renderNode = (n: FileNode, depth: number) => (
    <li key={n.path}>
      <div className="group flex items-center">
        <button
          onClick={() => (n.isDir ? toggle(n.path) : setSel(n))}
          className={cx("flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-panel-2", sel?.path === n.path && "bg-accent-soft")}
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {n.isDir ? (open.has(n.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}
          {n.isDir ? (open.has(n.path) ? <FolderOpen size={15} className="text-warn" /> : <FolderIcon size={15} className="text-warn" />)
            : /\.webm$/i.test(n.name) ? <FileVideo size={15} className="text-accent" />
              : /\.(wav|mp3|m4a)$/i.test(n.name) ? <FileAudio size={15} className="text-accent" /> : <FileText size={15} className="text-muted" />}
          <span className="truncate">{depth === 0 ? n.name.replace(/_(\d+)$/, "").replace(/_/g, " ") : n.name}</span>
        </button>
        {depth === 0 && n.isDir && orphans.has(n.path) && (
          <button
            aria-label={`Delete ${n.name}`}
            title="Delete applicant folder and record if it exists"
            disabled={busy.has(n.path)}
            onClick={(e) => { e.stopPropagation(); removeApplicant(n); }}
            className="mr-1 shrink-0 rounded p-1 text-muted opacity-60 hover:bg-bad/15 hover:text-bad group-hover:opacity-100 disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
      {n.isDir && open.has(n.path) && <ul>{(n.children ?? []).map((c) => renderNode(c, depth + 1))}</ul>}
    </li>
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Folder">
        <span className="text-xs text-muted">{root}</span>
        <Button onClick={() => root && call("files:open", root)} disabled={!root}><ExternalLink size={15} /> Open in Explorer</Button>
        <Button onClick={load}><RefreshCw size={15} /></Button>
      </PageHeader>
      <div className="grid min-h-0 flex-1 grid-cols-[340px_1fr] gap-4">
        <div className="flex min-h-0 flex-col rounded-lg border border-line bg-panel">
          <div className="border-b border-line p-2"><Input placeholder="Search applicants" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
          <ul className="min-h-0 flex-1 overflow-auto p-1">
            {shown.length === 0 && <Empty>No applicant folders yet</Empty>}
            {shown.map((n) => renderNode(n, 0))}
          </ul>
        </div>
        <div className="min-h-0 overflow-auto">
          {sel ? <Preview file={sel} all={all} /> : <Card><Empty>Select a recording or transcript</Empty></Card>}
        </div>
      </div>
    </div>
  );
}

function Preview({ file, all }: { file: FileNode; all: FileNode[] }) {
  const isAudio = /\.(webm|wav|mp3|m4a)$/i.test(file.name);
  const isPdf = /\.pdf$/i.test(file.name);
  const isText = /\.(txt|srt|md|json|csv)$/i.test(file.name);
  const base = file.path.replace(/(_transcript)?\.(webm|wav|mp3|m4a|txt|srt)$/i, "");
  // A transcript shows text only; the player appears only when the recording itself is selected.
  const audio = isAudio ? file : undefined;
  const isVideo = /\.webm$/i.test(audio?.name ?? "");
  const transcript = all.find((f) => f.path === base + "_transcript.txt");
  const srt = all.find((f) => f.path === base + "_transcript.srt");

  const [src, setSrc] = useState<string | null>(null);
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [segs, setSegs] = useState<Seg[]>([]);
  const [now, setNow] = useState(0);
  const videoPlayer = useRef<HTMLVideoElement>(null);
  const audioPlayer = useRef<HTMLAudioElement>(null);
  const seek = (time: number) => {
    const el = videoPlayer.current ?? audioPlayer.current;
    if (el) { el.currentTime = time; void el.play(); }
  };

  useEffect(() => {
    let url: string | null = null;
    setSrc(null); setPdfSrc(null); setText(""); setSegs([]);
    (async () => {
      if (audio) {
        const bytes = await call<Uint8Array>("files:readBinary", audio.path);
        const mime = /\.webm$/i.test(audio.name) ? "video/webm" : /\.wav$/i.test(audio.name) ? "audio/wav" : /\.m4a$/i.test(audio.name) ? "audio/mp4" : "audio/mpeg";
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
        setSrc(url);
      }
      if (isPdf) {
        const bytes = await call<Uint8Array>("files:readBinary", file.path);
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        setPdfSrc(url);
      }
      if (transcript) setText(await call<string>("files:readText", transcript.path));
      else if (srt) setSegs(parseSrt(await call<string>("files:readText", srt.path)));
      else if (isText) setText(await call<string>("files:readText", file.path));
    })();
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the resolved paths change
  }, [file.path, audio?.path, transcript?.path, srt?.path, isPdf, isText]);

  return (
    <Card title={file.name} actions={<Button variant="ghost" onClick={() => call("files:reveal", file.path)}><ExternalLink size={15} /> Show in folder</Button>}>
      {src && (isVideo ? (
        <video ref={videoPlayer} src={src} controls className="mb-4 w-full rounded bg-black" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
      ) : (
        <audio ref={audioPlayer} src={src} controls className="mb-4 w-full" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} />
      ))}
      {pdfSrc && <iframe src={pdfSrc} title={file.name} style={{ height: "70vh" }} className="mb-4 w-full rounded border border-line bg-white" />}
      {segs.length > 0 ? (
        <ul className="space-y-1">
          {segs.map((s, i) => (
            <li key={i}>
              <button
                onClick={() => seek(s.start)}
                className={cx("flex w-full gap-3 rounded px-2 py-1 text-left text-sm", now >= s.start && now < s.end ? "bg-accent-soft" : "hover:bg-panel-2")}
              >
                <span className="w-12 shrink-0 font-mono text-xs text-muted">{fmtT(s.start)}</span>
                <span>{s.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : text ? (
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{text}</pre>
      ) : !isAudio && !isPdf ? (
        <div className="text-sm text-muted">
          Preview not available. <button className="text-accent hover:underline" onClick={() => call("files:open", file.path)}>Open with default app</button>
        </div>
      ) : (
        <p className="text-sm text-muted">No transcript yet for this recording.</p>
      )}
    </Card>
  );
}
