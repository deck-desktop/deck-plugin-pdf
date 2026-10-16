// One PDF in a pane: PDF.js's own viewer (text selection, links, forms), with a toolbar for pages,
// zoom and find, and a thumbnails sidebar.
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, FileWarning, FolderOpen, Minus, PanelLeft, Plus, Save, Search } from "lucide-react";
import { fsReadBytes, fsWriteBytes, pickAnyFile, pickSavePath } from "deck-plugin-sdk/bridge";
import { openFile } from "deck-plugin-sdk/terminals";
import { ContextMenu, onKeys, useScope, type MenuEntry } from "deck-plugin-sdk/ui";
import "./viewerlib";
import { EventBus, PDFFindController, PDFLinkService, PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import "pdfjs-dist/web/pdf_viewer.css";
import "./viewer.css";
import { loadDocument, pdfjsLib } from "./pdfjs";
import { Thumbnails } from "./Thumbnails";
import { pickAndOpen, rememberRecent } from "./recent";
import { COLORS, Dock, EDIT_TEXT, NAMED_COLORS, PANEL, SIZES, type EditState, type Tool } from "./EditBar";
import { StyleBar } from "./StyleBar";
import { importFont, importedFonts, useFonts } from "./fonts";
import { TextEdits, editFromSpan } from "./TextEdits";
import { History } from "./history";
import { applyTextEdits, changed, matchImported, type TextEdit, type TextStyle } from "./textedit";
import { PDFDocument } from "@pdfme/pdf-lib";

const { AnnotationEditorType: T, AnnotationEditorParamsType: P } = pdfjsLib;
/** The colour and size parameter of each tool that has them. */
const PARAMS: Record<number, { color: number; size: number }> = {
  [T.FREETEXT]: { color: P.FREETEXT_COLOR, size: P.FREETEXT_SIZE },
  [T.INK]: { color: P.INK_COLOR, size: P.INK_THICKNESS },
  [T.HIGHLIGHT]: { color: P.HIGHLIGHT_COLOR, size: P.HIGHLIGHT_THICKNESS },
};
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

/** What of PDF.js's editor manager the shared history wraps. */
interface PdfjsUi {
  addCommands(params: { type?: number; overwriteIfSameType?: boolean }): void;
  undo(): void;
  redo(): void;
}

type Doc = Awaited<ReturnType<typeof loadDocument>["promise"]>;

const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function Viewer({ file }: { file: string }) {
  const container = useRef<HTMLDivElement>(null);
  const viewerEl = useRef<HTMLDivElement>(null);
  const findInput = useRef<HTMLInputElement>(null);
  const viewer = useRef<PDFViewer | null>(null);
  const bus = useRef<EventBus | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [pageText, setPageText] = useState("1");
  const [scale, setScale] = useState(1);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ current: number; total: number } | null>(null);
  const [thumbs, setThumbs] = useState(true);
  // PDF.js's own undo and redo, from before they were routed through the shared history.
  const ui = useRef<{ undo(): void; redo(): void } | null>(null);
  const history = useRef(new History<TextEdit[]>());
  // The retyped text as last recorded in the history: the next text step starts from it.
  const committed = useRef<TextEdit[]>([]);
  const [, historyChanged] = useState(0);
  // Undo and redo as of this render, for PDF.js's keyboard and the key bindings mounted once.
  const step = useRef({ undo: () => {}, redo: () => {} });
  const [edit, setEdit] = useState<EditState>({
    mode: T.NONE, color: COLORS[0], canUndo: false, canRedo: false, dirty: false, saving: false,
    size: Object.fromEntries(Object.entries(SIZES).map(([k, v]) => [k, v.values[1]])),
  });
  const [saveError, setSaveError] = useState("");
  // Retyped page text, until saved; and which one has the cursor.
  const [textMode, setTextMode] = useState(false);
  const [edits, setEdits] = useState<TextEdit[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  // Bumped when pages move or redraw (the edit boxes are placed again), and to reload the file.
  const [tick, setTick] = useState(0);
  const [reloads, setReloads] = useState(0);
  // Where the view was, to come back to after a save reloads the pages.
  const keepView = useRef<{ scale: number; top: number; left: number } | null>(null);

  const fonts = useFonts();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuEntry[]; alignRight: boolean; up?: boolean } | null>(null);

  useScope("plugin:pdf");

  // The viewer and its document, for this file. Everything PDF.js made is let go on the way out:
  // a pane is unmounted when its tab is not showing, and a reload remounts it.
  useEffect(() => {
    let gone = false;
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({ eventBus });
    const findController = new PDFFindController({ eventBus, linkService });
    const v = new PDFViewer({
      container: container.current!, viewer: viewerEl.current!, eventBus, linkService, findController,
      annotationMode: pdfjsLib.AnnotationMode.ENABLE_FORMS,
      // NONE, not DISABLE: the annotation editors are there, with no tool picked yet.
      annotationEditorMode: T.NONE,
      // Required in practice: without it a highlight crashes as it ends, and the drawing it leaves
      // behind breaks every ink stroke after it until the plugin reloads.
      annotationEditorHighlightColors: NAMED_COLORS.map(([n, c]) => `${n}=${c}`).join(","),
      textLayerMode: 1,
    });
    linkService.setViewer(v);
    viewer.current = v;
    bus.current = eventBus;
    eventBus.on("pagesinit", () => {
      const kept = keepView.current;
      keepView.current = null;
      if (!kept) { v.currentScaleValue = "page-width"; return; }
      v.currentScale = kept.scale;
      requestAnimationFrame(() => { container.current?.scrollTo(kept.left, kept.top); });
    });
    eventBus.on("pagechanging", (e: { pageNumber: number }) => { setPage(e.pageNumber); setPageText(String(e.pageNumber)); });
    eventBus.on("scalechanging", (e: { scale: number }) => setScale(e.scale));
    for (const ev of ["pagerendered", "updateviewarea", "textlayerrendered"]) eventBus.on(ev, () => setTick((n) => n + 1));
    eventBus.on("updatefindmatchescount", (e: { matchesCount: { current: number; total: number } }) => setMatches(e.matchesCount));
    eventBus.on("updatefindcontrolstate", (e: { matchesCount?: { current: number; total: number } }) => { if (e.matchesCount) setMatches(e.matchesCount); });
    // Every undoable PDF.js action goes through addCommands, and its Ctrl+Z (while a tool is on)
    // through undo and redo: so each is recorded in the shared history, and walks it.
    eventBus.on("annotationeditoruimanager", (e: { uiManager: PdfjsUi }) => {
      const um = e.uiManager;
      const real = { add: um.addCommands.bind(um), undo: um.undo.bind(um), redo: um.redo.bind(um) };
      ui.current = { undo: real.undo, redo: real.redo };
      um.addCommands = (params) => {
        real.add(params);
        if (replaying.current) return;
        history.current.pdfjs(params.type ?? NaN, !!params.overwriteIfSameType);
        historyChanged((n) => n + 1);
      };
      um.undo = () => step.current.undo();
      um.redo = () => step.current.redo();
    });
    eventBus.on("annotationeditormodechanged", (e: { mode: number }) => setEdit((s) => ({ ...s, mode: e.mode })));

    let task: ReturnType<typeof loadDocument> | null = null;
    setError(""); setDoc(null); setEdits([]); setEditing(null); lib.current = null;
    // A new document, or the file read again after saving: nothing before it can be undone.
    history.current.clear(); committed.current = []; historyChanged((n) => n + 1);
    fsReadBytes(file).then((bytes) => {
      if (gone) return;
      task = loadDocument(bytes);
      return task.promise.then((d) => {
        if (gone) return; // the cleanup below destroyed the task, and with it this document
        // Annotations and form values both live in the storage: changed means unsaved.
        // Typed as `null` in PDF.js's declarations, though it is the hook it calls.
        const storage = d.annotationStorage as unknown as { onSetModified: (() => void) | null; onResetModified: (() => void) | null };
        storage.onSetModified = () => setEdit((s) => ({ ...s, dirty: true }));
        storage.onResetModified = () => setEdit((s) => ({ ...s, dirty: false }));
        v.setDocument(d);
        linkService.setDocument(d);
        setDoc(d);
        setPages(d.numPages);
        void rememberRecent(file);
      });
    }).catch((e) => {
      if (gone) return;
      console.warn("[pdf] open failed", file, e);
      setError(/no such file|cannot find|not found|os error 2/i.test(String(e)) ? "This file is not there any more." : String(e?.message ?? e));
    });
    return () => {
      gone = true;
      v.setDocument(null as never);
      linkService.setDocument(null);
      void task?.destroy();
      viewer.current = null;
      bus.current = null;
    };
  }, [file, reloads]);

  const go = (n: number) => { if (viewer.current && n >= 1 && n <= pages) viewer.current.currentPageNumber = n; };
  const zoom = (dir: 1 | -1) => {
    const v = viewer.current; if (!v) return;
    const next = dir > 0 ? ZOOMS.find((z) => z > v.currentScale + 0.01) : [...ZOOMS].reverse().find((z) => z < v.currentScale - 0.01);
    if (next) v.currentScale = next;
  };
  const fit = (how: "page-width" | "page-fit") => { if (viewer.current) viewer.current.currentScaleValue = how; };
  const find = (again: boolean, previous = false) => {
    bus.current?.dispatch("find", { source: null, type: again ? "again" : "", query, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: previous, matchDiacritics: false });
  };
  useEffect(() => { if (query) find(false); else setMatches(null); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // A pdf-lib copy of the file as opened, read only for the fonts of the lines being retyped.
  const lib = useRef<Promise<PDFDocument> | null>(null);
  const original = () => (lib.current ??= doc!.getData().then((b) => PDFDocument.load(b)));

  const param = (type: number, value: unknown) => bus.current?.dispatch("switchannotationeditorparams", { source: null, type, value });

  /** A tool on, with the colour and size picked for it. An image is chosen first, then placed. */
  const tool = async (mode: Tool) => {
    const v = viewer.current; if (!v) return;
    setTextMode(mode === EDIT_TEXT);
    if (mode === EDIT_TEXT) { v.annotationEditorMode = { mode: T.NONE }; return; }
    if (mode === T.STAMP) {
      const path = await pickAnyFile();
      if (!path) return;
      if (!IMAGE.test(path)) { setSaveError("Pick an image: PNG, JPEG, GIF, WebP, BMP or SVG."); return; }
      const bytes = await fsReadBytes(path).catch((e) => { console.warn("[pdf] reading the image failed", e); return null; });
      if (!bytes) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: path.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "" }));
      v.annotationEditorMode = { mode: T.STAMP };
      param(P.CREATE, { bitmapUrl: url });
      return;
    }
    v.annotationEditorMode = { mode };
    const ps = PARAMS[mode];
    if (ps) { param(ps.color, edit.color); param(ps.size, edit.size[mode]); }
  };
  const color = (c: string) => { setEdit((s) => ({ ...s, color: c })); const ps = PARAMS[edit.mode]; if (ps) param(ps.color, c); };
  const size = (n: number) => { setEdit((s) => ({ ...s, size: { ...s.size, [s.mode]: n } })); const ps = PARAMS[edit.mode]; if (ps) param(ps.size, n); };

  /** Write the document, its annotations and form values included, to `to` (this file by default). */
  const save = async (to = file) => {
    if (!doc) return;
    setSaveError("");
    setEdit((s) => ({ ...s, saving: true }));
    try {
      // PDF.js writes the annotations and form values, then the retyped text is painted in.
      const bytes = await applyTextEdits(await doc.saveDocument(), edits, fonts);
      await fsWriteBytes(to, bytes);
      if (to !== file) openFile(to);
      // Painted text is part of the pages now, so they are read again; the rest is just saved.
      else if (edits.length) {
        const c = container.current;
        keepView.current = { scale: viewer.current?.currentScale ?? 1, top: c?.scrollTop ?? 0, left: c?.scrollLeft ?? 0 };
        setReloads((n) => n + 1);
      }
      else doc.annotationStorage.resetModified();
    } catch (e) {
      console.warn("[pdf] save failed", to, e);
      setSaveError(`Could not save: ${String((e as Error)?.message ?? e)}`);
    } finally {
      setEdit((s) => ({ ...s, saving: false }));
    }
  };
  const saveAs = async () => {
    const to = await pickSavePath(file.split(/[\\/]/).pop() ?? "document.pdf", "pdf");
    if (to) await save(to);
  };

  const noTool = () => (viewer.current?.annotationEditorMode as unknown as number) === T.NONE && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? "")
    && !(document.activeElement as HTMLElement | null)?.isContentEditable;
  useEffect(() => onKeys({
    "plugin:pdf:save": () => void save(),
    "plugin:pdf:save-as": () => void saveAs(),
    "plugin:pdf:find": () => { findInput.current?.focus(); findInput.current?.select(); },
    "plugin:pdf:zoom-in": () => zoom(1),
    "plugin:pdf:zoom-out": () => zoom(-1),
    "plugin:pdf:fit-width": () => fit("page-width"),
    "plugin:pdf:next-page": { when: () => document.activeElement?.tagName !== "INPUT", run: () => go(page + 1) },
    "plugin:pdf:prev-page": { when: () => document.activeElement?.tagName !== "INPUT", run: () => go(page - 1) },
    // Only with no PDF.js tool on: with one, PDF.js takes Ctrl+Z itself, through the same history.
    // In a text box, Ctrl+Z is the box's own.
    "plugin:pdf:undo": { when: noTool, run: () => step.current.undo() },
    "plugin:pdf:redo": { when: noTool, run: () => step.current.redo() },
  }), [page, pages, doc, file]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The line typed in is left: kept when it changes something, dropped otherwise. */
  /** The retyped text is now `next`: shown, and recorded as one step when it differs. */
  const commit = (next: TextEdit[]) => {
    setEdits(next);
    if (next.length === committed.current.length && next.every((e, j) => e === committed.current[j])) return;
    history.current.text(committed.current, next);
    committed.current = next;
    historyChanged((n) => n + 1);
  };
  const done = (i: number, keep: boolean) => {
    setEditing(null);
    commit(edits.filter((x, j) => j !== i || (keep && changed(x))));
  };
  const replaying = useRef(false);
  const walk = (dir: "undo" | "redo") => {
    // The line being typed is finished first, so undoing takes it back whole.
    if (editing !== null) done(editing, true);
    const s = history.current[dir]();
    if (!s) return;
    if (s.kind === "pdfjs") {
      replaying.current = true;
      try { ui.current?.[dir](); } finally { replaying.current = false; }
    } else {
      committed.current = dir === "undo" ? s.before : s.after;
      setEdits(committed.current);
    }
    historyChanged((n) => n + 1);
  };
  step.current = { undo: () => walk("undo"), redo: () => walk("redo") };
  const restyle = (i: number, patch: Partial<TextStyle>) => {
    setEdits((es) => es.map((x, j) => (j === i ? { ...x, style: { ...x.style, ...patch } } : x)));
    // Back to typing: the style bar's own controls may have taken the cursor.
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>("[data-pdf-edit-input]")?.focus());
  };
  const addFont = async () => {
    setSaveError("");
    const r = await importFont().catch((e) => { console.warn("[pdf] importing a font failed", e); return { family: "", error: String(e?.message ?? e) }; });
    if (r.error) setSaveError(r.error);
    // A font imported for the line being typed is the one it uses, unless it is the original's own.
    else if (r.family && editing !== null) {
      const e = edits[editing];
      if (!matchImported(e.format.baseFont, e.style.bold, e.style.italic, importedFonts())) restyle(editing, { font: r.family });
    }
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-text-muted">
        <FileWarning size={22} />
        <div className="font-medium text-text-primary">Could not open {file.split(/[\\/]/).pop()}</div>
        <p className="max-w-sm text-center text-xs">{error}</p>
        <button onClick={() => void pickAndOpen()} className="flex items-center gap-1.5 rounded-md border border-subtle bg-elev px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary">
          <FolderOpen size={13} /> Open another PDF…
        </button>
      </div>
    );
  }

  const dirty = edit.dirty || edits.length > 0;
  const zoomMenu: MenuEntry[] = [
    { label: "Fit width", hint: "Ctrl+0", onClick: () => fit("page-width") },
    { label: "Fit page", onClick: () => fit("page-fit") },
    "sep",
    ...ZOOMS.map((z): MenuEntry => ({ label: `${Math.round(z * 100)}%`, onClick: () => { if (viewer.current) viewer.current.currentScale = z; } })),
  ];
  const openMenu = (e: React.MouseEvent, items: MenuEntry[], alignRight = false, up = false) => {
    const b = e.currentTarget.getBoundingClientRect();
    setMenu({ x: alignRight ? b.right : b.left, y: up ? b.top - 4 : b.bottom + 4, items, alignRight, up });
  };
  const current = editing !== null ? edits[editing] : undefined;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="pdf-bar">
        <div className="flex items-center">
          <button className="pdf-tool" title="Pages" onClick={() => setThumbs((t) => !t)} data-on={thumbs || undefined}><PanelLeft size={16} /></button>
        </div>
        <div className="flex items-center justify-end gap-2">
          <div className="pdf-find">
            <Search size={13} className="text-text-muted" />
            <input ref={findInput} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find (Ctrl+F)"
              onKeyDown={(e) => { if (e.key === "Enter") find(true, e.shiftKey); if (e.key === "Escape") setQuery(""); }} />
            {matches && query && <span className="tabular-nums text-text-muted">{matches.total ? `${matches.current}/${matches.total}` : "none"}</span>}
          </div>
          <div className="pdf-save" data-idle={!dirty || undefined} title={dirty ? "There are unsaved changes" : "Saved"}>
            <button onClick={() => void save()} disabled={!dirty || edit.saving}><Save size={13} /> {edit.saving ? "Saving…" : dirty ? "Save" : "Saved"}</button>
            <button title="More" onClick={(e) => openMenu(e, [{ label: "Save as…", hint: "Ctrl+Shift+S", onClick: () => void saveAs() }], true)}><ChevronDown size={13} /></button>
          </div>
        </div>
      </div>
      {saveError && <div className="shrink-0 border-b border-subtle px-3 py-1.5 text-xs text-warn">{saveError}</div>}
      <div className="flex min-h-0 flex-1">
        {thumbs && doc && <Thumbnails doc={doc} current={page} onPick={go} />}
        <div className="relative min-w-0 flex-1 bg-[var(--bg-app)]">
          <div ref={container} className={`pdf-deck-container absolute inset-0 overflow-auto ${textMode ? "pdf-edit-text" : ""}`}
            onScroll={() => setTick((n) => n + 1)}
            onClick={(e) => {
              if (!textMode || !viewer.current) return;
              // A click anywhere else ends the line being typed, and may start the next.
              if (editing !== null && !(e.target as HTMLElement).closest("[data-pdf-edit-input]")) done(editing, true);
              const span = (e.target as HTMLElement).closest<HTMLElement>(".textLayer span");
              if (!span) return;
              window.getSelection()?.removeAllRanges();
              void editFromSpan(viewer.current, span, original).then((ed) => {
                if (!ed) return;
                setEdits((es) => { setEditing(es.length); return [...es, ed]; });
              });
            }}>
            <div ref={viewerEl} className="pdfViewer" />
            <TextEdits viewer={viewer.current} container={container.current} edits={edits} editing={editing} fonts={fonts} tick={tick}
              onChange={(i, after) => setEdits((es) => es.map((x, j) => (j === i ? { ...x, after } : x)))}
              onEdit={(i) => { if (editing !== null && editing !== i) done(editing, true); setEditing(i); }}
              onDone={done}
              onRemove={(i) => { setEditing(null); commit(edits.filter((_, j) => j !== i)); }} />
          </div>
          {doc && (
            <>
              {/* Page and zoom float at the bottom corners, beside the tool dock and in its style. */}
              <div className="pdf-float" style={{ left: 16 }}>
                <div className="pdf-panel">
                  <button className="pdf-tool" title="Previous page (Page Up)" onClick={() => go(page - 1)} disabled={page <= 1}><ChevronLeft size={17} /></button>
                  <span className="pdf-pages">
                    <input value={pageText} onChange={(e) => setPageText(e.target.value)} className="pdf-page" title="Go to page"
                      style={{ width: `${Math.max(2, String(pages || 1).length) + 1}ch` }}
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => { if (e.key === "Enter") { go(Number(pageText) || page); e.currentTarget.blur(); } }}
                      onBlur={() => setPageText(String(page))} />
                    <span>/ {pages || "…"}</span>
                  </span>
                  <button className="pdf-tool" title="Next page (Page Down)" onClick={() => go(page + 1)} disabled={page >= pages}><ChevronRight size={17} /></button>
                </div>
              </div>
              <div className="pdf-float" style={{ right: 16 }}>
                <div className="pdf-panel">
                  <button className="pdf-tool" title="Zoom out (Ctrl+-)" onClick={() => zoom(-1)}><Minus size={17} /></button>
                  <button className="pdf-chip pdf-zoom" title="Zoom: fit or a set size" onClick={(e) => openMenu(e, zoomMenu, false, true)}>
                    {Math.round(scale * 100)}%
                  </button>
                  <button className="pdf-tool" title="Zoom in (Ctrl+=)" onClick={() => zoom(1)}><Plus size={17} /></button>
                </div>
              </div>
            </>
          )}
          {doc && (
            <Dock state={{ ...edit, mode: textMode ? EDIT_TEXT : edit.mode, canUndo: history.current.done.length > 0 || editing !== null, canRedo: history.current.undone.length > 0 }} onTool={(m) => void tool(m)} onColor={color} onSize={size}
              onUndo={() => walk("undo")} onRedo={() => walk("redo")}
              options={textMode ? (current
                ? <StyleBar edit={current} fonts={fonts} onStyle={(patch) => restyle(editing!, patch)} onImport={() => void addFont()} />
                : <div className={PANEL}><span className="pdf-hint">Click a line of the page to type over it, in its own font.</span></div>) : undefined} />
          )}
        </div>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} alignRight={menu.alignRight} up={menu.up} onClose={() => setMenu(null)} />}
    </div>
  );
}
