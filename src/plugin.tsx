// PDF — a viewer and editor for PDFs, as a Deck plugin.
//
// `opens` makes Deck hand this plugin every .pdf it is asked to open, each in a tab of its own
// showing `PaneView` with the file. The default export is the PDF tab from the + picker.
import Home from "./Home";
import { Viewer } from "./Viewer";
import { stopWorker } from "./pdfjs";

export default Home;

export const opens = [".pdf"];

/** A PDF in a pane; without one (picked from "open as pane"), the same page as the PDF tab. */
export function PaneView({ file }: { file?: string }) {
  return file ? <Viewer key={file} file={file} /> : <Home />;
}

// Defaults only; a rebinding in Settings > Keybindings wins. They hold while a PDF pane has focus.
export const keybindings = () => [
  { id: "save", title: "Save the PDF", defaultChord: "ctrl+s" },
  { id: "save-as", title: "Save the PDF as…", defaultChord: "ctrl+shift+s" },
  { id: "find", title: "Find in the PDF", defaultChord: "ctrl+f" },
  { id: "zoom-in", title: "Zoom in", defaultChord: "ctrl+=" },
  { id: "zoom-out", title: "Zoom out", defaultChord: "ctrl+-" },
  { id: "fit-width", title: "Fit the page width", defaultChord: "ctrl+0" },
  { id: "next-page", title: "Next page", defaultChord: "pagedown" },
  { id: "prev-page", title: "Previous page", defaultChord: "pageup" },
  { id: "undo", title: "Undo the last change", defaultChord: "ctrl+z" },
  { id: "redo", title: "Redo", defaultChord: "ctrl+y" },
];

export function dispose() { stopWorker(); }
