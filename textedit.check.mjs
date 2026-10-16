// Edit text keeps the line's format: node textedit.check.mjs
// Imports the real src/textedit.ts (Node strips its types), so the check fails when the source changes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName, PDFDict, StandardFonts } from "@pdfme/pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { applyTextEdits, changed, covers, embeddable, fontProgram, formatOf, matchImported, originalStyle, resolve, standardFor } from "./src/textedit.ts";

// A font's name says its kind; PDF.js's flags and fallback add what the name does not.
assert.deepEqual(formatOf({ name: "Times-Bold" }), { family: "serif", bold: true, italic: false, baseFont: "Times-Bold" });
assert.equal(formatOf({ name: "ABCDEF+Courier-Oblique" }).family, "mono");
assert.equal(formatOf({ name: "ABCDEF+Courier-Oblique" }).italic, true);
assert.equal(formatOf({ name: "MicrosoftSansSerif" }).family, "sans");
assert.equal(formatOf({ name: "ABCDEF+Calibri", bold: true }).bold, true);
assert.equal(formatOf({ name: "Foo", fallbackName: "serif" }).family, "serif");
assert.equal(standardFor(formatOf({ name: "Georgia-BoldItalic" })), StandardFonts.TimesRomanBoldItalic);
assert.equal(standardFor(formatOf({ name: "Arial-ItalicMT" })), StandardFonts.HelveticaOblique);
assert.equal(standardFor(formatOf(undefined)), StandardFonts.Helvetica);

// A PDF that embeds Georgia whole gives its program back, and it can draw new text.
const ttf = readFileSync("C:/Windows/Fonts/georgia.ttf");
const src = await PDFDocument.create();
src.registerFontkit(fontkit);
const georgia = await src.embedFont(ttf, { subset: false });
src.addPage([300, 200]).drawText("Hello there", { x: 20, y: 100, size: 14, font: georgia });
const loaded = await PDFDocument.load(await src.save());
// The BaseFont as the PDF writes it, which is the name PDF.js reports ("Georgia-1234" here).
const baseFont = (() => {
  const res = loaded.getPage(0).node.Resources().lookup(PDFName.of("Font"), PDFDict);
  return loaded.context.lookup(res.entries()[0][1], PDFDict).lookup(PDFName.of("BaseFont")).decodeText();
})();
const program = fontProgram(loaded, 0, baseFont);
assert.ok(fontProgram(loaded, 0, "ABCDEF+" + baseFont), "a subset tag on either side still matches");
assert.ok(program, "the embedded program is found by its BaseFont");
assert.ok(embeddable(program));
assert.ok(covers(program, "Changed text"));
assert.ok(!covers(program, "中文"), "Georgia has no CJK");
assert.equal(fontProgram(loaded, 0, "NotThere"), null);

// Saving draws in the original font when it covers the text, the standard one otherwise.
const edit = (after, own, style = {}) => {
  const e = {
    page: 1, rect: [20, 96, 80, 14], origin: [20, 100], before: "Hello there", after, size: 14, color: "#000000", background: "#ffffff",
    format: formatOf({ name: baseFont }), program: own ? program : null, face: own ? "f" : "",
  };
  return { ...e, style: { ...originalStyle(e), ...style } };
};
assert.ok("program" in resolve(edit("New", true), []));
assert.equal(resolve(edit("New", false), []).fellBack, "not-reusable", "no reusable copy: a stand-in, and the bar says so");
assert.equal(resolve(edit("中文", true), []).fellBack, "missing-characters");
assert.ok(resolve(edit("中文", true), []).cannotDraw, "the standard fonts cannot draw CJK either");
assert.ok(!changed(edit("Hello there", true)));
assert.ok(changed(edit("Hello there", true, { size: 20 })), "a style change alone is an edit");
// Bold on a font with one face: its kind's standard bold.
const bold = resolve(edit("New", true, { bold: true }), []);
assert.equal(bold.standard, StandardFonts.TimesRomanBold);
// An imported font: by name for the original, by family when picked.
const imported = [
  { family: "Georgia", postscript: "Georgia-Italic", bold: false, italic: true, program, face: "imp-1" },
  { family: "Georgia", postscript: "Georgia", bold: false, italic: false, program, face: "imp-2" },
];
assert.equal(resolve(edit("New", false), imported).face, "imp-2", "the original's name finds the imported copy");
assert.equal(resolve(edit("New", false, { font: "Georgia", italic: true }), imported).face, "imp-1");
assert.equal(resolve(edit("New", true, { font: "mono" }), imported).standard, StandardFonts.Courier);
assert.equal(matchImported("ABCDEF+Georgia-Italic", false, true, imported)?.face, "imp-1");
const fontsOf = async (bytes) => {
  const d = await PDFDocument.load(bytes);
  const res = d.getPage(0).node.Resources().lookup(PDFName.of("Font"), PDFDict);
  return res.entries().map(([, ref]) => d.context.lookup(ref, PDFDict).lookup(PDFName.of("BaseFont")).decodeText());
};
const base = await src.save();
const own = await fontsOf(await applyTextEdits(base, [edit("Changed", true)]));
assert.equal(own.filter((n) => n.includes("Georgia")).length, 2, `a second Georgia is embedded for the new text: ${own}`);
const std = await fontsOf(await applyTextEdits(base, [edit("Changed", false)]));
assert.ok(std.includes("Times-Roman"), `Georgia's kind without its program is Times: ${std}`);
const viaImport = await fontsOf(await applyTextEdits(base, [edit("Changed", false)], imported));
assert.equal(viaImport.filter((n) => n.includes("Georgia")).length, 2, `the imported Georgia is embedded: ${viaImport}`);
console.log("textedit: ok");
