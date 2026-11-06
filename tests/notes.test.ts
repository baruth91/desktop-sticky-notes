import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  newNote,
  validateNotebook,
  validatePatch,
  clampBounds,
  findNote,
  COLORS,
  type Notebook,
} from "../src/model.js";
import { NotebookStore } from "../src/storage.js";
const bounds = { x: 80, y: 90, width: 310, height: 350 };
function book(): Notebook {
  return {
    version: 1,
    language: "en",
    notes: [newNote("note-a", bounds, "2026-11-06T12:00:00Z")],
  };
}
test("new notes have independent text, visibility and geometry", () => {
  const a = newNote("a", bounds);
  const b = newNote("b", bounds);
  a.body = "Changed";
  a.bounds.x = 300;
  assert.equal(b.body, "");
  assert.equal(b.bounds.x, 80);
  assert.equal(b.trashedAt, null);
  assert.equal(b.hidden, false);
});
test("all supported colors and font boundaries round-trip through validation", () => {
  for (const color of COLORS)
    for (const fontSize of [12, 16, 28]) {
      const note = { ...book().notes[0]!, color, fontSize };
      assert.equal(validatePatch(note).color, color);
    }
});
test("invalid text, colors, fonts and preference versions are rejected", () => {
  const note = book().notes[0]!;
  for (const patch of [
    { title: "x".repeat(121) },
    { body: "x".repeat(100001) },
    { body: null },
    { color: "black" },
    { fontSize: 29 },
    { fontSize: 15.5 },
    { pinned: "yes" },
  ])
    assert.throws(() => validatePatch({ ...note, ...patch }));
  assert.throws(() => validateNotebook({ ...book(), version: 2 }));
});
test("unknown fields are stripped and literal markup stays plain text", () => {
  const original = book();
  original.notes[0]!.body = "<img src=x onerror=alert(1)>";
  const validated = validateNotebook({ ...original, ignored: true });
  assert.equal(validated.notes[0]!.body, "<img src=x onerror=alert(1)>");
  assert.equal("ignored" in validated, false);
});
test("duplicate identifiers, invalid dates and invalid bounds are rejected", () => {
  const original = book();
  assert.throws(() =>
    validateNotebook({
      ...original,
      notes: [...original.notes, ...original.notes],
    }),
  );
  for (const patch of [
    { updatedAt: "bad" },
    { trashedAt: true },
    { bounds: { ...bounds, width: 10 } },
    { bounds: { ...bounds, x: Infinity } },
  ])
    assert.throws(() =>
      validateNotebook({
        ...original,
        notes: [{ ...original.notes[0], ...patch }],
      }),
    );
});
test("disconnected monitor positions are clamped into the remaining work area", () => {
  const area = { x: 0, y: 0, width: 1280, height: 720 };
  assert.deepEqual(
    clampBounds({ x: -4000, y: 2000, width: 310, height: 350 }, area),
    { x: 0, y: 370, width: 310, height: 350 },
  );
  const negativeMonitor = { x: -1920, y: 0, width: 1920, height: 1080 };
  assert.equal(clampBounds({ ...bounds, x: -1500 }, negativeMonitor).x, -1500);
});
test("real persisted notes restore content, colors, size, position and pin state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "desk-notes-test-"));
  try {
    const store = new NotebookStore(directory, "pt-BR");
    await store.load();
    await store.transact((book) => {
      book.notes.push({
        ...newNote("a", bounds),
        title: "Ideias",
        body: "Primeira linha\nSegunda linha",
        color: "mint",
        fontSize: 20,
        pinned: true,
      });
    });
    const loaded = await new NotebookStore(directory).load();
    assert.equal(loaded.language, "pt-BR");
    assert.equal(loaded.notes[0]!.body, "Primeira linha\nSegunda linha");
    assert.equal(loaded.notes[0]!.color, "mint");
    assert.equal(loaded.notes[0]!.pinned, true);
    assert.deepEqual(loaded.notes[0]!.bounds, bounds);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("queued text and geometry updates merge without reverting other fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "desk-notes-queue-"));
  try {
    const store = new NotebookStore(directory);
    await store.transact((book) => {
      book.notes.push(newNote("a", bounds));
    });
    await Promise.all([
      store.transact((book) => {
        findNote(book, "a").body = "Latest text";
      }),
      store.transact((book) => {
        findNote(book, "a").bounds.x = 500;
      }),
    ]);
    const loaded = await new NotebookStore(directory).load();
    assert.equal(loaded.notes[0]!.body, "Latest text");
    assert.equal(loaded.notes[0]!.bounds.x, 500);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("hidden notes and trash can be reopened/restored without losing text", async () => {
  const directory = await mkdtemp(join(tmpdir(), "desk-notes-trash-"));
  try {
    const store = new NotebookStore(directory);
    await store.transact((book) => {
      book.notes.push({ ...newNote("a", bounds), body: "Keep this" });
    });
    await store.transact((book) => {
      const note = findNote(book, "a");
      note.hidden = true;
      note.trashedAt = "2026-11-06T12:00:00Z";
    });
    const restoredStore = new NotebookStore(directory);
    await restoredStore.load();
    await restoredStore.transact((book) => {
      const note = findNote(book, "a");
      note.trashedAt = null;
      note.hidden = false;
    });
    assert.equal(restoredStore.snapshot().notes[0]!.body, "Keep this");
    assert.equal(restoredStore.snapshot().notes[0]!.hidden, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("invalid edits leave both the disk and in-memory notebook unchanged", async () => {
  const directory = await mkdtemp(join(tmpdir(), "desk-notes-invalid-"));
  try {
    const store = new NotebookStore(directory);
    await store.transact((book) => {
      book.notes.push(newNote("a", bounds));
    });
    const before = await readFile(join(directory, "notes.json"), "utf8");
    await assert.rejects(
      store.transact((book) => {
        findNote(book, "a").fontSize = 0;
      }),
    );
    assert.equal(await readFile(join(directory, "notes.json"), "utf8"), before);
    assert.equal(store.snapshot().notes[0]!.fontSize, 16);
    await store.transact((book) => {
      findNote(book, "a").title = "Retry works";
    });
    assert.equal(store.snapshot().notes[0]!.title, "Retry works");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("corrupt notebooks are preserved and loading fails explicitly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "desk-notes-corrupt-"));
  try {
    await writeFile(join(directory, "notes.json"), "corrupt-json");
    await assert.rejects(new NotebookStore(directory).load());
    assert.equal(
      await readFile(join(directory, "notes.json"), "utf8"),
      "corrupt-json",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("a prior valid save remains in the recovery backup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "desk-notes-backup-"));
  try {
    const store = new NotebookStore(directory);
    await store.transact((book) => {
      book.notes.push({ ...newNote("a", bounds), body: "Original" });
    });
    await store.transact((book) => {
      findNote(book, "a").body = "Changed";
    });
    assert.equal(
      JSON.parse(await readFile(join(directory, "notes.backup.json"), "utf8"))
        .notes[0].body,
      "Original",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
