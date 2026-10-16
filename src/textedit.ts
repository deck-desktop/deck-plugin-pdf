// Replacing text that is part of a page, not an annotation over it, keeping its format.
//
// A PDF's text is drawn from its own fonts, so it is not retyped in place: the original is covered
// with its background colour and the new text drawn there, from the same baseline, at the same
// size and colour. In the same font, when the PDF embeds it and it has a glyph for every character
// typed; many PDFs embed only the letters they use, and then the nearest standard PDF font of the
// same kind (serif, sans or mono, bold, italic) is used. The preview on screen makes the same
// choice (resolve), so what shows before saving is what the file shows after. The style bar can
// change the font (another kind, or one the user imported), size, weight, slant and colour; an
// imported font with the original's name is used when the PDF's own copy cannot draw. The
// original glyphs stay in the file under the cover: this is not redaction.
import fontkit from "@pdf-lib/fontkit";
import type { ImportedFont } from "./fonts";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, StandardFonts, rgb, type PDFFont } from "@pdfme/pdf-lib";

export interface TextFormat {
  family: "sans" | "serif" | "mono";
  bold: boolean;
  italic: boolean;
  /** The PDF's own name for the font ("ABCDEF+Calibri-Bold"), "" when unknown. */
  baseFont: string;
}

/** How an edit's text is drawn, as the style bar sets it. */
export interface TextStyle {
  /** "original", a standard kind ("sans", "serif", "mono"), or an imported family's name. */
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
}

export interface TextEdit {
  /** 1-based page number. */
  page: number;
  /** The original text's box, to cover, in PDF units from the page's bottom left: [x, y, width, height]. */
  rect: [number, number, number, number];
  /** Where the original run's baseline starts, in PDF units. */
  origin: [number, number];
  before: string;
  after: string;
  /** Font size in PDF units. */
  size: number;
  /** "#rrggbb". */
  color: string;
  background: string;
  format: TextFormat;
  /**
   * The PDF's own program for the original's font, when it can draw text again; null otherwise.
   * Held on the edit so the preview and the save decide from the same bytes (ownFont).
   */
  program: Uint8Array | null;
  /** The CSS family the screen draws `program` with, "" without one. */
  face: string;
  /** What the edit draws with; starts as the original's format (originalStyle). */
  style: TextStyle;
}

export const STANDARD_KINDS = ["sans", "serif", "mono"] as const;

/** The style an edit starts with: the line's own. */
export const originalStyle = (e: Pick<TextEdit, "size" | "color" | "format">): TextStyle =>
  ({ font: "original", size: e.size, bold: e.format.bold, italic: e.format.italic, color: e.color });

/** Whether an edit changes anything, its text or its style. */
export function changed(e: TextEdit) {
  const o = originalStyle(e), s = e.style;
  return e.after !== e.before || s.font !== o.font || s.size !== o.size || s.bold !== o.bold || s.italic !== o.italic || s.color.toLowerCase() !== o.color.toLowerCase();
}

