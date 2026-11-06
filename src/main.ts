import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  screen,
  session,
  dialog,
} from "electron";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { NotebookStore } from "./storage.js";
import {
  clampBounds,
  findNote,
  newNote,
  validatePatch,
  type Language,
} from "./model.js";

app.setName("Desk notes");
app.setAppUserModelId("com.baruth91.desknote");
app.setPath(
  "userData",
  resolve(
    process.env.DESK_NOTES_DATA_DIR ||
      join(app.getPath("appData"), "desktop-sticky-notes"),
  ),
);
const roles = new Map<number, string>();
const editors = new Map<string, BrowserWindow>();
const pendingFlush = new Map<
  string,
  { sender: number; done: (ok: boolean) => void }
>();
let manager: BrowserWindow;
let tray: Tray;
let store: NotebookStore;
let quitting = false;
let exitPending = false;
const icon = join(__dirname, "../assets/icon.png");
function role(
  event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
): string {
  const value = roles.get(event.sender.id);
  if (!value || event.senderFrame !== event.sender.mainFrame)
    throw new Error("Invalid caller");
  return value;
}
function requireManager(event: Electron.IpcMainInvokeEvent) {
  if (role(event) !== "manager") throw new Error("Manager only");
}
function editorId(event: Electron.IpcMainInvokeEvent): string {
  const id = role(event);
  if (id === "manager") throw new Error("Editor only");
  return id;
}
function changed() {
  if (manager && !manager.isDestroyed())
    manager.webContents.send("notes:changed");
}
function showManager() {
  manager.show();
  manager.restore();
  manager.focus();
}
function windowOptions() {
  return {
    frame: false,
    backgroundColor: "#fff2b6",
    show: false,
    icon,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  };
}
function secure(window: BrowserWindow, identity: string) {
  roles.set(window.webContents.id, identity);
  const contentsId = window.webContents.id;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.on("closed", () => roles.delete(contentsId));
  window.once("ready-to-show", () => window.show());
  void window.loadFile(join(__dirname, "index.html"));
}
async function flushEditor(id: string) {
  const window = editors.get(id);
  if (!window || window.isDestroyed()) return;
  await new Promise<void>((resolve, reject) => {
    const token = randomUUID();
    const timeout = setTimeout(() => {
      pendingFlush.delete(token);
      reject(
        new Error("A note did not finish saving. Keep the app open and retry."),
      );
    }, 5000);
    pendingFlush.set(token, {
      sender: window.webContents.id,
      done: (ok) => {
        clearTimeout(timeout);
        ok
          ? resolve()
          : reject(
              new Error(
                "A note could not be saved. Keep the app open and retry.",
              ),
            );
      },
    });
    window.webContents.send("notes:flush", token);
  });
}
function destroyEditor(id: string) {
  const window = editors.get(id);
  editors.delete(id);
  window?.destroy();
}
function report(error: unknown) {
  dialog.showErrorBox(
    "Desk notes",
    error instanceof Error
      ? error.message
      : "Could not save notes. Please retry.",
  );
}
async function hideNote(id: string) {
  await flushEditor(id);
  const bounds = editors.get(id)?.getBounds();
  await store.transact((book) => {
    const note = findNote(book, id);
    note.hidden = true;
    if (bounds) note.bounds = bounds;
  });
  destroyEditor(id);
  changed();
}
async function openNote(id: string) {
  const current = editors.get(id);
  if (current && !current.isDestroyed()) {
    current.show();
    current.restore();
    current.focus();
    return;
  }
  const note = findNote(store.snapshot(), id);
  if (note.trashedAt) throw new Error("Restore this note first");
  const area = screen.getDisplayMatching(note.bounds).workArea;
  const bounds = clampBounds(note.bounds, area);
  await store.transact((book) => {
    const item = findNote(book, id);
    item.hidden = false;
    item.bounds = bounds;
  });
  const window = new BrowserWindow({
    ...windowOptions(),
    ...bounds,
    minWidth: 260,
    minHeight: 220,
    maxWidth: 1200,
    maxHeight: 1600,
    alwaysOnTop: note.pinned,
    title: "Desk notes",
  });
  editors.set(id, window);
  let geometryTimer: ReturnType<typeof setTimeout>;
  const geometry = () => {
    clearTimeout(geometryTimer);
    geometryTimer = setTimeout(() => {
      if (!window.isDestroyed() && !quitting)
        void store
          .transact((book) => {
            findNote(book, id).bounds = window.getBounds();
          })
          .catch(report);
    }, 250);
  };
  window.on("moved", geometry);
  window.on("resized", geometry);
  window.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      void hideNote(id).catch(report);
    }
  });
  window.on("closed", () => {
    clearTimeout(geometryTimer);
    editors.delete(id);
  });
  secure(window, id);
  changed();
}
async function quit() {
  if (exitPending) return;
  exitPending = true;
  try {
    await Promise.all([...editors.keys()].map(flushEditor));
    await store.transact((book) => {
      for (const [id, window] of editors)
        if (!window.isDestroyed())
          findNote(book, id).bounds = window.getBounds();
    });
    await store.flush();
    quitting = true;
    app.quit();
  } finally {
    exitPending = false;
  }
}
function updateTray(language: Language) {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: language === "pt-BR" ? "Todas as notas" : "All notes",
        click: showManager,
      },
      { type: "separator" },
      {
        label: language === "pt-BR" ? "Salvar e sair" : "Save and exit",
        click: () => {
          void quit().catch(report);
        },
      },
    ]),
  );
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (manager) showManager();
  });
  app
    .whenReady()
    .then(async () => {
      app.setAccessibilitySupportEnabled(true);
      store = new NotebookStore(
        app.getPath("userData"),
        app.getLocale().startsWith("pt") ? "pt-BR" : "en",
      );
      const book = await store.load();
      Menu.setApplicationMenu(null);
      session.defaultSession.setPermissionRequestHandler(
        (_window, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onBeforeRequest((request, callback) =>
        callback({
          cancel:
            !request.url.startsWith("file://") &&
            !request.url.startsWith("devtools://"),
        }),
      );
      manager = new BrowserWindow({
        ...windowOptions(),
        width: 700,
        height: 570,
        minWidth: 450,
        minHeight: 350,
        title: "Desk notes — all notes",
        backgroundColor: "#f6f5ef",
      });
      manager.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          manager.hide();
        }
      });
      secure(manager, "manager");
      tray = new Tray(icon);
      tray.setToolTip("Desk notes");
      tray.on("click", showManager);
      updateTray(book.language);
      ipcMain.handle("notes:context", (event) => {
        const id = role(event);
        return id === "manager"
          ? { role: "manager", book: store.snapshot() }
          : {
              role: "note",
              note: findNote(store.snapshot(), id),
              language: store.snapshot().language,
            };
      });
      ipcMain.handle("notes:create", async (event) => {
        role(event);
        if (exitPending) throw new Error("App is saving and exiting");
        const id = randomUUID();
        const area = screen.getPrimaryDisplay().workArea;
        const offset = (store.snapshot().notes.length % 8) * 28;
        const bounds = clampBounds(
          {
            x: area.x + 45 + offset,
            y: area.y + 65 + offset,
            width: 310,
            height: 350,
          },
          area,
        );
        await store.transact((book) => {
          book.notes.push(newNote(id, bounds));
        });
        await openNote(id);
      });
      ipcMain.handle("notes:update", async (event, value: unknown) => {
        const id = editorId(event);
        const patch = validatePatch(value);
        const book = await store.transact((book) => {
          const note = findNote(book, id);
          if (note.trashedAt) throw new Error("Note is in trash");
          Object.assign(note, patch, { updatedAt: new Date().toISOString() });
        });
        editors.get(id)?.setAlwaysOnTop(patch.pinned);
        changed();
        return findNote(book, id);
      });
      ipcMain.handle("notes:hide", async (event) => hideNote(editorId(event)));
      ipcMain.handle("notes:open", async (event, id: unknown) => {
        requireManager(event);
        if (typeof id !== "string") throw new Error("Invalid id");
        await openNote(id);
      });
      ipcMain.handle("notes:trash", async (event, supplied: unknown) => {
        const caller = role(event);
        const id =
          caller === "manager" && typeof supplied === "string"
            ? supplied
            : caller;
        await flushEditor(id);
        await store.transact((book) => {
          const note = findNote(book, id);
          note.trashedAt = new Date().toISOString();
          note.hidden = true;
        });
        destroyEditor(id);
        changed();
      });
      ipcMain.handle("notes:restore", async (event, id: unknown) => {
        requireManager(event);
        if (typeof id !== "string") throw new Error("Invalid id");
        await store.transact((book) => {
          const note = findNote(book, id);
          note.trashedAt = null;
          note.hidden = true;
        });
        changed();
      });
      ipcMain.handle("notes:language", async (event, language: unknown) => {
        requireManager(event);
        if (language !== "en" && language !== "pt-BR")
          throw new Error("Invalid language");
        await store.transact((book) => {
          book.language = language;
        });
        updateTray(language);
        for (const window of editors.values())
          window.webContents.send("notes:language", language);
        changed();
      });
      ipcMain.handle("notes:manager", (event) => {
        role(event);
        showManager();
      });
      ipcMain.handle("notes:quit", (event) => {
        requireManager(event);
        return quit();
      });
      ipcMain.on("notes:flushed", (event, token: unknown, ok: unknown) => {
        role(event);
        if (typeof token !== "string") return;
        const pending = pendingFlush.get(token);
        if (pending?.sender === event.sender.id) {
          pendingFlush.delete(token);
          pending.done(ok === true);
        }
      });
      for (const note of book.notes.filter(
        (note) => !note.hidden && !note.trashedAt,
      ))
        await openNote(note.id);
    })
    .catch((error) => {
      report(error);
      quitting = true;
      app.quit();
    });
  app.on("before-quit", (event) => {
    if (!quitting) {
      event.preventDefault();
      void quit().catch(report);
    }
  });
  app.on("window-all-closed", () => {
    /* Tray keeps hidden notes reachable. */
  });
}
