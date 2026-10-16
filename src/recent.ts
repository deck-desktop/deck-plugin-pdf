// The PDFs opened lately, for the PDF tab's list, and Open… itself.
import { useSyncExternalStore } from "react";
import { configRead, configWrite, pickFile } from "deck-plugin-sdk/bridge";
import { openFile } from "deck-plugin-sdk/terminals";

const NAME = "recent";
const MAX = 20;

let list: string[] = [];
let lastText = "";
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

const loaded = configRead(NAME).then((raw) => {
  lastText = raw;
  const v = raw.trim() ? JSON.parse(raw) : [];
  list = Array.isArray(v) ? v.filter((p): p is string => typeof p === "string") : [];
  emit();
}).catch((e) => console.warn("[pdf] recent files did not load", e));

/** Put `path` first in the list; written only when the list changed. */
export async function rememberRecent(path: string) {
  await loaded;
  const key = path.toLowerCase();
  const next = [path, ...list.filter((p) => p.toLowerCase() !== key)].slice(0, MAX);
  const text = JSON.stringify(next);
  if (text === lastText) return;
  list = next;
  lastText = text;
  emit();
  await configWrite(NAME, text).catch((e) => console.warn("[pdf] saving recent files failed", e));
}

/** Drop a path that is not there any more. */
export async function forgetRecent(path: string) {
  await loaded;
  list = list.filter((p) => p !== path);
  lastText = JSON.stringify(list);
  emit();
  await configWrite(NAME, lastText).catch((e) => console.warn("[pdf] saving recent files failed", e));
}

export function useRecent(): string[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => list);
}

/** Pick a PDF and open it the way Deck opens one: in this plugin, as a tab of its own. */
export async function pickAndOpen() {
  const path = await pickFile("pdf");
  if (path) openFile(path);
}
