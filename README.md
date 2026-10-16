# PDF for Deck

View, annotate and edit PDFs in Deck. A PDF opens in its own tab wherever you open a file: the
Editor's file tree, Quick Open (Ctrl+P), Ctrl+click on a path in a terminal, or Windows' "Open
with". The plugin's own tab opens one too, with a list of recent files.

## Reading

- Every page, with selectable text and working links, and a page list down the side.
- Find (Ctrl+F) with the number of matches; Enter for the next, Shift+Enter for the previous.
- Zoom with the buttons, Ctrl+= and Ctrl+-, a set size, fit width (Ctrl+0) or fit the page.
- Page Up and Page Down move a page; the page box goes straight to one.

## Marking it up

The tools sit in a dock at the bottom of the page:

- **Highlight** text, **Add text** in a box, **Draw**, and **Add an image**, each with its colour
  and size. They are real PDF annotations, so other viewers show them.
- **Edit the page's text**: click a line of the page and type over it. The line keeps its format:
  its font when the PDF carries one that can draw the new text, otherwise the nearest standard one,
  and its size, position and colour. A style bar changes the font (the original, sans, serif, mono,
  or one you import as a .ttf or .otf, kept for next time), the size, bold, italic and colour.
- **Forms**: type into a PDF's fields and tick its boxes.
- Undo and redo (Ctrl+Z, Ctrl+Y) cover all of it, in the order it was done.

Save (Ctrl+S) writes everything into the file; Save as (Ctrl+Shift+S) writes a copy.

## Worth knowing

- Editing a line covers the old text and draws the new text over it. The old text is still in the
  file underneath, so this is not a way to remove something for good (redaction).
- Text in a language whose characters neither the PDF's fonts nor the standard ones have (Chinese,
  Arabic, ...) cannot be typed until you import a font that has them.
- Signing and rearranging pages are not here yet.

Needs Deck 1.5.0 or later.

## Developing

```sh
npm run dev            # rebuild as you edit; each save shows in your test Deck
npm run install-local  # when it is done: install it into your real Deck
npm test               # the text-editing checks
```
