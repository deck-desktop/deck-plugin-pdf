// Sample PDFs for trying the plugin: node make-samples.mjs <folder>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "@pdfme/pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const out = process.argv[2] ?? ".";
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
for (let i = 1; i <= 5; i++) {
  const p = doc.addPage([595, 842]);
  p.drawText(`Chapter ${i}`, { x: 60, y: 760, size: 28, font: bold, color: rgb(0.1, 0.1, 0.3) });
  for (let l = 0; l < 30; l++) p.drawText(`Line ${l + 1} of page ${i}: the quick brown fox jumps over the lazy dog.`, { x: 60, y: 720 - l * 20, size: 11, font });
}
writeFileSync(join(out, "text.pdf"), await doc.save());

const form = await PDFDocument.create();
const fp = form.addPage([595, 842]);
const f2 = await form.embedFont(StandardFonts.Helvetica);
fp.drawText("Application form", { x: 60, y: 770, size: 22, font: f2 });
fp.drawText("Name", { x: 60, y: 715, size: 12, font: f2 });
const name = form.getForm().createTextField("name"); name.addToPage(fp, { x: 140, y: 705, width: 300, height: 24 });
fp.drawText("Email", { x: 60, y: 675, size: 12, font: f2 });
const email = form.getForm().createTextField("email"); email.addToPage(fp, { x: 140, y: 665, width: 300, height: 24 });
fp.drawText("Subscribe", { x: 60, y: 635, size: 12, font: f2 });
const cb = form.getForm().createCheckBox("subscribe"); cb.addToPage(fp, { x: 140, y: 630, width: 18, height: 18 });
writeFileSync(join(out, "form.pdf"), await form.save());

const big = await PDFDocument.create();
const f3 = await big.embedFont(StandardFonts.TimesRoman);
for (let i = 1; i <= 200; i++) big.addPage([595, 842]).drawText(`Page ${i}`, { x: 250, y: 420, size: 36, font: f3 });
writeFileSync(join(out, "200 pages.pdf"), await big.save());
// Lines in different fonts, for Edit text keeping each one's format: standard fonts, and Georgia
// embedded whole, which can draw new text itself.
const mixed = await PDFDocument.create();
mixed.registerFontkit(fontkit);
const mp = mixed.addPage([595, 842]);
const lines = [
  ["Times bold heading", StandardFonts.TimesRomanBold, 24, rgb(0.1, 0.1, 0.3)],
  ["Courier for code: npm run dev", StandardFonts.Courier, 12, rgb(0, 0, 0)],
  ["Helvetica oblique, in red", StandardFonts.HelveticaOblique, 14, rgb(0.8, 0.1, 0.1)],
  ["Georgia italic, embedded whole", readFileSync("C:/Windows/Fonts/georgiai.ttf"), 16, rgb(0.1, 0.4, 0.2)],
];
let y = 760;
for (const [text, f, size, color] of lines) {
  const font = typeof f === "string" ? await mixed.embedFont(f) : await mixed.embedFont(f, { subset: false });
  mp.drawText(text, { x: 60, y, size, font, color });
  y -= 50;
}
writeFileSync(join(out, "fonts.pdf"), await mixed.save());
console.log("wrote text.pdf, form.pdf, 200 pages.pdf, fonts.pdf to", out);
