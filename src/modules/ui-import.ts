/**
 * Import dialog — built via DOM manipulation on about:blank.
 * We use custom pickers instead of native selects because the latter are unreliable in Zotero's popup chrome.
 */

import { ImportDialogController } from "./import-dialog";

const HTML_NS = "http://www.w3.org/1999/xhtml";

interface DestinationState {
  libraryID: number;
  collectionID: number | null;
}

interface DestinationLibrary {
  id: number;
  name: string;
}

interface PickerOption {
  value: string;
  label: string;
}

interface PickerControl {
  root: HTMLElement;
  close(): void;
  getValue(): string;
  onChange(handler: (value: string) => void): void;
  setDisabled(disabled: boolean): void;
  setOptions(options: PickerOption[]): void;
  setValue(value: string): void;
}

export function openImportDialog(_rootURI: string) {
  const controller = new ImportDialogController();
  const mainWin = Zotero.getMainWindow();
  const win = mainWin.openDialog(
    "about:blank",
    "citegen-import",
    "chrome,centerscreen,resizable,dialog=no,width=960,height=700",
  );

  const init = () => buildImportUI(win, controller);
  if (win.document.readyState === "complete") {
    init();
  } else {
    win.addEventListener("load", init, { once: true });
  }
}

function buildImportUI(win: Window, controller: ImportDialogController) {
  const doc = win.document;
  prepareDialogDocument(doc);
  doc.title = "Import AI Citations";

  const activeDest = getActiveDestination();
  let currentPayload: ReturnType<ImportDialogController["getPayload"]> = null;

  const root = h(doc, "div", {
    style: [
      "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
      "font-size:13px",
      "color:#1f2937",
      "background:#f8f9fa",
      "padding:14px",
      "display:flex",
      "flex-direction:column",
      "height:100%",
      "gap:10px",
      "overflow:hidden",
      "box-sizing:border-box",
    ].join(";"),
  });
  doc.body.appendChild(root);

  const inputLabel = h(
    doc,
    "label",
    { style: "font-weight:600;display:block;margin-bottom:4px;" },
    "Paste your AI-generated JSON below:",
  );
  const textarea = h(doc, "textarea", {
    style: [
      "width:100%",
      "min-height:90px",
      "max-height:160px",
      "font-family:monospace",
      "font-size:11px",
      "border:1px solid #c4c4c4",
      "border-radius:6px",
      "padding:8px",
      "resize:vertical",
      "box-sizing:border-box",
      "background:#fff",
      "line-height:1.45",
    ].join(";"),
    placeholder:
      '{"query":"topic","citations":[{"title":"...","authors":["..."],"year":2023,"doi":"...","reason":"..."}]}',
  }) as HTMLTextAreaElement;
  root.appendChild(h(doc, "div", {}, inputLabel, textarea));

  const btnPreview = makeButton(doc, "Preview");
  const btnBrowse = makeButton(doc, "Browse File...");
  const btnVerify = makeButton(doc, "Verify DOIs");
  btnVerify.disabled = true;
  const btnImport = makeButton(doc, "Import to Zotero", true);
  btnImport.disabled = true;
  const btnNewCollection = makeButton(doc, "New Collection...");

  const libraryPicker = createPicker(doc, "Select library", "250px");
  const collectionPicker = createPicker(doc, "Library Root", "340px");

  const actionRow = h(
    doc,
    "div",
    { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
    btnPreview,
    btnBrowse,
    btnVerify,
  );

  const destinationRow = h(
    doc,
    "div",
    { style: "display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;" },
    fieldGroup(doc, "Library", libraryPicker.root),
    fieldGroup(doc, "Collection", collectionPicker.root),
    btnNewCollection,
    h(doc, "span", { style: "flex:1 1 12px;" }),
    btnImport,
  );

  root.appendChild(actionRow);
  root.appendChild(destinationRow);

  const opts: Record<string, HTMLInputElement> = {};
  const optionDefs: Array<[string, string, boolean]> = [
    ["verify", "Verify DOIs", true],
    ["s2", "Semantic Scholar", true],
    ["resolve", "Resolve URLs", true],
    ["dedup", "Check duplicates", true],
    ["skip-dup", "Skip duplicates", false],
    ["notes", "Attach reasons", true],
    ["link", "Link related", true],
    ["litmap", "Lit map", true],
  ];
  const optionsRow = h(doc, "div", {
    style: "display:flex;gap:12px;font-size:11px;flex-wrap:wrap;",
  });
  for (const [id, labelText, checked] of optionDefs) {
    const checkbox = h(doc, "input", { type: "checkbox" }) as HTMLInputElement;
    checkbox.checked = checked;
    opts[id] = checkbox;
    optionsRow.appendChild(
      h(
        doc,
        "label",
        {
          style:
            "display:inline-flex;align-items:center;gap:3px;cursor:pointer;font-weight:normal;",
        },
        checkbox,
        labelText,
      ),
    );
  }
  root.appendChild(optionsRow);

  const statusBar = h(
    doc,
    "div",
    {
      style:
        "font-size:12px;padding:6px 10px;border-radius:6px;min-height:24px;background:#dbeafe;color:#1e40af;",
    },
    "Ready. Paste JSON and click Preview.",
  );
  const summary = h(doc, "div", { style: "font-size:11px;color:#666;" });
  root.appendChild(statusBar);
  root.appendChild(summary);

  const tbody = h(doc, "tbody");
  const table = h(
    doc,
    "table",
    {
      style: "width:100%;border-collapse:collapse;font-size:11px;",
    },
    h(
      doc,
      "thead",
      {},
      h(
        doc,
        "tr",
        {},
        ...["#", "Title", "Authors", "Year", "Source", "Status", "Reason"].map(
          (column) =>
            h(
              doc,
              "th",
              {
                style: [
                  "text-align:left",
                  "padding:6px 8px",
                  "background:#f1f5f9",
                  "border-bottom:2px solid #e2e8f0",
                  "font-size:10px",
                  "text-transform:uppercase",
                  "letter-spacing:.04em",
                  "color:#64748b",
                  "position:sticky",
                  "top:0",
                ].join(";"),
              },
              column,
            ),
        ),
      ),
    ),
    tbody,
  );
  root.appendChild(
    h(
      doc,
      "div",
      {
        style:
          "flex:1;overflow:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff;",
      },
      table,
    ),
  );

  const closePickers = () => {
    libraryPicker.close();
    collectionPicker.close();
  };

  function setStatus(message: string, type: "info" | "err" | "ok" | "warn" = "info") {
    const colors: Record<typeof type, { bg: string; fg: string }> = {
      info: { bg: "#dbeafe", fg: "#1e40af" },
      err: { bg: "#fee2e2", fg: "#991b1b" },
      ok: { bg: "#dcfce7", fg: "#166534" },
      warn: { bg: "#fef3c7", fg: "#92400e" },
    };
    statusBar.textContent = message;
    statusBar.style.backgroundColor = colors[type].bg;
    statusBar.style.color = colors[type].fg;
  }

  function getEditableLibraries(): DestinationLibrary[] {
    try {
      const libraries = Zotero.Libraries.getAll()
        .map((library) => {
          const id = Number(library.libraryID ?? library.id);
          return {
            id,
            name: Zotero.Libraries.getName(id),
            type: Zotero.Libraries.getType(id),
          };
        })
        .filter((library) => library.type !== "feed" && Zotero.Libraries.isEditable(library.id))
        .map(({ id, name }) => ({ id, name }));

      libraries.sort((a, b) => {
        if (a.id === Zotero.Libraries.userLibraryID) return -1;
        if (b.id === Zotero.Libraries.userLibraryID) return 1;
        return a.name.localeCompare(b.name);
      });
      return libraries;
    } catch {
      return [
        {
          id: Zotero.Libraries.userLibraryID,
          name: "My Library",
        },
      ];
    }
  }

  function buildCollectionOptions(libraryID: number): PickerOption[] {
    const options: PickerOption[] = [{ value: "", label: "Library Root" }];
    try {
      const collections = Zotero.Collections.getByLibrary(libraryID) || [];
      const topCollections = collections.filter((collection) => !collection.parentID);
      for (const collection of topCollections) {
        collectCollectionOptions(collection, 0, options);
      }
    } catch {}
    return options;
  }

  function populateCollections(libraryID: number, selectedCollectionID: number | null) {
    const options = buildCollectionOptions(libraryID);
    collectionPicker.setOptions(options);
    collectionPicker.setDisabled(false);
    collectionPicker.setValue(selectedCollectionID ? String(selectedCollectionID) : "");
  }

  function populateDestinations() {
    const libraries = getEditableLibraries();
    libraryPicker.setOptions(
      libraries.map((library) => ({
        value: String(library.id),
        label: library.name,
      })),
    );

    if (!libraries.length) {
      libraryPicker.setDisabled(true);
      collectionPicker.setOptions([{ value: "", label: "Library Root" }]);
      collectionPicker.setDisabled(true);
      btnNewCollection.disabled = true;
      btnImport.disabled = true;
      setStatus("No editable libraries are available for import.", "err");
      return;
    }

    const selectedLibraryID = libraries.some((library) => library.id === activeDest.libraryID)
      ? activeDest.libraryID
      : libraries[0].id;
    if (selectedLibraryID !== activeDest.libraryID) {
      activeDest.libraryID = selectedLibraryID;
      activeDest.collectionID = null;
    }

    libraryPicker.setDisabled(false);
    libraryPicker.setValue(String(selectedLibraryID));
    populateCollections(selectedLibraryID, activeDest.collectionID);
    btnNewCollection.disabled = false;
  }

  btnPreview.addEventListener("click", () => {
    const raw = textarea.value;
    if (!raw.trim()) {
      setStatus("Paste some JSON first.", "err");
      return;
    }

    const result = controller.parseInput(raw);
    if (!result.success) {
      setStatus(result.error || "Unable to parse input.", "err");
      return;
    }

    currentPayload = result.payload || null;
    const citations = result.payload?.citations || [];
    const warnings = result.warnings || [];
    let withDOI = 0;
    let withURL = 0;
    for (const citation of citations) {
      if (citation.doi) {
        withDOI++;
      } else if (citation.url) {
        withURL++;
      }
    }

    clearChildren(tbody);
    citations.forEach((citation, index) => {
      const source = citation.doi
        ? "DOI"
        : citation.url
          ? citation.url.includes("arxiv")
            ? "arXiv"
            : "URL"
          : "None";
      const statusCell = makeCell(
        doc,
        citation.doi ? "Pending" : citation.url ? "URL only" : "No link",
      );
      statusCell.id = `vs-${index}`;
      statusCell.style.color = citation.doi ? "#d97706" : "#9ca3af";

      tbody.appendChild(
        h(
          doc,
          "tr",
          {},
          makeCell(doc, String(index + 1)),
          makeCell(doc, truncate(citation.title, 55)),
          makeCell(doc, truncate((citation.authors || []).join(", ") || "Unknown", 30)),
          makeCell(doc, citation.year ? String(citation.year) : "\u2014"),
          makeCell(doc, source),
          statusCell,
          makeCell(doc, truncate(citation.reason || "\u2014", 45)),
        ),
      );
    });

    summary.textContent =
      `${citations.length} citation(s) | ${withDOI} DOI | ${withURL} URL-only`;
    setStatus(
      warnings.length
        ? `Warnings: ${warnings.slice(0, 2).join("; ")}`
        : `Parsed ${citations.length} citation(s). Ready.`,
      warnings.length ? "warn" : "ok",
    );
    btnVerify.disabled = false;
    btnImport.disabled = !libraryPicker.getValue();
  });

  btnVerify.addEventListener("click", async () => {
    if (!currentPayload) return;
    btnVerify.disabled = true;
    setStatus("Verifying DOIs...", "info");

    try {
      const results = await controller.verifyDOIs((current, total, verification) => {
        setStatus(`Verifying DOIs (${current}/${total})...`, "info");
        const citations = currentPayload?.citations || [];
        for (let i = 0; i < citations.length; i++) {
          if (citations[i].doi !== verification.doi) continue;
          const cell = doc.getElementById(`vs-${i}`) as HTMLElement | null;
          if (!cell) break;
          cell.textContent = verification.valid ? "Verified" : "Not found";
          cell.style.color = verification.valid ? "#16a34a" : "#dc2626";
          cell.style.fontWeight = "600";
          break;
        }
      });

      const validCount = results.filter((result) => result.valid).length;
      const invalidCount = results.length - validCount;
      setStatus(
        `DOI check: ${validCount} valid, ${invalidCount} not found`,
        validCount ? "ok" : "err",
      );
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`, "err");
    } finally {
      btnVerify.disabled = false;
    }
  });

  btnImport.addEventListener("click", async () => {
    if (!currentPayload) return;

    btnImport.disabled = true;
    btnVerify.disabled = true;
    closePickers();

    const libraryValue = libraryPicker.getValue();
    const collectionValue = collectionPicker.getValue();
    const importOptions = {
      libraryID: libraryValue ? parseInt(libraryValue, 10) : undefined,
      collectionID: collectionValue ? parseInt(collectionValue, 10) : undefined,
      verifyDOIs: opts.verify.checked,
      useSemanticScholar: opts.s2.checked,
      resolveURLs: opts.resolve.checked,
      checkDuplicates: opts.dedup.checked,
      skipDuplicates: opts["skip-dup"].checked,
      attachReasons: opts.notes.checked,
      linkRelated: opts.link.checked,
      createLitMap: opts.litmap.checked,
    };

    const labels: Record<string, string> = {
      resolve: "Resolving URLs",
      verify: "Verifying DOIs",
      "s2-verify": "Semantic Scholar",
      duplicates: "Checking duplicates",
      import: "Importing",
      notes: "Creating notes",
      linking: "Linking",
      litmap: "Lit map",
    };

    try {
      const results = await controller.runImport(importOptions, (stage, current, total, detail) => {
        const label = labels[stage] || stage;
        setStatus(
          `${label} (${current}/${total})${detail ? ` - ${detail}` : ""}`,
          "info",
        );
      });

      const imported = results.filter((result) => !result.skipped).length;
      const skipped = results.length - imported;
      setStatus(
        `Done! Imported ${imported} item(s).${skipped ? ` Skipped ${skipped} duplicate(s).` : ""}`,
        "ok",
      );
      summary.textContent =
        `Imported ${imported} citation(s)` + (skipped ? `, skipped ${skipped} dup(s)` : "");

      results.forEach((result, index) => {
        const cell = doc.getElementById(`vs-${index}`) as HTMLElement | null;
        if (!cell) return;

        if (result.skipped) {
          cell.textContent = "Skipped";
          cell.style.color = "#dc2626";
          return;
        }

        if (!result.confidence) return;
        cell.textContent = `${result.confidence.level} (${result.confidence.score})`;
        cell.style.color =
          result.confidence.level === "high"
            ? "#16a34a"
            : result.confidence.level === "medium"
              ? "#d97706"
              : "#dc2626";
        cell.style.fontWeight = "600";
      });
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`, "err");
    } finally {
      btnImport.disabled = false;
      btnVerify.disabled = false;
    }
  });

  libraryPicker.onChange((value) => {
    const libraryID = parseInt(value, 10);
    if (Number.isNaN(libraryID)) return;
    activeDest.libraryID = libraryID;
    activeDest.collectionID = null;
    populateCollections(libraryID, null);
    btnNewCollection.disabled = false;
    if (currentPayload) {
      btnImport.disabled = false;
    }
  });

  collectionPicker.onChange((value) => {
    activeDest.collectionID = value ? parseInt(value, 10) : null;
  });

  btnNewCollection.addEventListener("click", async () => {
    const libraryValue = libraryPicker.getValue();
    if (!libraryValue) return;

    const input = { value: "" };
    const check = { value: false };
    const ok = Services.prompt.prompt(
      win,
      "New Collection",
      "Enter a name for the new collection:",
      input,
      null,
      check,
    );
    if (!ok) return;

    const name = input.value.trim();
    if (!name) {
      setStatus("Collection name cannot be empty.", "err");
      return;
    }

    try {
      const libraryID = parseInt(libraryValue, 10);
      const parentValue = collectionPicker.getValue();
      const collection = new Zotero.Collection();
      collection.libraryID = libraryID;
      collection.name = name;
      if (parentValue) {
        collection.parentID = parseInt(parentValue, 10);
      }
      await collection.saveTx();

      activeDest.collectionID = collection.id;
      populateCollections(libraryID, collection.id);
      setStatus(`Created collection "${name}".`, "ok");
    } catch (error) {
      setStatus(`Collection error: ${(error as Error).message}`, "err");
    }
  });

  btnBrowse.addEventListener("click", async () => {
    try {
      closePickers();
      const filePicker = Components.classes["@mozilla.org/filepicker;1"].createInstance(
        Components.interfaces.nsIFilePicker,
      );
      filePicker.init(win, "Select JSON File", Components.interfaces.nsIFilePicker.modeOpen);
      filePicker.appendFilter("JSON Files", "*.json");
      const result: number = await new Promise((resolve) => filePicker.open(resolve));
      if (result !== Components.interfaces.nsIFilePicker.returnOK) return;

      textarea.value = await Zotero.File.getContentsAsync(filePicker.file.path);
      btnPreview.click();
    } catch (error) {
      setStatus(`File error: ${(error as Error).message}`, "err");
    }
  });

  win.addEventListener("blur", closePickers);
  populateDestinations();
}

