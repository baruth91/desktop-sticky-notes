import { contextBridge, ipcRenderer } from "electron";
import type { NotesAPI } from "./bridge.js";
const api: NotesAPI = {
  context: () => ipcRenderer.invoke("notes:context"),
  create: () => ipcRenderer.invoke("notes:create"),
  update: (patch) => ipcRenderer.invoke("notes:update", patch),
  hide: () => ipcRenderer.invoke("notes:hide"),
  trash: (id) => ipcRenderer.invoke("notes:trash", id),
  open: (id) => ipcRenderer.invoke("notes:open", id),
  restore: (id) => ipcRenderer.invoke("notes:restore", id),
  language: (value) => ipcRenderer.invoke("notes:language", value),
  manager: () => ipcRenderer.invoke("notes:manager"),
  quit: () => ipcRenderer.invoke("notes:quit"),
  onChanged: (callback) => {
    ipcRenderer.on("notes:changed", () => callback());
  },
  onLanguage: (callback) => {
    ipcRenderer.on("notes:language", (_event, value) => callback(value));
  },
  onFlush: (callback) => {
    ipcRenderer.on("notes:flush", (_event, token: string) => {
      void callback().then(
        () => ipcRenderer.send("notes:flushed", token, true),
        () => ipcRenderer.send("notes:flushed", token, false),
      );
    });
  },
};
contextBridge.exposeInMainWorld("notes", api);
