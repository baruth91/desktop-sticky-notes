import { mkdir, readFile, writeFile, copyFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { validateNotebook, type Notebook, type Language } from "./model.js";

export class NotebookStore {
  private book: Notebook;
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private directory: string,
    language: Language = "en",
  ) {
    this.book = { version: 1, language, notes: [] };
  }
  async load(): Promise<Notebook> {
    try {
      this.book = validateNotebook(
        JSON.parse(await readFile(join(this.directory, "notes.json"), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Unable to read notes.json. The file has been kept untouched.",
        );
    }
    return this.snapshot();
  }
  snapshot(): Notebook {
    return structuredClone(this.book);
  }
  transact(change: (book: Notebook) => void): Promise<Notebook> {
    const operation = this.queue.then(async () => {
      const next = this.snapshot();
      change(next);
      const validated = validateNotebook(next);
      await mkdir(this.directory, { recursive: true });
      try {
        await copyFile(
          join(this.directory, "notes.json"),
          join(this.directory, "notes.backup.json"),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      await writeFile(
        join(this.directory, "notes.json.tmp"),
        `${JSON.stringify(validated, null, 2)}\n`,
        { mode: 0o600 },
      );
      await rename(
        join(this.directory, "notes.json.tmp"),
        join(this.directory, "notes.json"),
      );
      this.book = validated;
      return this.snapshot();
    });
    this.queue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  flush(): Promise<void> {
    return this.queue;
  }
}
