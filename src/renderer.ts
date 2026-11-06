import {
  COLORS,
  type Language,
  type Note,
  type NotePatch,
  type Notebook,
} from "./model.js";
const copy = {
  en: {
    all: "All notes",
    new: "New note",
    trash: "Trash",
    restore: "Restore",
    open: "Open",
    hide: "Hide note",
    remove: "Move to trash",
    untitled: "Untitled note",
    empty: "No notes yet. Create your first one.",
    emptyTrash: "Trash is empty.",
    intro: "A little space for your thoughts. Local, simple, yours.",
    exit: "Save and exit",
    close: "Hide panel",
    saved: "Saved on this computer",
    saving: "Saving…",
    title: "Title",
    body: "Write a note…",
    pin: "Always on top",
    unpin: "Stop keeping on top",
    smaller: "Smaller text",
    larger: "Larger text",
    visible: "On desktop",
    hidden: "Hidden",
    local:
      "Notes stay on this computer. Close a note to hide it; use Trash to remove it. No permanent deletion in this version.",
    error: "Could not save. Keep this window open and retry.",
    yellow: "Yellow",
    mint: "Mint",
    blue: "Blue",
    lavender: "Lavender",
    rose: "Rose",
    gray: "Gray",
    chars: "characters",
  },
  "pt-BR": {
    all: "Todas as notas",
    new: "Nova nota",
    trash: "Lixeira",
    restore: "Restaurar",
    open: "Abrir",
    hide: "Ocultar nota",
    remove: "Mover para a lixeira",
    untitled: "Nota sem título",
    empty: "Ainda não há notas. Crie a primeira.",
    emptyTrash: "A lixeira está vazia.",
    intro: "Um espaço para suas ideias. Local, simples, seu.",
    exit: "Salvar e sair",
    close: "Ocultar painel",
    saved: "Salvo neste computador",
    saving: "Salvando…",
    title: "Título",
    body: "Escreva uma nota…",
    pin: "Sempre visível",
    unpin: "Desafixar",
    smaller: "Diminuir texto",
    larger: "Aumentar texto",
    visible: "Na tela",
    hidden: "Oculta",
    local:
      "As notas ficam neste computador. Fechar uma nota apenas a oculta; use a lixeira para removê-la. Sem exclusão definitiva nesta versão.",
    error:
      "Não foi possível salvar. Mantenha esta janela aberta e tente novamente.",
    yellow: "Amarelo",
    mint: "Verde",
    blue: "Azul",
    lavender: "Lilás",
    rose: "Rosa",
    gray: "Cinza",
    chars: "caracteres",
  },
};
let language: Language = "en";
let editor: Note | undefined;
let revision = 0;
let savedRevision = 0;
let saving: Promise<void> | undefined;
let saveTimer: ReturnType<typeof setTimeout>;
let showingTrash = false;
const root = document.getElementById("app")!;
const text = () => copy[language];
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  value?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  if (value !== undefined) item.textContent = value;
  if (className) item.className = className;
  return item;
}
function error() {
  const element = document.getElementById("error")!;
  element.textContent = text().error;
  element.hidden = false;
}
function success() {
  document.getElementById("error")!.hidden = true;
}
function run(action: () => Promise<unknown>) {
  void action().catch(error);
}
function button(label: string, action: () => void, className?: string) {
  const result = node("button", label, className);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}
