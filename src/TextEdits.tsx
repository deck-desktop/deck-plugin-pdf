// "Edit text": click a line of the page's own text and type over it. Each edit is shown here as a
// cover in the page's colour with the new text on it, until saving paints it into the PDF
// (textedit.ts). Positioned from PDF coordinates, so it stays put through zoom and scroll.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PDFViewer } from "pdfjs-dist/web/pdf_viewer.mjs";
import type { PDFDocument } from "@pdfme/pdf-lib";
import type { ImportedFont } from "./fonts";
import { embeddable, fontProgram, formatOf, originalStyle, resolve, sampleColors, type TextEdit, type TextFormat } from "./textedit";

/** The CSS the screen draws an edit's text with: the font saving will use (resolve). */
const fontOf = (e: TextEdit, fonts: ImportedFont[]) => {
  const r = resolve(e, fonts);
  return "program" in r ? { fontFamily: `"${r.face}"`, fontWeight: 400, fontStyle: "normal" } : r.css;
};

/** How wide `text` draws in the font the edit is saved in, so the editor grows as you type. */
let ctx: CanvasRenderingContext2D | null = null;
const measure = (e: TextEdit, size: number, fonts: ImportedFont[]) => {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return e.after.length * size * 0.6;
  const f = fontOf(e, fonts);
  ctx.font = `${f.fontStyle} ${f.fontWeight} ${size}px ${f.fontFamily}`;
  return ctx.measureText(e.after).width;
};

interface Viewport {
  scale: number;
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
}
interface TextItem { str: string; transform: number[]; width: number; fontName: string }
interface Page {
  getTextContent(): Promise<{ items: (TextItem | { type: string })[]; styles: Record<string, { fontFamily?: string; ascent?: number; descent?: number }> }>;
  commonObjs: { get(id: string): { name?: string; bold?: boolean; italic?: boolean; fallbackName?: string } };
}
const pageView = (v: PDFViewer, n: number) => v.getPageView(n - 1) as { div: HTMLDivElement; viewport: Viewport; pdfPage: Page } | undefined;

/**
 * The fonts of a document that can draw text again, each loaded for the screen once. Keyed by the
 * pdf-lib copy of the document, so a reload after saving starts over.
 */
const fontCache = new WeakMap<PDFDocument, Map<string, Promise<{ program: Uint8Array | null; face: string }>>>();
let faces = 0;
function ownFontOf(lib: PDFDocument, pageIndex: number, baseFont: string) {
  let m = fontCache.get(lib);
  if (!m) fontCache.set(lib, (m = new Map()));
  const key = `${pageIndex}:${baseFont}`;
  if (!m.has(key)) {
    m.set(key, (async () => {
      const program = fontProgram(lib, pageIndex, baseFont);
      if (!program || !embeddable(program)) return { program: null, face: "" };
      // The browser checks a font before using it, and refuses some a PDF can hold: then the
      // standard font is used for both the preview and the save.
      const face = new FontFace(`pdf-edit-${++faces}`, program as Uint8Array<ArrayBuffer>);
      try { document.fonts.add(await face.load()); } catch { return { program: null, face: "" }; }
      return { program, face: face.family };
    })());
  }
  return m.get(key)!;
}

/**
 * The runs of one line around `at`: PDF.js breaks a line into several where the font's spacing
 * leaves gaps (often at each space in a monospaced font), and the line is what was clicked.
 * Neighbours join while they share the font and baseline and nothing wider than a few spaces
 * separates them.
 */
export function lineAround<T extends { str: string; transform: number[]; width: number; fontName: string }>(items: (T | { type: string })[], at: number) {
  const run = items[at] as T;
  const size = Math.hypot(run.transform[2], run.transform[3]);
  const same = (i: T | { type: string } | undefined): i is T =>
    !!i && "str" in i && i.fontName === run.fontName && Math.abs(i.transform[5] - run.transform[5]) < size * 0.1;
  let first = at, last = at;
  const gap = (l: T, r: T) => r.transform[4] - (l.transform[4] + l.width);
  // Empty items stand between runs where PDF.js saw a space: stepped over, not joined.
  const prev = (i: number) => { let j = i - 1; while (j >= 0 && "str" in items[j] && !(items[j] as T).str) j--; return j; };
  const next = (i: number) => { let j = i + 1; while (j < items.length && "str" in items[j] && !(items[j] as T).str) j++; return j; };
  for (let j = prev(first); same(items[j]) && gap(items[j] as T, items[first] as T) < size * 2 && gap(items[j] as T, items[first] as T) > -size; j = prev(j)) first = j;
  for (let j = next(last); same(items[j]) && gap(items[last] as T, items[j] as T) < size * 2 && gap(items[last] as T, items[j] as T) > -size; j = next(j)) last = j;
  const runs = items.slice(first, last + 1).filter((i): i is T => "str" in i && !!i.str);
  let text = runs[0].str;
  for (let k = 1; k < runs.length; k++) {
    const l = runs[k - 1], r = runs[k];
    text += (gap(l, r) > size * 0.15 && !/\s$/.test(l.str) && !/^\s/.test(r.str) ? " " : "") + r.str;
  }
  const end = runs[runs.length - 1];
  return { runs, text, size, x: runs[0].transform[4], y: run.transform[5], width: end.transform[4] + end.width - runs[0].transform[4] };
}

