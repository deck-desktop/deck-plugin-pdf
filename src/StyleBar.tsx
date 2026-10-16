// The style of the line being retyped, above the tool dock: font (the original, a standard kind, or
// one imported), size, bold, italic and colour. It changes the edit's style; resolve
// (textedit.ts) turns that into the font the screen and the saved file both draw with.
import { useState } from "react";
import { Bold, Check, ChevronDown, FilePlus2, Italic, Minus, Plus } from "lucide-react";
import { ContextMenu, type MenuEntry } from "deck-plugin-sdk/ui";
import { COLORS, PANEL, SEP, Swatch } from "./EditBar";
import type { ImportedFont } from "./fonts";
import { originalStyle, resolve, type TextEdit, type TextStyle } from "./textedit";

const KIND_NAMES: Record<string, string> = { sans: "Sans (Helvetica)", serif: "Serif (Times)", mono: "Mono (Courier)" };
const stripSubset = (n: string) => n.replace(/^[A-Z]{6}\+/, "");
/** Buttons that leave the cursor in the line being typed. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

export function StyleBar({ edit, fonts, onStyle, onImport }: {
  edit: TextEdit;
  fonts: ImportedFont[];
  onStyle: (patch: Partial<TextStyle>) => void;
  onImport: () => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const s = edit.style;
  const original = originalStyle(edit);
  const r = resolve(edit, fonts);
  const families = [...new Set(fonts.map((f) => f.family))];
  const originalName = stripSubset(edit.format.baseFont) || "the line's font";
  const label = s.font === "original" ? `Original: ${originalName}` : KIND_NAMES[s.font] ?? s.font;
  const pick = (font: string): MenuEntry => ({ label: font === "original" ? `Original: ${originalName}` : KIND_NAMES[font] ?? font, icon: s.font === font ? Check : undefined, onClick: () => onStyle({ font }) });
  const items: MenuEntry[] = [
    pick("original"), "sep", pick("sans"), pick("serif"), pick("mono"),
    ...(families.length ? ["sep" as const, ...families.map(pick)] : []),
    "sep", { label: "Import a font…", subLabel: ".ttf or .otf, kept for next time", icon: FilePlus2, onClick: onImport },
  ];
  // An imported family has only the faces imported: bold or italic is offered when one has it.
  const faces = fonts.filter((f) => f.family === s.font);
  const shown = faces.length && "program" in r ? faces.find((f) => f.face === r.face) : undefined;
  const bold = shown ? shown.bold : s.bold, italic = shown ? shown.italic : s.italic;
  const noFace = (k: "bold" | "italic") => !!faces.length && !faces.some((f) => f[k] !== (k === "bold" ? bold : italic));
  const size = (n: number) => onStyle({ size: Math.max(1, Math.min(400, Math.round(n * 2) / 2)) });

  const warning = r.cannotDraw ? "The standard fonts cannot draw some of these characters: pick or import a font that has them."
    : r.fellBack === "not-reusable" ? `This PDF's copy of ${originalName} cannot draw new text, so a standard font stands in. Import ${originalName.split(/[-,]/)[0]} to use it.`
    : r.fellBack === "missing-characters" ? "That font has no glyph for some of these characters, so a standard font stands in."
    : "";

  return (
    <div data-pdf-style className="flex flex-col items-center gap-1">
      {warning && (
        <div className={PANEL}>
          <span className="pdf-warn">{warning}</span>
          {r.fellBack === "not-reusable" && <button className="pdf-chip" onMouseDown={keepFocus} onClick={onImport}>Import…</button>}
        </div>
      )}
      <div className={PANEL}>
        <button className="pdf-chip" title="Font" onMouseDown={keepFocus} style={{ maxWidth: 240 }}
          onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); setMenu({ x: b.left, y: b.top - 4 }); }}>
          <span className="flex items-center gap-1"><span className="truncate">{label}</span><ChevronDown size={13} /></span>
        </button>
        {SEP}
        <button className="pdf-chip" title="Smaller" onMouseDown={keepFocus} onClick={() => size(s.size - 1)}><Minus size={13} /></button>
        <input className="pdf-size" value={s.size} title="Size, in points"
          onChange={(e) => { const n = Number(e.target.value); if (n > 0) size(n); }} />
        <button className="pdf-chip" title="Larger" onMouseDown={keepFocus} onClick={() => size(s.size + 1)}><Plus size={13} /></button>
        {SEP}
        <button className="pdf-chip" title={noFace("bold") ? `No ${bold ? "regular" : "bold"} ${s.font} imported` : "Bold"} disabled={noFace("bold")}
          data-on={bold || undefined} onMouseDown={keepFocus} onClick={() => onStyle({ bold: !bold, italic })}><Bold size={14} /></button>
        <button className="pdf-chip" title={noFace("italic") ? `No ${italic ? "upright" : "italic"} ${s.font} imported` : "Italic"} disabled={noFace("italic")}
          data-on={italic || undefined} onMouseDown={keepFocus} onClick={() => onStyle({ italic: !italic, bold })}><Italic size={14} /></button>
        {SEP}
        {[original.color, ...COLORS.filter((c) => c.toLowerCase() !== original.color.toLowerCase())].map((c) => (
          <Swatch key={c} color={c} on={s.color.toLowerCase() === c.toLowerCase()} onPick={(color) => onStyle({ color })} />
        ))}
        <label className="pdf-swatch pdf-custom-color" title="Another colour">
          <input type="color" value={s.color} onChange={(e) => onStyle({ color: e.target.value })} />
        </label>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} up items={items} onClose={() => setMenu(null)} />}
    </div>
  );
}
