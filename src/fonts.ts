// Fonts the user imported for Edit text: copied into the plugin's data folder, so they stay
// usable when the original file moves, and loaded once for the screen. The folder is the list:
// every .ttf or .otf in it is a font.
import { useSyncExternalStore } from "react";
import fontkit from "@pdf-lib/fontkit";
import { dataDir, fsCreateDir, fsList, fsReadBytes, fsWriteBytes, pickAnyFile } from "deck-plugin-sdk/bridge";

export interface ImportedFont {
  /** The family a menu lists it under ("Calibri"). */
  family: string;
  /** Its own name ("Calibri-Bold"), matched against a PDF's font names. */
  postscript: string;
  bold: boolean;
  italic: boolean;
  program: Uint8Array;
  /** The CSS family the screen draws it with. */
  face: string;
}

const FONT_FILE = /\.(ttf|otf)$/i;
let fonts: ImportedFont[] = [];
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
let faces = 0;

/** A font's description, or null when the file is not one fontkit (and so pdf-lib) can read. */
async function describe(program: Uint8Array): Promise<ImportedFont | null> {
  let f: { familyName?: string; postscriptName?: string; subfamilyName?: string; head?: { macStyle?: { bold?: boolean; italic?: boolean } } };
  try { f = fontkit.create(program as unknown as Parameters<typeof fontkit.create>[0]) as typeof f; } catch { return null; }
  if (!f.familyName) return null;
  const sub = f.subfamilyName ?? "";
  const face = new FontFace(`pdf-font-${++faces}`, program as Uint8Array<ArrayBuffer>);
  try { document.fonts.add(await face.load()); } catch { return null; }
  return {
    family: f.familyName,
    postscript: f.postscriptName ?? f.familyName,
    bold: !!f.head?.macStyle?.bold || /bold|black|heavy/i.test(sub),
    italic: !!f.head?.macStyle?.italic || /italic|oblique/i.test(sub),
    program,
    face: face.family,
  };
}

async function load() {
  const dir = await dataDir();
  const files = (await fsList(dir).catch(() => [])).filter((e) => !e.dir && FONT_FILE.test(e.name));
  const read = await Promise.all(files.map((e) => fsReadBytes(e.path).then(describe).catch((err) => {
    console.warn("[pdf] reading an imported font failed", e.path, err);
    return null;
  })));
  fonts = read.filter((f): f is ImportedFont => !!f).sort((a, b) => a.family.localeCompare(b.family));
  emit();
}

/** The imported fonts, loading them the first time. */
export function useFonts(): ImportedFont[] {
  loading ??= load();
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => fonts);
}
export const importedFonts = () => fonts;

/** Ask for a font file and keep a copy. Gives the family imported, "" when cancelled or refused. */
export async function importFont(): Promise<{ family: string; error?: string }> {
  const path = await pickAnyFile();
  if (!path) return { family: "" };
  if (!FONT_FILE.test(path)) return { family: "", error: "Pick a TrueType or OpenType font: a .ttf or .otf file." };
  const program = await fsReadBytes(path);
  const font = await describe(program);
  if (!font) return { family: "", error: "That file is not a font this can use." };
  const dir = await dataDir();
  const name = path.split(/[\\/]/).pop()!;
  const to = `${dir}\\${name}`;
  // The data folder exists once the plugin has saved anything; made here otherwise.
  await fsWriteBytes(to, program).catch(async () => {
    const parent = dir.replace(/[\\/][^\\/]+$/, "");
    await fsCreateDir(parent, dir.slice(parent.length + 1));
    await fsWriteBytes(to, program);
  });
  await load();
  return { family: font.family };
}