/** A new edit for the line whose text-layer span was clicked, or null when it is not one. */
export async function editFromSpan(v: PDFViewer, span: HTMLElement, lib: () => Promise<PDFDocument>): Promise<TextEdit | null> {
  const pageDiv = span.closest<HTMLDivElement>(".page");
  const n = Number(pageDiv?.dataset.pageNumber);
  const view = n ? pageView(v, n) : undefined;
  const canvas = pageDiv?.querySelector("canvas");
  const spanText = span.textContent ?? "";
  if (!view || !canvas || !spanText.trim()) return null;
  const c = canvas.getBoundingClientRect(), r = span.getBoundingClientRect();
  const [sx1, sy1] = view.viewport.convertToPdfPoint(r.left - c.left, r.bottom - c.top);
  const [sx2, sy2] = view.viewport.convertToPdfPoint(r.right - c.left, r.top - c.top);
  // The span's own box, until the run it was made from says better.
  let rect: TextEdit["rect"] = [Math.min(sx1, sx2), Math.min(sy1, sy2), Math.abs(sx2 - sx1), Math.abs(sy2 - sy1)];
  let text = spanText;
  let origin: TextEdit["origin"] = [rect[0], rect[1] + rect[3] * 0.22];
  let size = rect[3];
  let format: TextFormat = formatOf(undefined);
  let own = { program: null as Uint8Array | null, face: "" };

  // The run the span was made from, and the rest of its line: the baseline, size and font exactly
  // as the page sets them. The nearest run with the same text, as a line can repeat on a page.
  try {
    const page = view.pdfPage;
    const content = await page.getTextContent();
    const dist = (i: number) => { const t = (content.items[i] as TextItem).transform; return Math.hypot(t[4] - rect[0], t[5] - rect[1]); };
    const at = content.items.map((_, i) => i).filter((i) => (content.items[i] as TextItem).str === spanText).sort((a, b) => dist(a) - dist(b))[0];
    if (at !== undefined) {
      const line = lineAround(content.items as (TextItem | { type: string })[], at);
      const fontName = line.runs[0].fontName;
      const style = content.styles[fontName] ?? {};
      const ascent = style.ascent || 0.9, descent = style.descent ? -Math.abs(style.descent) : -0.25;
      text = line.text;
      size = line.size;
      origin = [line.x, line.y];
      rect = [line.x, line.y + descent * size, line.width, (ascent - descent) * size];
      let font: ReturnType<Page["commonObjs"]["get"]> | undefined;
      try { font = page.commonObjs.get(fontName); } catch { /* not loaded: the name is unknown */ }
      format = formatOf({ ...font, fallbackName: font?.fallbackName ?? style.fontFamily });
      own = await ownFontOf(await lib(), n - 1, format.baseFont);
    }
  } catch (e) { console.warn("[pdf] reading the line's font failed", e); }

  // The colours, read off the drawn page: canvas pixels per CSS pixel may differ (zoom, HiDPI).
  let colors = { color: "#000000", background: "#ffffff" };
  try {
    const [ax, ay] = view.viewport.convertToViewportPoint(rect[0], rect[1]);
    const [bx2, by2] = view.viewport.convertToViewportPoint(rect[0] + rect[2], rect[1] + rect[3]);
    const [x1, y1, x2, y2] = [Math.min(ax, bx2), Math.min(ay, by2), Math.max(ax, bx2), Math.max(ay, by2)];
    const k = canvas.width / c.width;
    const pad = 4;
    const bx = Math.max(0, Math.floor(x1 * k) - pad), by = Math.max(0, Math.floor(y1 * k) - pad);
    const bw = Math.min(canvas.width - bx, Math.ceil((x2 - x1) * k) + pad * 2), bh = Math.min(canvas.height - by, Math.ceil((y2 - y1) * k) + pad * 2);
    const img = canvas.getContext("2d")!.getImageData(bx, by, bw, bh);
    colors = sampleColors(img.data, bw, { x: pad, y: pad, w: bw - pad * 2, h: bh - pad * 2 });
  } catch (e) { console.warn("[pdf] reading the text's colours failed", e); }
  const base = { page: n, rect, origin, before: text, after: text, size, format, ...own, ...colors };
  return { ...base, style: originalStyle(base) };
}

