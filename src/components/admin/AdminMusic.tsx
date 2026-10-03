import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Music, Upload, Star, Pencil, Trash2, RotateCcw, Play, Pause } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminListSongs, adminSaveSong, adminSongAction, adminSongUploadUrl, adminSetMusicEnabled } from "@/lib/music.functions";
import { Card, Empty, PageTitle, Spinner, inputCls, labelCls } from "@/components/ui-kit";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Song = Awaited<ReturnType<typeof adminListSongs>>["songs"][number];
type Form = { id?: string; title: string; artist: string; file_path: string; cover_path: string | null; active: boolean; sort: number };

export function AdminMusic() {
  const list = useServerFn(adminListSongs);
  const act = useServerFn(adminSongAction);
  const setEnabled = useServerFn(adminSetMusicEnabled);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"songs" | "trash">("songs");
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<Song | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const { data, isLoading } = useQuery({ queryKey: ["admin-songs"], queryFn: () => list() });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["admin-songs"] }); qc.invalidateQueries({ queryKey: ["welcome-song"] }); };
  const run = async (s: Song, action: "welcome" | "unwelcome" | "delete" | "restore" | "on" | "off", msg: string) => {
    try { await act({ data: { id: s.id, action } }); toast.success(msg); refresh(); } catch { toast.error("Admin session expired — log in again"); }
  };
  const songs = (data?.songs ?? []).filter((s) => (tab === "trash" ? !!s.deleted_at : !s.deleted_at));
  const togglePreview = (s: Song) => {
    if (preview === s.id) { audio.current?.pause(); setPreview(null); return; }
    if (audio.current && s.url) { audio.current.src = s.url; audio.current.play().catch(() => {}); setPreview(s.id); }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle sub="The song marked ★ Welcome plays for visitors when they enter the site.">Music</PageTitle>
        <button onClick={() => setForm({ title: "", artist: "", file_path: "", cover_path: null, active: true, sort: (data?.songs.length ?? 0) })} className="btn-glow"><Upload className="h-4 w-4" /> Add song</button>
      </div>
      <Card className="flex items-center justify-between gap-3">
        <div>
          <div className="label-premium">Welcome autoplay</div>
          <p className="text-xs text-muted-foreground">When off, no song plays anywhere on the public site.</p>
        </div>
        <Switch aria-label="Welcome autoplay" checked={data?.enabled ?? true} onCheckedChange={async (v) => {
          try { await setEnabled({ data: { enabled: v } }); toast.success(v ? "Welcome music turned on" : "Welcome music turned off"); refresh(); } catch { toast.error("Could not save"); }
        }} />
      </Card>
      <div className="flex gap-2">
        {(["songs", "trash"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? "bg-brand text-primary-foreground" : "border border-border"}`}>
            {t} ({(data?.songs ?? []).filter((s) => (t === "trash" ? !!s.deleted_at : !s.deleted_at)).length})
          </button>
        ))}
      </div>
      <audio ref={audio} onEnded={() => setPreview(null)} className="hidden" />
      {isLoading ? <Skeleton className="h-40 rounded-3xl" /> : !songs.length ? <Card><Empty text={tab === "trash" ? "Trash is empty." : "No songs yet. Upload your first welcome song."} /></Card> : songs.map((s) => (
        <Card key={s.id} className="flex flex-wrap items-center gap-3 !p-4">
          <div className="bg-brand flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-primary-foreground">
            {s.cover ? <img src={s.cover} alt="" className="h-full w-full object-cover" /> : <Music className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="label-premium flex items-center gap-2 truncate">{s.title}{s.is_welcome && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">★ WELCOME</span>}</div>
            <div className="truncate text-xs text-muted-foreground">{s.artist || "Unknown artist"} · order {s.sort}</div>
          </div>
          {tab === "songs" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <button aria-label="Preview" onClick={() => togglePreview(s)} className="rounded-lg p-2 hover:bg-accent">{preview === s.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
              <Switch aria-label="On/off" checked={s.active} onCheckedChange={(v) => run(s, v ? "on" : "off", v ? "Song turned on" : "Song turned off")} />
              <button onClick={() => run(s, s.is_welcome ? "unwelcome" : "welcome", s.is_welcome ? "Welcome song removed" : "Welcome song set — visitors will hear it now")}
                className={`btn-ghost-glow !px-3 !py-1.5 text-xs ${s.is_welcome ? "text-primary" : ""}`}><Star className="h-3.5 w-3.5" /> {s.is_welcome ? "Unset" : "Set welcome"}</button>
              <button aria-label="Edit" onClick={() => setForm({ id: s.id, title: s.title, artist: s.artist, file_path: s.file_path, cover_path: s.cover_path, active: s.active, sort: s.sort })} className="rounded-lg p-2 hover:bg-accent"><Pencil className="h-4 w-4" /></button>
              <button aria-label="Delete" onClick={() => setDel(s)} className="rounded-lg p-2 text-destructive hover:bg-accent"><Trash2 className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={() => run(s, "restore", "Song restored")} className="btn-ghost-glow !px-3 !py-1.5 text-xs"><RotateCcw className="h-3.5 w-3.5" /> Restore</button>
          )}
        </Card>
      ))}
      {form && <SongDialog initial={form} onClose={() => setForm(null)} onSaved={refresh} />}
      <AlertDialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move "{del?.title}" to Trash?</AlertDialogTitle>
            <AlertDialogDescription>You can restore it from the Trash tab at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (del) run(del, "delete", "Moved to Trash"); setDel(null); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SongDialog({ initial, onClose, onSaved }: { initial: Form; onClose: () => void; onSaved: () => void }) {
  const save = useServerFn(adminSaveSong);
  const getUpload = useServerFn(adminSongUploadUrl);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const upload = async (file: File, kind: "audio" | "cover") => {
    if (kind === "audio" && !file.type.startsWith("audio/")) { toast.error("Choose an audio file (MP3, M4A, OGG, WAV)"); return; }
    if (kind === "cover" && !file.type.startsWith("image/")) { toast.error("Choose an image file"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20 MB"); return; }
    setBusy(kind);
    try {
      const { path, token } = await getUpload({ data: { name: file.name } });
      const { error } = await supabase.storage.from("music").uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (error) throw error;
      setF((x) => kind === "audio"
        ? { ...x, file_path: path, title: x.title || file.name.replace(/\.[^.]+$/, "").slice(0, 120) }
        : { ...x, cover_path: path });
      toast.success(kind === "audio" ? "Song uploaded" : "Cover uploaded");
    } catch { toast.error("Upload failed. Try again."); }
    finally { setBusy(null); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.file_path) { toast.error("Upload an audio file first"); return; }
    if (!f.title.trim()) { toast.error("Title is required"); return; }
    setBusy("save");
    try { await save({ data: f }); toast.success(f.id ? "Song saved" : "Song added"); onSaved(); onClose(); }
    catch { toast.error("Could not save — check the fields or log in again"); }
    finally { setBusy(null); }
  };
  const close = () => { if (dirty && !confirm("Discard unsaved changes?")) return; onClose(); };

  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{f.id ? "Edit song" : "Add song"}</DialogTitle>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <span className={labelCls}>Audio file</span>
            <label className="btn-ghost-glow w-full cursor-pointer">
              {busy === "audio" ? <Spinner /> : <Upload className="h-4 w-4" />} {f.file_path ? "Replace audio" : "Upload audio (max 20 MB)"}
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "audio")} />
            </label>
            {f.file_path && <p className="mt-1 truncate text-xs text-success">✓ Audio ready</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="s-title">Title</label>
            <input id="s-title" className={inputCls} maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
          <div>
            <label className={labelCls} htmlFor="s-artist">Artist</label>
            <input id="s-artist" className={inputCls} maxLength={120} value={f.artist} onChange={(e) => setF({ ...f, artist: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={labelCls}>Cover image</span>
              <label className="btn-ghost-glow w-full cursor-pointer !px-3 text-sm">
                {busy === "cover" ? <Spinner /> : <Upload className="h-4 w-4" />} {f.cover_path ? "Replace" : "Upload"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "cover")} />
              </label>
            </div>
            <div>
              <label className={labelCls} htmlFor="s-sort">Display order</label>
              <input id="s-sort" type="number" min={0} max={9999} className={inputCls} value={f.sort} onChange={(e) => setF({ ...f, sort: Math.max(0, Math.min(9999, Number(e.target.value) || 0)) })} />
            </div>
          </div>
          <label className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">On <Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} /></label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={close} className="btn-ghost-glow">Cancel</button>
            <button disabled={!!busy} className="btn-glow">{busy === "save" && <Spinner />} Save</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