function icon(glyph: string, label: string, action: () => void) {
  const result = button(glyph, action);
  result.setAttribute("aria-label", label);
  result.title = label;
  return result;
}
function labelEditor() {
  if (!editor) return;
  document.documentElement.lang = language;
  for (const [id, label] of [
    ["new", text().new],
    ["all", text().all],
    ["trash", text().remove],
    ["hide", text().hide],
    ["smaller", text().smaller],
    ["larger", text().larger],
  ] as const) {
    const element = document.getElementById(`note-${id}`)!;
    element.setAttribute("aria-label", label);
    element.title = label;
  }
  const title = document.getElementById("note-title") as HTMLInputElement;
  title.placeholder = text().title;
  title.setAttribute("aria-label", text().title);
  const body = document.getElementById("note-body") as HTMLTextAreaElement;
  body.placeholder = text().body;
  body.setAttribute("aria-label", text().body);
  for (const color of COLORS) {
    const element = document.getElementById(`color-${color}`)!;
    element.setAttribute("aria-label", text()[color]);
    element.title = text()[color];
    element.setAttribute("aria-pressed", String(editor.color === color));
  }
  const pin = document.getElementById("note-pin")!;
  pin.setAttribute("aria-label", editor.pinned ? text().unpin : text().pin);
  pin.title = editor.pinned ? text().unpin : text().pin;
  pin.setAttribute("aria-pressed", String(editor.pinned));
  document.body.dataset.color = editor.color;
  document.body.dataset.font = String(editor.fontSize);
  (document.getElementById("note-smaller") as HTMLButtonElement).disabled =
    editor.fontSize <= 12;
  (document.getElementById("note-larger") as HTMLButtonElement).disabled =
    editor.fontSize >= 28;
}
function patch(): NotePatch {
  return {
    title: (document.getElementById("note-title") as HTMLInputElement).value,
    body: (document.getElementById("note-body") as HTMLTextAreaElement).value,
    color: editor!.color,
    fontSize: editor!.fontSize,
    pinned: editor!.pinned,
  };
}
async function flush(): Promise<void> {
  clearTimeout(saveTimer);
  if (saving) await saving;
  if (!editor || revision === savedRevision) return;
  saving = (async () => {
    while (savedRevision !== revision) {
      const current = revision;
      await window.notes.update(patch());
      savedRevision = current;
    }
    success();
    document.getElementById("save-status")!.textContent = text().saved;
  })();
  try {
    await saving;
  } catch (failure) {
    error();
    throw failure;
  } finally {
    saving = undefined;
  }
}
function dirty(immediate = false) {
  revision += 1;
  clearTimeout(saveTimer);
  document.getElementById("save-status")!.textContent = text().saving;
  if (immediate) run(flush);
  else saveTimer = setTimeout(() => run(flush), 300);
}
function showEditor(note: Note) {
  editor = note;
  root.replaceChildren();
  const window = node("section", undefined, "note-window");
  const header = node("header");
  const actions = node("div", undefined, "note-toolbar");
  const newButton = icon("＋", text().new, () =>
    run(async () => {
      await flush();
      await globalThis.window.notes.create();
    }),
  );
  newButton.id = "note-new";
  const all = icon("☷", text().all, () =>
    run(async () => {
      await flush();
      await globalThis.window.notes.manager();
    }),
  );
  all.id = "note-all";
  const pin = icon("◇", text().pin, () => {
    editor!.pinned = !editor!.pinned;
    labelEditor();
    dirty(true);
  });
  pin.id = "note-pin";
  actions.append(newButton, all, pin);
  const end = node("div", undefined, "note-toolbar");
  const trash = icon("⌫", text().remove, () =>
    run(async () => {
      await flush();
      await globalThis.window.notes.trash();
    }),
  );
  trash.id = "note-trash";
  const hide = icon("×", text().hide, () =>
    run(async () => {
      await flush();
      await globalThis.window.notes.hide();
    }),
  );
  hide.id = "note-hide";
  end.append(trash, hide);
  header.append(actions, end);
  const content = node("div", undefined, "note-editor");
  const title = node("input", undefined, "note-title");
  title.id = "note-title";
  title.value = note.title;
  title.maxLength = 120;
  const body = node("textarea", undefined, "note-body");
  body.id = "note-body";
  body.value = note.body;
  body.maxLength = 100000;
  title.addEventListener("input", () => dirty());
  body.addEventListener("input", () => dirty());
  title.addEventListener("blur", () => run(flush));
  body.addEventListener("blur", () => run(flush));
  content.append(title, body);
  const controls = node("div", undefined, "note-controls");
  const palette = node("div", undefined, "palette");
  for (const color of COLORS) {
    const swatch = button(
      "",
      () => {
        editor!.color = color;
        labelEditor();
        dirty(true);
      },
      "swatch",
    );
    swatch.id = `color-${color}`;
    swatch.dataset.color = color;
    palette.append(swatch);
  }
  const font = node("div", undefined, "font-size");
  const smaller = button("A−", () => {
    editor!.fontSize = Math.max(12, editor!.fontSize - 2);
    labelEditor();
    dirty(true);
  });
  smaller.id = "note-smaller";
  const larger = button("A+", () => {
    editor!.fontSize = Math.min(28, editor!.fontSize + 2);
    labelEditor();
    dirty(true);
  });
  larger.id = "note-larger";
  font.append(smaller, larger);
  controls.append(palette, font);
  const status = node("div", text().saved, "save-status");
  status.id = "save-status";
  status.setAttribute("role", "status");
  window.append(header, content, controls, status);
  root.append(window);
  labelEditor();
  globalThis.window.notes.onFlush(flush);
  body.focus();
}
function showManager(book: Notebook) {
  language = book.language;
  document.documentElement.lang = language;
  root.replaceChildren();
  const header = node("header");
  const brand = node("div", undefined, "brand");
  brand.append(node("span", "", "brand-mark"), node("h1", "Desk notes"));
  const actions = node("div", undefined, "manager-actions");
  const languages = node("select");
  languages.setAttribute(
    "aria-label",
    language === "en" ? "Language" : "Idioma",
  );
  for (const [code, label] of [
    ["en", "English"],
    ["pt-BR", "Português"],
  ]) {
    const option = node("option", label);
    option.value = code!;
    languages.append(option);
  }
  languages.value = language;
  languages.addEventListener("change", () =>
    run(() => window.notes.language(languages.value as Language)),
  );
  actions.append(
    languages,
    button(text().exit, () => run(() => window.notes.quit())),
  );
  header.append(brand, actions);
  const content = node("section", undefined, "manager-content");
  content.append(node("p", text().intro, "intro"));
  const toolbar = node("div", undefined, "manager-toolbar");
  const tabs = node("div", undefined, "tabs");
  for (const [label, isTrash] of [
    [text().all, false],
    [text().trash, true],
  ] as const) {
    const tab = button(label, () => {
      showingTrash = isTrash;
      run(refresh);
    });
    tab.setAttribute("aria-pressed", String(showingTrash === isTrash));
    tabs.append(tab);
  }
  toolbar.append(
    tabs,
    button(
      `＋ ${text().new}`,
      () => run(() => window.notes.create()),
      "primary",
    ),
  );
  content.append(toolbar);
  const notes = book.notes
    .filter((note) => Boolean(note.trashedAt) === showingTrash)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const list = node("div", undefined, "notes-grid");
  if (!notes.length)
    content.append(
      node("p", showingTrash ? text().emptyTrash : text().empty, "empty"),
    );
  for (const note of notes) {
    const card = node("article", undefined, "note-card");
    card.dataset.color = note.color;
    card.append(
      node("h2", note.title || text().untitled),
      node("p", note.body.slice(0, 160) || "…"),
      node("span", note.hidden ? text().hidden : text().visible, "card-meta"),
    );
    const controls = node("div", undefined, "card-actions");
    if (showingTrash)
      controls.append(
        button(text().restore, () => run(() => window.notes.restore(note.id))),
      );
    else
      controls.append(
        button(text().open, () => run(() => window.notes.open(note.id))),
        button(text().remove, () => run(() => window.notes.trash(note.id))),
      );
    card.append(controls);
    list.append(card);
  }
  content.append(list, node("p", text().local, "footer-note"));
  root.append(header, content);
}
async function refresh() {
  const context = await window.notes.context();
  if (context.role === "manager") showManager(context.book);
}
window.notes.onChanged(() => run(refresh));
window.notes.onLanguage((value) => {
  language = value;
  labelEditor();
});
void window.notes
  .context()
  .then((context) => {
    if (context.role === "manager") showManager(context.book);
    else {
      language = context.language;
      showEditor(context.note);
    }
  })
  .catch(error);
