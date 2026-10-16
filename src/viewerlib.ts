// PDF.js's viewer reads the library from `globalThis.pdfjsLib` the moment it loads, so the library
// is imported here, ahead of it: imported for its effect, before pdf_viewer.mjs in Viewer.tsx.
import "./pdfjs";
