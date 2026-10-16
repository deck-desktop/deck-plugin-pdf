// PDF.js, set up for a plugin that is one file.
//
// PDF.js normally loads its worker, its font data and its image decoders from files beside it.
// A plugin is installed as plugin.json and plugin.js only, so all three ride inside the bundle:
// the worker as text, started from a Blob URL; the rest as base64, decoded when a PDF asks for
// one (most never do), and handed over through a BinaryDataFactory instead of fetch.
import * as pdfjsLib from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?raw";
import openjpeg from "pdfjs-dist/wasm/openjpeg.wasm?base64";
import jbig2 from "pdfjs-dist/wasm/jbig2.wasm?base64";
import qcms from "pdfjs-dist/wasm/qcms_bg.wasm?base64";
import FoxitDingbats from "pdfjs-dist/standard_fonts/FoxitDingbats.pfb?base64";
import FoxitFixed from "pdfjs-dist/standard_fonts/FoxitFixed.pfb?base64";
import FoxitFixedBold from "pdfjs-dist/standard_fonts/FoxitFixedBold.pfb?base64";
import FoxitFixedBoldItalic from "pdfjs-dist/standard_fonts/FoxitFixedBoldItalic.pfb?base64";
import FoxitFixedItalic from "pdfjs-dist/standard_fonts/FoxitFixedItalic.pfb?base64";
import FoxitSerif from "pdfjs-dist/standard_fonts/FoxitSerif.pfb?base64";
import FoxitSerifBold from "pdfjs-dist/standard_fonts/FoxitSerifBold.pfb?base64";
import FoxitSerifBoldItalic from "pdfjs-dist/standard_fonts/FoxitSerifBoldItalic.pfb?base64";
import FoxitSerifItalic from "pdfjs-dist/standard_fonts/FoxitSerifItalic.pfb?base64";
import FoxitSymbol from "pdfjs-dist/standard_fonts/FoxitSymbol.pfb?base64";
import LiberationSansBold from "pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?base64";
import LiberationSansBoldItalic from "pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf?base64";
import LiberationSansItalic from "pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf?base64";
import LiberationSansRegular from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?base64";

export { pdfjsLib };

/** The files PDF.js may ask for, by the `kind` and `filename` it asks with. */
const DATA: Record<string, Record<string, string>> = {
  wasmUrl: { "openjpeg.wasm": openjpeg, "jbig2.wasm": jbig2, "qcms_bg.wasm": qcms },
  standardFontDataUrl: {
    "FoxitDingbats.pfb": FoxitDingbats, "FoxitFixed.pfb": FoxitFixed, "FoxitFixedBold.pfb": FoxitFixedBold,
    "FoxitFixedBoldItalic.pfb": FoxitFixedBoldItalic, "FoxitFixedItalic.pfb": FoxitFixedItalic,
    "FoxitSerif.pfb": FoxitSerif, "FoxitSerifBold.pfb": FoxitSerifBold, "FoxitSerifBoldItalic.pfb": FoxitSerifBoldItalic,
    "FoxitSerifItalic.pfb": FoxitSerifItalic, "FoxitSymbol.pfb": FoxitSymbol,
    "LiberationSans-Bold.ttf": LiberationSansBold, "LiberationSans-BoldItalic.ttf": LiberationSansBoldItalic,
    "LiberationSans-Italic.ttf": LiberationSansItalic, "LiberationSans-Regular.ttf": LiberationSansRegular,
  },
};

const decode = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** What PDF.js calls instead of fetching a file beside it. */
class BundledData {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const b64 = DATA[kind]?.[filename];
    // A CJK font map (cMapUrl) is the one kind not bundled: about 1.5MB for PDFs whose fonts do
    // not embed it. PDF.js then falls back to its built-in mapping, and such text may look wrong.
    if (!b64) throw new Error(`PDF.js asked for ${kind} ${filename}, which this plugin does not bundle`);
    return decode(b64);
  }
}

let worker: Worker | null = null;
let workerUrl = "";

/** The one worker every document uses, started on first need. */
function ensureWorker() {
  if (worker) return;
  workerUrl = URL.createObjectURL(new Blob([workerSrc], { type: "text/javascript" }));
  worker = new Worker(workerUrl, { type: "module" });
  pdfjsLib.GlobalWorkerOptions.workerPort = worker;
}

/** Stop the worker; the next document starts a new one. For the plugin's dispose. */
export function stopWorker() {
  worker?.terminate();
  worker = null;
  if (workerUrl) URL.revokeObjectURL(workerUrl);
  workerUrl = "";
  pdfjsLib.GlobalWorkerOptions.workerPort = null;
}

/** Open a PDF from its bytes. */
export function loadDocument(data: Uint8Array) {
  ensureWorker();
  return pdfjsLib.getDocument({
    data,
    BinaryDataFactory: BundledData,
    useWorkerFetch: false,
    // Only so PDF.js knows it may ask: BundledData answers, nothing is fetched from here.
    wasmUrl: "bundled:/",
    standardFontDataUrl: "bundled:/",
    useSystemFonts: true,
    enableXfa: true,
    // Fonts keep their PDF names, so Edit text can find the font a line was set in.
    fontExtraProperties: true,
  });
}
