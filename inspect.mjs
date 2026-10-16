// What a PDF holds, read with pdf-lib: annotations per page, and form values. node inspect.mjs <file.pdf>
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "@pdfme/pdf-lib";
const doc = await PDFDocument.load(readFileSync(process.argv[2]));
const out = { pages: doc.getPageCount(), annots: {}, fields: {} };
doc.getPages().forEach((p, i) => {
  const a = p.node.Annots();
  if (!a) return;
  out.annots[i + 1] = a.asArray().map((r) => doc.context.lookup(r).get(PDFName.of("Subtype"))?.toString());
});
try { for (const f of doc.getForm().getFields()) out.fields[f.getName()] = f.constructor.name === "PDFTextField" ? f.getText() : f.constructor.name === "PDFCheckBox" ? f.isChecked() : "?"; } catch {}
console.log(JSON.stringify(out));