/** The format a font's flags and name describe. */
export function formatOf(font: { name?: string; bold?: boolean; italic?: boolean; fallbackName?: string } | undefined): TextFormat {
  const name = (font?.name ?? "").replace(/^\//, "");
  const n = name.toLowerCase();
  const family = /mono|courier|consol|menlo|code/.test(n) || font?.fallbackName === "monospace" ? "mono"
    : /times|georgia|garamond|cambria|serif|roman|book|minion|palatino/.test(n.replace(/sans.?serif/, "")) || font?.fallbackName === "serif" ? "serif"
    : "sans";
  return {
    family,
    bold: !!font?.bold || /bold|black|heavy|semibold|demi/.test(n),
    italic: !!font?.italic || /italic|oblique/.test(n),
    baseFont: name,
  };
}

/** The standard PDF font closest to a format. */
export function standardFor(f: TextFormat): StandardFonts {
  const S = StandardFonts;
  if (f.family === "serif") return f.bold ? (f.italic ? S.TimesRomanBoldItalic : S.TimesRomanBold) : f.italic ? S.TimesRomanItalic : S.TimesRoman;
  if (f.family === "mono") return f.bold ? (f.italic ? S.CourierBoldOblique : S.CourierBold) : f.italic ? S.CourierOblique : S.Courier;
  return f.bold ? (f.italic ? S.HelveticaBoldOblique : S.HelveticaBold) : f.italic ? S.HelveticaOblique : S.Helvetica;
}

/** How the screen draws a standard font: Windows' metric-compatible ones. */
export function cssFor(f: TextFormat): string {
  if (f.family === "serif") return '"Times New Roman", Times, "Liberation Serif", serif';
  if (f.family === "mono") return '"Courier New", Courier, "Liberation Mono", monospace';
  return 'Helvetica, Arial, "Liberation Sans", sans-serif';
}

const stripSubset = (n: string) => n.replace(/^[A-Z]{6}\+/, "");

/**
 * The font program the PDF embeds for `baseFont` on a page, when it is one a font can be made
 * from again (TrueType or OpenType). A bare CFF or Type 1 program is not, and gives null.
 */
export function fontProgram(doc: PDFDocument, pageIndex: number, baseFont: string): Uint8Array | null {
  if (!baseFont) return null;
  const fonts = doc.getPage(pageIndex).node.Resources()?.lookupMaybe(PDFName.of("Font"), PDFDict);
  if (!fonts) return null;
  for (const [, ref] of fonts.entries()) {
    const font = doc.context.lookupMaybe(ref, PDFDict);
    const name = font?.lookupMaybe(PDFName.of("BaseFont"), PDFName)?.decodeText() ?? "";
    if (!font || (name !== baseFont && stripSubset(name) !== stripSubset(baseFont))) continue;
    // A composite font keeps its descriptor on its one descendant.
    const desc = font.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
    const holder = desc ? doc.context.lookupMaybe(desc.get(0), PDFDict) : font;
    const fd = holder?.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
    const file2 = fd?.lookupMaybe(PDFName.of("FontFile2"), PDFStream);
    const file3 = fd?.lookupMaybe(PDFName.of("FontFile3"), PDFStream);
    const stream = file2 ?? (file3?.dict.lookupMaybe(PDFName.of("Subtype"), PDFName)?.decodeText() === "OpenType" ? file3 : undefined);
    if (!(stream instanceof PDFRawStream)) return null;
    try { return decodePDFRawStream(stream).decode(); } catch { return null; }
  }
  return null;
}

interface Fontkit { hasGlyphForCodePoint(cp: number): boolean; post?: unknown; head?: unknown; hhea?: unknown }
const parsed = new WeakMap<Uint8Array, Fontkit | null>();
const parse = (program: Uint8Array) => {
  if (!parsed.has(program)) {
    let f: Fontkit | null = null;
    try { f = fontkit.create(program as unknown as Parameters<typeof fontkit.create>[0]) as unknown as Fontkit; } catch { /* not a font fontkit reads */ }
    parsed.set(program, f);
  }
  return parsed.get(program)!;
};

/**
 * Whether a font program can be embedded again: pdf-lib reads its post, head and hhea tables,
 * which a subset in a PDF may have left out.
 */
export const embeddable = (program: Uint8Array) => {
  const f = parse(program);
  return !!f && !!f.post && !!f.head && !!f.hhea;
};

/** Whether a font program has a glyph for every character of `text`. */
export function covers(program: Uint8Array, text: string): boolean {
  const f = parse(program);
  if (!f) return false;
  for (const ch of text) if (!f.hasGlyphForCodePoint(ch.codePointAt(0)!)) return false;
  return true;
}

/** Characters a standard PDF font can draw: WinAnsi, roughly Latin-1 and some punctuation. */
const WIN_ANSI = /^[\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/;

const squash = (s: string) => s.replace(/^[A-Z]{6}\+/, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** The imported font a PDF's font is: the same PostScript name, or its family's face in that style. */
export function matchImported(baseFont: string, bold: boolean, italic: boolean, list: ImportedFont[]): ImportedFont | undefined {
  const name = squash(baseFont);
  if (!name) return undefined;
  return list.find((f) => squash(f.postscript) === name)
    ?? list.find((f) => name.startsWith(squash(f.family)) && f.bold === bold && f.italic === italic);
}

/** A family's face nearest a style: the exact one, else the same weight, else any. */
export function faceOf(family: string, bold: boolean, italic: boolean, list: ImportedFont[]): ImportedFont | undefined {
  const all = list.filter((f) => f.family === family);
  return all.find((f) => f.bold === bold && f.italic === italic) ?? all.find((f) => f.bold === bold) ?? all[0];
}

/** What an edit is drawn with, and why when it is not what was asked for. */
export type Resolved = (
  | { program: Uint8Array; face: string }
  | { standard: StandardFonts; css: { fontFamily: string; fontWeight: number; fontStyle: string } }
) & {
  /** Set when the font asked for could not be used: the PDF's copy cannot draw, or it lacks a character. */
  fellBack?: "not-reusable" | "missing-characters";
  /** Set when even the standard font cannot draw the text (it is outside WinAnsi): saving would fail. */
  cannotDraw?: boolean;
};

/**
 * The font an edit draws with, decided the same way for the screen and the file: the font asked
 * for when it has every character, else the standard font of the same kind and style.
 */
export function resolve(e: TextEdit, fonts: ImportedFont[]): Resolved {
  const s = e.style;
  const sameStyle = s.bold === e.format.bold && s.italic === e.format.italic;
  let picked: { program: Uint8Array; face: string } | undefined;
  let fellBack: Resolved["fellBack"];
  if (s.font === "original") {
    if (sameStyle && e.program) picked = { program: e.program, face: e.face };
    else picked = matchImported(e.format.baseFont, s.bold, s.italic, fonts);
    if (!picked && sameStyle) fellBack = "not-reusable";
  } else if (!(STANDARD_KINDS as readonly string[]).includes(s.font)) {
    picked = faceOf(s.font, s.bold, s.italic, fonts);
  }
  if (picked && covers(picked.program, e.after)) return { program: picked.program, face: picked.face };
  if (picked) fellBack = "missing-characters";
  const family = (STANDARD_KINDS as readonly string[]).includes(s.font) ? (s.font as TextFormat["family"]) : e.format.family;
  const f: TextFormat = { family, bold: s.bold, italic: s.italic, baseFont: "" };
  return {
    standard: standardFor(f),
    css: { fontFamily: cssFor(f), fontWeight: s.bold ? 700 : 400, fontStyle: s.italic ? "italic" : "normal" },
    fellBack, cannotDraw: !WIN_ANSI.test(e.after),
  };
}

const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** The document `bytes` with every edit painted in. */
export async function applyTextEdits(bytes: Uint8Array, edits: TextEdit[], fonts: ImportedFont[] = []): Promise<Uint8Array> {
  if (!edits.length) return bytes;
  const doc = await PDFDocument.load(bytes);
  doc.registerFontkit(fontkit);
  const made = new Map<unknown, Promise<PDFFont>>();
  const fontFor = (r: Resolved) => {
    const key = "program" in r ? r.program : r.standard;
    if (!made.has(key)) made.set(key, "program" in r ? doc.embedFont(r.program, { subset: true }) : doc.embedFont(r.standard));
    return made.get(key)!;
  };
  for (const e of edits) {
    const page = doc.getPage(e.page - 1);
    const [x, y, w, h] = e.rect;
    // One unit bigger each way than the original's box, which ends at its glyphs' edges.
    page.drawRectangle({ x: x - 1, y: y - 1, width: w + 2, height: h + 2, color: hex(e.background) });
    if (e.after) page.drawText(e.after, { x: e.origin[0], y: e.origin[1], size: e.style.size, font: await fontFor(resolve(e, fonts)), color: hex(e.style.color) });
  }
  return doc.save();
}

/** "#rrggbb" of an RGBA pixel. */
export const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");

/**
 * The text and background colours of a box on a rendered page: the background is the most common
 * colour around the box's edge, the text the pixel inside it furthest from that.
 */
export function sampleColors(data: Uint8ClampedArray, width: number, box: { x: number; y: number; w: number; h: number }): { color: string; background: string } {
  const at = (x: number, y: number) => {
    const i = (Math.max(0, Math.round(y)) * width + Math.max(0, Math.round(x))) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const counts = new Map<string, { n: number; px: readonly number[] }>();
  for (let i = 0; i <= 20; i++) {
    for (const [x, y] of [[box.x - 2, box.y + (box.h * i) / 20], [box.x + (box.w * i) / 20, box.y - 2], [box.x + (box.w * i) / 20, box.y + box.h + 2]]) {
      const px = at(x, y);
      const k = px.join(",");
      counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, px });
    }
  }
  const bg = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.px ?? [255, 255, 255];
  let best = bg, far = -1;
  for (let y = box.y; y < box.y + box.h; y += Math.max(1, box.h / 12)) {
    for (let x = box.x; x < box.x + box.w; x += Math.max(1, box.w / 60)) {
      const px = at(x, y);
      const d = (px[0] - bg[0]) ** 2 + (px[1] - bg[1]) ** 2 + (px[2] - bg[2]) ** 2;
      if (d > far) { far = d; best = px; }
    }
  }
  return { background: toHex(bg[0], bg[1], bg[2]), color: toHex(best[0], best[1], best[2]) };
}
