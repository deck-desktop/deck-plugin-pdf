// The PDF tab from the + picker: Open…, and the PDFs opened lately.
import { FileText, FolderOpen, X } from "lucide-react";
import { openFile } from "deck-plugin-sdk/terminals";
import { forgetRecent, pickAndOpen, useRecent } from "./recent";

export default function Home() {
  const recent = useRecent();
  return (
    <div className="flex h-full flex-col gap-5 p-6">
      <header className="flex items-center gap-3">
        <FileText size={18} style={{ color: "var(--accent)" }} />
        <h1 className="text-base font-semibold text-text-primary">PDF</h1>
        <button onClick={() => void pickAndOpen()}
          className="ml-auto flex items-center gap-1.5 rounded-md border border-subtle bg-elev px-3 py-1.5 text-xs text-text-secondary hover:border-accent hover:text-text-primary">
          <FolderOpen size={13} /> Open…
        </button>
      </header>
      <p className="max-w-[64ch] text-sm text-text-secondary">
        PDFs open here from the Editor's file tree, a Ctrl+click in a terminal, or Windows' "Open with".
      </p>
      <section className="flex min-h-0 flex-col gap-1">
        <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Recent</div>
        {recent.length === 0 && <p className="px-1 text-xs text-text-muted">Nothing opened yet.</p>}
        {recent.map((p) => (
          <div key={p} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bg-hover)]">
            <FileText size={14} className="shrink-0 text-text-muted" />
            <button onClick={() => openFile(p)} className="min-w-0 flex-1 truncate text-left text-sm text-text-primary" title={p}>
              {p.split(/[\\/]/).pop()}
              <span className="ml-2 text-xs text-text-muted">{p.replace(/[\\/][^\\/]*$/, "")}</span>
            </button>
            <button onClick={() => void forgetRecent(p)} title="Remove from the list"
              className="opacity-0 text-text-muted hover:text-text-primary group-hover:opacity-100"><X size={13} /></button>
          </div>
        ))}
      </section>
    </div>
  );
}