function getActiveDestination(): DestinationState {
  let libraryID = Zotero.Libraries.userLibraryID;
  let collectionID: number | null = null;

  try {
    const pane = Zotero.getActiveZoteroPane?.();
    if (pane) {
      const selectedCollection = pane.getSelectedCollection?.();
      if (selectedCollection) {
        libraryID = selectedCollection.libraryID;
        collectionID = selectedCollection.id;
      } else if (pane.getSelectedLibraryID) {
        libraryID = pane.getSelectedLibraryID() || libraryID;
      }
    }
  } catch {}

  return { libraryID, collectionID };
}

function prepareDialogDocument(doc: Document) {
  doc.documentElement.style.cssText = "height:100%;margin:0;background:#f8f9fa;";
  doc.body.style.cssText =
    "height:100%;margin:0;background:#f8f9fa;overflow:hidden;box-sizing:border-box;";
  clearDocument(doc);
}

function clearDocument(doc: Document) {
  while (doc.head.firstChild) {
    doc.head.removeChild(doc.head.firstChild);
  }
  while (doc.body.firstChild) {
    doc.body.removeChild(doc.body.firstChild);
  }
}

function clearChildren(node: Node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function collectCollectionOptions(collection: any, depth: number, options: PickerOption[]) {
  const prefix = depth > 0 ? `${"-- ".repeat(depth)}` : "";
  options.push({
    value: String(collection.id),
    label: `${prefix}${collection.name}`,
  });
  const children = collection.getChildCollections?.(false, false) || [];
  for (const child of children) {
    collectCollectionOptions(child, depth + 1, options);
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}\u2026` : text;
}

function fieldGroup(doc: Document, label: string, control: HTMLElement) {
  return h(
    doc,
    "div",
    { style: "display:flex;flex-direction:column;gap:4px;" },
    h(doc, "span", { style: "font-size:12px;color:#475569;" }, `${label}:`),
    control,
  );
}

function makeCell(doc: Document, text: string) {
  return h(
    doc,
    "td",
    {
      style: "padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;",
    },
    text,
  );
}

function makeButton(doc: Document, text: string, primary = false) {
  return h(
    doc,
    "button",
    {
      style: [
        "padding:5px 14px",
        "border-radius:6px",
        `border:1px solid ${primary ? "#2563eb" : "#c4c4c4"}`,
        `background:${primary ? "#2563eb" : "#fff"}`,
        `color:${primary ? "#fff" : "#222"}`,
        "cursor:pointer",
        "font-size:12px",
        "font-weight:500",
      ].join(";"),
    },
    text,
  ) as HTMLButtonElement;
}

function createPicker(doc: Document, placeholder: string, minWidth: string): PickerControl {
  const root = h(doc, "div", {
    style: `position:relative;min-width:${minWidth};`,
  });
  const label = h(doc, "span", {
    style: "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;",
  });
  const arrow = h(
    doc,
    "span",
    {
      style: "margin-left:8px;font-size:10px;color:#64748b;flex:none;",
    },
    "v",
  );
  const trigger = h(
    doc,
    "button",
    {
      type: "button",
      style: [
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "gap:8px",
        "width:100%",
        "padding:7px 10px",
        "border-radius:6px",
        "border:1px solid #c4c4c4",
        "background:#fff",
        "font-size:12px",
        "color:#1f2937",
        "cursor:pointer",
      ].join(";"),
    },
    label,
    arrow,
  ) as HTMLButtonElement;
  trigger.setAttribute("aria-expanded", "false");

  const menu = h(doc, "div", {
    style: [
      "display:none",
      "position:absolute",
      "top:calc(100% + 4px)",
      "left:0",
      "right:0",
      "max-height:240px",
      "overflow:auto",
      "padding:4px",
      "background:#fff",
      "border:1px solid #c4c4c4",
      "border-radius:8px",
      "box-shadow:0 10px 30px rgba(15,23,42,0.15)",
      "z-index:1000",
    ].join(";"),
  });

  root.appendChild(trigger);
  root.appendChild(menu);

  let options: PickerOption[] = [];
  let value = "";
  const changeHandlers: Array<(value: string) => void> = [];

  const close = () => {
    menu.style.display = "none";
    trigger.setAttribute("aria-expanded", "false");
  };

  const render = () => {
    if (!options.some((option) => option.value === value) && options.length) {
      value = options[0].value;
    }

    const current = options.find((option) => option.value === value);
    label.textContent = current?.label || placeholder;
    label.style.color = current ? "#1f2937" : "#94a3b8";

    Array.from(menu.children).forEach((child) => {
      const item = child as HTMLButtonElement;
      const selected = item.dataset.value === value;
      item.style.backgroundColor = selected ? "#eff6ff" : "transparent";
      item.style.color = selected ? "#1d4ed8" : "#1f2937";
      item.style.fontWeight = selected ? "600" : "400";
    });
  };

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (trigger.disabled || !options.length) return;
    const expanded = trigger.getAttribute("aria-expanded") === "true";
    if (expanded) {
      close();
    } else {
      menu.style.display = "block";
      trigger.setAttribute("aria-expanded", "true");
    }
  });

  doc.addEventListener("click", (event) => {
    const target = event.target;
    if (target && root.contains(target as Node)) return;
    close();
  });

  return {
    root,
    close,
    getValue: () => value,
    onChange(handler) {
      changeHandlers.push(handler);
    },
    setDisabled(disabled) {
      trigger.disabled = disabled;
      trigger.style.opacity = disabled ? "0.6" : "1";
      trigger.style.cursor = disabled ? "default" : "pointer";
      if (disabled) {
        close();
      }
    },
    setOptions(nextOptions) {
      options = nextOptions.slice();
      clearChildren(menu);

      for (const option of options) {
        const item = h(
          doc,
          "button",
          {
            type: "button",
            style: [
              "display:block",
              "width:100%",
              "padding:7px 10px",
              "border:0",
              "border-radius:6px",
              "background:transparent",
              "text-align:left",
              "cursor:pointer",
              "font-size:12px",
            ].join(";"),
          },
          option.label,
        ) as HTMLButtonElement;
        item.dataset.value = option.value;
        item.addEventListener("click", (event) => {
          event.stopPropagation();
          value = option.value;
          render();
          close();
          for (const handler of changeHandlers) {
            handler(value);
          }
        });
        menu.appendChild(item);
      }

      if (!options.some((option) => option.value === value)) {
        value = options[0]?.value ?? "";
      }
      render();
    },
    setValue(nextValue) {
      if (options.some((option) => option.value === nextValue)) {
        value = nextValue;
      } else if (options.length) {
        value = options[0].value;
      } else {
        value = "";
      }
      render();
    },
  };
}

function h(
  doc: Document,
  tag: string,
  attrs?: Record<string, string>,
  ...children: Array<string | Node>
) {
  const el = doc.createElementNS(HTML_NS, tag) as HTMLElement;
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "style") {
        el.style.cssText = value;
      } else {
        el.setAttribute(key, value);
      }
    }
  }
  for (const child of children) {
    if (typeof child === "string") {
      el.appendChild(doc.createTextNode(child));
    } else if (child) {
      el.appendChild(child);
    }
  }
  return el;
}
