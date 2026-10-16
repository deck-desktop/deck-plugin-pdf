// One undo history for everything done to a PDF: PDF.js's annotation editors keep their own
// stack, and retyped text is ours, so each change is recorded here in the order it was made, and
// undoing walks back through both. A PDF.js step only marks where its stack moved: undoing it
// calls PDF.js's own undo.
export type Step<T> = { kind: "pdfjs"; type: number } | { kind: "text"; before: T; after: T };

export class History<T> {
  done: Step<T>[] = [];
  undone: Step<T>[] = [];

  /**
   * PDF.js recorded a command. One it overwrites in place (a drag continuing, typing in a text
   * box) replaces its own last command rather than adding one, so it adds no step here either.
   */
  pdfjs(type: number, overwriteIfSameType = false) {
    const last = [...this.done].reverse().find((s) => s.kind === "pdfjs");
    if (overwriteIfSameType && last?.kind === "pdfjs" && last.type === type) return;
    this.done.push({ kind: "pdfjs", type });
    this.undone = [];
  }

  /** The retyped text went from `before` to `after`. */
  text(before: T, after: T) {
    this.done.push({ kind: "text", before, after });
    this.undone = [];
  }

  undo() {
    const s = this.done.pop();
    if (s) this.undone.push(s);
    return s;
  }

  redo() {
    const s = this.undone.pop();
    if (s) this.done.push(s);
    return s;
  }

  clear() { this.done = []; this.undone = []; }
}