export function TextEdits({ viewer, container, edits, editing, fonts, tick, onChange, onEdit, onDone, onRemove }: {
  viewer: PDFViewer | null;
  container: HTMLDivElement | null;
  edits: TextEdit[];
  editing: number | null;
  fonts: ImportedFont[];
  /** Changes whenever pages move or redraw, so the boxes are placed again. */
  tick: number;
  onChange: (i: number, after: string) => void;
  /** An edit made earlier was clicked: type in it again. */
  onEdit: (i: number) => void;
  onDone: (i: number, keep: boolean) => void;
  onRemove: (i: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [, redraw] = useState(0);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, [editing]);
  // Placed again on resize too: fit-width changes the scale without a scroll.
  useEffect(() => {
    if (!container) return;
    const ro = new ResizeObserver(() => redraw((n) => n + 1));
    ro.observe(container);
    return () => ro.disconnect();
  }, [container]);
  if (!viewer || !container) return null;
  void tick;
  const box = container.getBoundingClientRect();

  return (
    <div className="pointer-events-none absolute left-0 top-0" style={{ width: 0, height: 0 }}>
      {edits.map((e, i) => {
        const view = pageView(viewer, e.page);
        const canvas = view?.div.querySelector("canvas");
        if (!view || !canvas) return null;
        const c = canvas.getBoundingClientRect();
        const ox = c.left - box.left + container.scrollLeft, oy = c.top - box.top + container.scrollTop;
        // Two opposite corners: PDF.js 6 has no rectangle conversion, and a rotated page swaps axes.
        const [a, b] = view.viewport.convertToViewportPoint(e.rect[0], e.rect[1]);
        const [cx, d] = view.viewport.convertToViewportPoint(e.rect[0] + e.rect[2], e.rect[1] + e.rect[3]);
        const left = ox + Math.min(a, cx), top = oy + Math.min(b, d);
        const width = Math.abs(cx - a), height = Math.abs(d - b);
        // The text is drawn the way saving draws it (textedit.ts): from the original's baseline, at
        // its size, in the same font. SVG text sits on its y, so the baseline needs no font metrics.
        const [bx, by] = view.viewport.convertToViewportPoint(e.origin[0], e.origin[1]);
        const k = view.viewport.scale;
        const fontSize = e.style.size * k;
        const font = fontOf(e, fonts);
        return (
          <div key={i} className="group">
            {/* One PDF unit bigger each way, as saving paints it. */}
            <div className="absolute" style={{ left: left - k, top: top - k, width: width + 2 * k, height: height + 2 * k, background: e.background }} />
            <svg className="absolute" style={{ left: 0, top: 0, width: 1, height: 1, overflow: "visible" }}>
              <text x={ox + bx} y={oy + by} fontSize={fontSize} fill={e.style.color} style={{ ...font, whiteSpace: "pre" }}>{e.after}</text>
            </svg>
            {editing === i ? (
              // Typed into with its own text hidden: the line above shows what is typed, the caret and
              // selection show here, in the same font so they line up.
              <input ref={input} data-pdf-edit-input value={e.after} onChange={(ev) => onChange(i, ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === "Enter") onDone(i, true); if (ev.key === "Escape") onDone(i, false); }}
                className="pointer-events-auto absolute border-0 bg-transparent p-0 outline-none"
                style={{ ...font, left: ox + bx, top: oy + by - fontSize, height: fontSize * 1.25, fontSize, lineHeight: `${fontSize}px`, color: "transparent", caretColor: e.style.color,
                  width: Math.max(width - (ox + bx - left), measure(e, fontSize, fonts)) + 4, boxShadow: "0 0 0 2px var(--accent)" }} />
            ) : (
              <div className="pointer-events-auto absolute cursor-text" style={{ left, top, width: Math.max(width, ox + bx - left + measure(e, fontSize, fonts)), height }} title={`Was: ${e.before}`}
                onClick={(ev) => { ev.stopPropagation(); onEdit(i); }}>
                <button onClick={(ev) => { ev.stopPropagation(); onRemove(i); }} title="Undo this edit"
                  className="absolute -right-2 -top-2 hidden size-4 place-items-center rounded-full border border-subtle text-text-secondary shadow-xl transition-colors hover:text-red-400 group-hover:grid"
                  style={{ background: "var(--bg-card)" }}><X size={10} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
