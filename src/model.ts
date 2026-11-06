export const COLORS = [
  "yellow",
  "mint",
  "blue",
  "lavender",
  "rose",
  "gray",
] as const;
export type NoteColor = (typeof COLORS)[number];
export type Language = "en" | "pt-BR";
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Note {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  fontSize: number;
  pinned: boolean;
  hidden: boolean;
  trashedAt: string | null;
  updatedAt: string;
  bounds: Bounds;
}
export interface Notebook {
  version: 1;
  language: Language;
  notes: Note[];
}
export type NotePatch = Pick<
  Note,
  "title" | "body" | "color" | "fontSize" | "pinned"
>;
export function validatePatch(value: unknown): NotePatch {
  if (!value || typeof value !== "object") throw new Error("Invalid note");
  const data = value as Record<string, unknown>;
  if (
    typeof data.title !== "string" ||
    data.title.length > 120 ||
    typeof data.body !== "string" ||
    data.body.length > 100000 ||
    !COLORS.includes(data.color as NoteColor) ||
    !Number.isInteger(data.fontSize) ||
    Number(data.fontSize) < 12 ||
    Number(data.fontSize) > 28 ||
    typeof data.pinned !== "boolean"
  )
    throw new Error("Invalid note content");
  return {
    title: data.title,
    body: data.body,
    color: data.color as NoteColor,
    fontSize: data.fontSize as number,
    pinned: data.pinned,
  };
}
export function validateBounds(value: unknown): Bounds {
  if (!value || typeof value !== "object") throw new Error("Invalid bounds");
  const data = value as Record<string, unknown>;
  if (
    ["x", "y", "width", "height"].some(
      (key) =>
        !Number.isInteger(data[key]) || Math.abs(Number(data[key])) > 100000,
    ) ||
    Number(data.width) < 260 ||
    Number(data.width) > 1200 ||
    Number(data.height) < 220 ||
    Number(data.height) > 1600
  )
    throw new Error("Invalid bounds");
  return {
    x: data.x as number,
    y: data.y as number,
    width: data.width as number,
    height: data.height as number,
  };
}
export function validateNotebook(value: unknown): Notebook {
  if (!value || typeof value !== "object") throw new Error("Invalid notebook");
  const data = value as Record<string, unknown>;
  if (
    data.version !== 1 ||
    !["en", "pt-BR"].includes(String(data.language)) ||
    !Array.isArray(data.notes) ||
    data.notes.length > 1000
  )
    throw new Error("Invalid notebook schema");
  const ids = new Set<string>();
  const notes = data.notes.map((item: unknown): Note => {
    if (!item || typeof item !== "object") throw new Error("Invalid note");
    const note = item as Record<string, unknown>;
    if (
      typeof note.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(note.id) ||
      ids.has(note.id) ||
      typeof note.hidden !== "boolean" ||
      typeof note.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(note.updatedAt)) ||
      !(
        note.trashedAt === null ||
        (typeof note.trashedAt === "string" &&
          Number.isFinite(Date.parse(note.trashedAt)))
      )
    )
      throw new Error("Invalid note metadata");
    ids.add(note.id);
    return {
      ...validatePatch(note),
      id: note.id,
      hidden: note.hidden,
      trashedAt: note.trashedAt as string | null,
      updatedAt: note.updatedAt,
      bounds: validateBounds(note.bounds),
    };
  });
  return { version: 1, language: data.language as Language, notes };
}
export function newNote(
  id: string,
  bounds: Bounds,
  now = new Date().toISOString(),
): Note {
  return {
    id,
    title: "",
    body: "",
    color: "yellow",
    fontSize: 16,
    pinned: false,
    hidden: false,
    trashedAt: null,
    updatedAt: now,
    bounds: validateBounds(bounds),
  };
}
export function clampBounds(saved: Bounds, area: Bounds): Bounds {
  const width = Math.min(Math.max(260, saved.width), Math.max(260, area.width));
  const height = Math.min(
    Math.max(220, saved.height),
    Math.max(220, area.height),
  );
  return {
    width,
    height,
    x: Math.round(
      Math.max(area.x, Math.min(saved.x, area.x + area.width - width)),
    ),
    y: Math.round(
      Math.max(area.y, Math.min(saved.y, area.y + area.height - height)),
    ),
  };
}
export function findNote(book: Notebook, id: string): Note {
  const note = book.notes.find((item) => item.id === id);
  if (!note) throw new Error("Note not found");
  return note;
}
