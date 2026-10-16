// The pages down the left edge, each drawn small when it scrolls into view.
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const WIDTH = 120;

function Thumb({ doc, n, active, aspect, onPick }: { doc: PDFDocumentProxy; n: number; active: boolean; aspect: number; onPick: (n: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLButtonElement>(null);

  // Drawn once, when first on screen: a 300-page document draws only what is looked at.
  useEffect(() => {
    let cancelled = false;
    let task: { cancel(): void } | null = null;
    const io = new IntersectionObserver(async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const pg = await doc.getPage(n);
      if (cancelled || !canvas.current) return;
      const base = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: (WIDTH * devicePixelRatio) / base.width });
      canvas.current.width = vp.width;
      canvas.current.height = vp.height;
      const t = pg.render({ canvas: canvas.current, viewport: vp });
      task = t;
      t.promise.catch(() => { /* cancelled on unmount */ });
    }, { rootMargin: "200px" });
    if (box.current) io.observe(box.current);
    return () => { cancelled = true; io.disconnect(); task?.cancel(); };
  }, [doc, n]);

  useEffect(() => { if (active) box.current?.scrollIntoView({ block: "nearest" }); }, [active]);

  return (
    <button ref={box} onClick={() => onPick(n)} className="flex flex-col items-center gap-1 rounded-md p-1.5 hover:bg-[var(--bg-hover)]"
      style={active ? { background: "var(--accent-soft)" } : undefined}>
      {/* Page-shaped before it is drawn: with no height, every thumbnail would be "on screen" at
          once and all of them would draw. */}
      <canvas ref={canvas} className="rounded-sm bg-white shadow" style={{ width: WIDTH, aspectRatio: aspect }} />
      <span className="text-[11px] text-text-muted">{n}</span>
    </button>
  );
}

export function Thumbnails({ doc, current, onPick }: { doc: PDFDocumentProxy; current: number; onPick: (n: number) => void }) {
  // The first page's shape stands in for every page until each is drawn.
  const [aspect, setAspect] = useState(1 / Math.SQRT2);
  useEffect(() => {
    let live = true;
    void doc.getPage(1).then((p) => { const v = p.getViewport({ scale: 1 }); if (live) setAspect(v.width / v.height); });
    return () => { live = false; };
  }, [doc]);
  return (
    <div className="flex w-40 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-subtle p-2">
      {Array.from({ length: doc.numPages }, (_, i) => (
        <Thumb key={i + 1} doc={doc} n={i + 1} active={current === i + 1} aspect={aspect} onPick={onPick} />
      ))}
    </div>
  );
}
