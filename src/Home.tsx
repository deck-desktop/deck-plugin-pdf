// The PDF tab from the + picker: Open…, and the PDFs opened lately.
import { FileText, FolderOpen, X } from "lucide-react";
import { openFile } from "deck-plugin-sdk/terminals";
import { forgetRecent, pickAndOpen, useRecent } from "./recent";

export default function Home() {
  const recent = useRecent();
  return (
    // The Editor's empty state, for PDFs: what the tab is, the one way in, and what was opened lately.
    <div className="scroll-thin flex h-full overflow-y-auto px-6">
      <div className="m-auto flex w-full max-w-[460px] flex-col gap-5 py-8">
        <div>
          <h2 className="text-[20px] font-semibold text-text-primary">PDF</h2>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            PDFs open here from the Editor's file tree, a Ctrl+click in a terminal, or Windows' "Open with".
          </p>
        </div>
        <div>
          <button onClick={() => void pickAndOpen()}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium text-white transition hover:brightness-110" style={{ background: "var(--accent)" }}>
            <FolderOpen size={13} /> Open…
          </button>
        </div>
        <section className="flex min-h-0 flex-col gap-0.5">
          <span className="px-2.5 pb-1 text-[12px] font-medium text-text-secondary">Recent</span>
          {recent.length === 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-subtle bg-elev px-3 py-3 text-[12px] leading-relaxed text-text-muted">
              <FileText size={16} className="mt-0.5 shrink-0" />
              <span>Nothing opened yet. The PDFs you open show here, to open again in one click.</span>
            </div>
          )}
          {recent.map((p) => (
            <div key={p} className="group flex h-8 items-center gap-2.5 rounded-lg px-2.5 transition-colors hover:bg-white/5">
              <FileText size={14} className="shrink-0 text-text-muted" />
              <button onClick={() => openFile(p)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left text-[13px]" title={p}>
                <span className="shrink-0 text-text-primary">{p.split(/[\\/]/).pop()}</span>
                <span className="min-w-0 truncate text-[12px] text-text-muted">{p.replace(/[\\/][^\\/]*$/, "")}</span>
              </button>
              <button onClick={() => void forgetRecent(p)} title="Remove from the list"
                className="grid size-5 shrink-0 place-items-center rounded text-text-muted opacity-0 transition-colors hover:bg-white/10 hover:text-text-primary focus:opacity-100 group-hover:opacity-100"><X size={13} /></button>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
