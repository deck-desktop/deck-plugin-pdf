// The tool dock, floating at the bottom of the page: which tool is on (PDF.js's own annotation
// editors, and retyping the page's text), undo and redo, and above it the options of the tool
// that is on. Everything drawn with PDF.js's tools is a real PDF annotation, written into the
// file on save, so other viewers show it too.
import type { ReactNode } from "react";
import { Highlighter, ImagePlus, MousePointer2, PenLine, Redo2, TextCursorInput, Type, Undo2 } from "lucide-react";
import { pdfjsLib } from "./pdfjs";

const { AnnotationEditorType: T } = pdfjsLib;

export type Tool = number;

/** Not one of PDF.js's editors: retyping the page's own text (TextEdits.tsx). */
export const EDIT_TEXT = -2;

const TOOLS: { mode: Tool; label: string; icon: typeof Type }[] = [
  { mode: T.NONE, label: "Select", icon: MousePointer2 },
  { mode: EDIT_TEXT, label: "Edit the page's text", icon: TextCursorInput },
  { mode: T.HIGHLIGHT, label: "Highlight text", icon: Highlighter },
  { mode: T.FREETEXT, label: "Add text", icon: Type },
  { mode: T.INK, label: "Draw", icon: PenLine },
  { mode: T.STAMP, label: "Add an image", icon: ImagePlus },
];

/** The palette every tool offers, by name: PDF.js needs the highlight colours named. */
export const NAMED_COLORS: [string, string][] = [
  ["yellow", "#FFD54A"], ["green", "#6EE7B7"], ["blue", "#60A5FA"], ["pink", "#F472B6"], ["red", "#F87171"], ["black", "#111827"],
];
export const COLORS = NAMED_COLORS.map(([, c]) => c);

/** The sizes each tool offers, in its own unit: points of text, or line thickness. */
export const SIZES: Record<number, { label: string; values: number[] }> = {
  [T.FREETEXT]: { label: "Size", values: [10, 14, 18, 24, 32] },
  [T.INK]: { label: "Line", values: [1, 2, 4, 8, 16] },
  [T.HIGHLIGHT]: { label: "Line", values: [8, 12, 16, 24] },
};

export interface EditState {
  mode: Tool;
  color: string;
  size: Record<number, number>;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  saving: boolean;
}

/** The floating panels' look: the dock, and the options above it. */
// Styled in viewer.css: a plugin only gets the Tailwind classes Deck itself uses.
export const PANEL = "pdf-panel";
export const SEP = <span className="pdf-sep" />;

export function Dock({ state, options, onTool, onColor, onSize, onUndo, onRedo }: {
  state: EditState;
  /** Shown above the dock in place of the tool's colour and size (the text style bar). */
  options?: ReactNode;
  onTool: (mode: Tool) => void;
  onColor: (color: string) => void;
  onSize: (size: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const btn = "pdf-tool";
  const sizes = SIZES[state.mode];
  const colored = state.mode === T.FREETEXT || state.mode === T.INK || state.mode === T.HIGHLIGHT;
  const toolOptions = (colored || sizes) && (
    <div className={PANEL}>
      {colored && COLORS.map((c) => (
        <Swatch key={c} color={c} on={state.color === c} onPick={onColor} />
      ))}
      {colored && sizes && SEP}
      {sizes && (
        <>
          <span className="pdf-label">{sizes.label}</span>
          {sizes.values.map((v) => (
            <button key={v} onClick={() => onSize(v)} className="pdf-chip" data-on={state.size[state.mode] === v || undefined}>{v}</button>
          ))}
        </>
      )}
    </div>
  );
  return (
    <div className="pdf-dock">
      {options ?? toolOptions}
      <div className={PANEL}>
        {TOOLS.map(({ mode, label, icon: Icon }) => (
          <button key={mode} className={btn} title={label} onClick={() => onTool(mode)} data-on={state.mode === mode || undefined}>
            <Icon size={17} />
          </button>
        ))}
        {SEP}
        <button className={btn} title="Undo (Ctrl+Z)" onClick={onUndo} disabled={!state.canUndo}><Undo2 size={17} /></button>
        <button className={btn} title="Redo (Ctrl+Y)" onClick={onRedo} disabled={!state.canRedo}><Redo2 size={17} /></button>
      </div>
    </div>
  );
}

/** One colour of a palette. Takes no focus, so a line being typed in keeps it. */
export function Swatch({ color, on, onPick }: { color: string; on: boolean; onPick: (c: string) => void }) {
  return (
    <button title={color} className="pdf-swatch" data-on={on || undefined} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(color)}>
      <span style={{ background: color }} />
    </button>
  );
}
