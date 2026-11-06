import type { Language, Note, Notebook, NotePatch } from "./model.js";
export type Context =
  | { role: "manager"; book: Notebook }
  | { role: "note"; note: Note; language: Language };
export interface NotesAPI {
  context(): Promise<Context>;
  create(): Promise<void>;
  update(patch: NotePatch): Promise<Note>;
  hide(): Promise<void>;
  trash(id?: string): Promise<void>;
  open(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  language(value: Language): Promise<void>;
  manager(): Promise<void>;
  quit(): Promise<void>;
  onChanged(callback: () => void): void;
  onLanguage(callback: (language: Language) => void): void;
  onFlush(callback: () => Promise<void>): void;
}
declare global {
  interface Window {
    notes: NotesAPI;
  }
}
