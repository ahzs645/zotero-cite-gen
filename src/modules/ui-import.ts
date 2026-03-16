/**
 * Import dialog — built entirely via DOM manipulation on about:blank.
 */

import { ImportDialogController } from "./import-dialog";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export function openImportDialog() {
  const controller = new ImportDialogController();
  const mainWin = Zotero.getMainWindow();

  const win = mainWin.openDialog(
    "about:blank",
    "citegen-import",
    "chrome,centerscreen,resizable,width=820,height=620",
  );

  win.addEventListener("load", () => buildImportUI(win, controller));
}

function buildImportUI(win: Window, controller: ImportDialogController) {
  const doc = win.document;
  win.document.title = "Import AI Citations";

  // Create root container
  const root = h(doc, "div", {
    style: "font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#222;background:#f8f9fa;padding:14px;display:flex;flex-direction:column;height:100vh;gap:8px;overflow:hidden;box-sizing:border-box;margin:0;",
  });
  doc.documentElement.appendChild(root);

  // ── Textarea ──
  const label = h(doc, "label", { style: "font-weight:600;display:block;margin-bottom:4px;" }, "Paste your AI-generated JSON below:");
  const textarea = h(doc, "textarea", {
    style: "width:100%;min-height:80px;max-height:150px;font-family:monospace;font-size:11px;border:1px solid #bbb;border-radius:6px;padding:8px;resize:vertical;box-sizing:border-box;background:#fff;",
    placeholder: '{"query":"topic","citations":[{"title":"...","authors":["..."],"year":2023,"doi":"...","reason":"..."}]}',
  }) as HTMLTextAreaElement;
  root.appendChild(h(doc, "div", {}, label, textarea));

  // ── Buttons ──
  const btnPreview = makeBtn(doc, "Preview");
  const btnBrowse = makeBtn(doc, "Browse File...");
  const btnVerify = makeBtn(doc, "Verify DOIs"); (btnVerify as HTMLButtonElement).disabled = true;
  const btnImport = makeBtn(doc, "Import to Zotero", true); (btnImport as HTMLButtonElement).disabled = true;
  const collSelect = h(doc, "select", { style: "padding:4px 8px;border-radius:6px;border:1px solid #bbb;font-size:12px;" });
  collSelect.appendChild(h(doc, "option", { value: "" }, "My Library"));

  // Populate collections
  try {
    const colls = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID);
    for (const c of colls) {
      collSelect.appendChild(h(doc, "option", { value: String(c.id) }, c.name));
    }
  } catch (e) {}

  const spacer = h(doc, "span", { style: "flex:1;" });
  root.appendChild(h(doc, "div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;" },
    btnPreview, btnBrowse, btnVerify, spacer,
    h(doc, "span", { style: "font-size:12px;" }, "Into: "), collSelect, btnImport,
  ));

  // ── Options ──
  const opts: Record<string, HTMLInputElement> = {};
  const optsDef: [string, string, boolean][] = [
    ["verify", "Verify DOIs", true], ["s2", "Semantic Scholar", true],
    ["resolve", "Resolve URLs", true], ["dedup", "Check duplicates", true],
    ["skip-dup", "Skip duplicates", false], ["notes", "Attach reasons", true],
    ["link", "Link related", true], ["litmap", "Lit map", true],
  ];
  const optsRow = h(doc, "div", { style: "display:flex;gap:12px;flex-wrap:wrap;" });
  for (const [id, text, checked] of optsDef) {
    const cb = h(doc, "input", { type: "checkbox" }) as HTMLInputElement;
    if (checked) cb.checked = true;
    opts[id] = cb;
    optsRow.appendChild(h(doc, "label", { style: "display:inline-flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;" }, cb, text));
  }
  root.appendChild(optsRow);

  // ── Status + Summary ──
  const statusBar = h(doc, "div", { style: "font-size:12px;padding:6px 10px;border-radius:6px;min-height:22px;background:#dbeafe;color:#1e40af;" }, "Ready. Paste JSON and click Preview.");
  const summary = h(doc, "div", { style: "font-size:11px;color:#666;" });
  root.appendChild(statusBar);
  root.appendChild(summary);

  // ── Table ──
  const thead = h(doc, "thead");
  const headRow = h(doc, "tr");
  for (const col of ["#", "Title", "Authors", "Year", "Source", "Status", "Reason"]) {
    headRow.appendChild(h(doc, "th", { style: "text-align:left;padding:6px 8px;background:#f1f5f9;border-bottom:2px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;position:sticky;top:0;" }, col));
  }
  thead.appendChild(headRow);
  const tbody = h(doc, "tbody");
  const table = h(doc, "table", { style: "width:100%;border-collapse:collapse;font-size:11px;" }, thead, tbody);
  root.appendChild(h(doc, "div", { style: "flex:1;overflow:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff;" }, table));

  // ── Helpers ──
  function setStatus(msg: string, type: string) {
    const colors: Record<string, string> = { info: "#dbeafe;color:#1e40af", err: "#fee2e2;color:#991b1b", ok: "#dcfce7;color:#166534", warn: "#fef3c7;color:#92400e" };
    statusBar.textContent = msg;
    statusBar.style.cssText = "font-size:12px;padding:6px 10px;border-radius:6px;min-height:22px;background:" + (colors[type] || colors.info);
  }

  function trunc(s: string, n: number) { return s.length > n ? s.substring(0, n - 1) + "\u2026" : s; }

  let currentPayload: any = null;

  // ── Preview ──
  btnPreview.addEventListener("click", () => {
    const raw = (textarea as any).value;
    if (!raw.trim()) { setStatus("Paste some JSON first.", "err"); return; }
    const result = controller.parseInput(raw);
    if (!result.success) { setStatus(result.error!, "err"); return; }

    currentPayload = result.payload;
    const cits = result.payload!.citations;
    const warns = result.warnings || [];
    let withDOI = 0, withURL = 0;
    for (const c of cits) { if (c.doi) withDOI++; else if (c.url) withURL++; }

    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    for (let j = 0; j < cits.length; j++) {
      const c = cits[j];
      const src = c.doi ? "DOI" : (c.url ? (c.url.indexOf("arxiv") >= 0 ? "arXiv" : "URL") : "None");
      const tr = h(doc, "tr",{},
        td(doc, String(j + 1)),
        td(doc, trunc(c.title, 55), "max-width:220px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"),
        td(doc, trunc((c.authors || []).join(", ") || "Unknown", 30)),
        td(doc, c.year ? String(c.year) : "\u2014"),
        td(doc, src, "color:#64748b;font-size:10px;"),
        Object.assign(td(doc, c.doi ? "Pending" : (c.url ? "URL only" : "No link"), c.doi ? "color:#d97706;" : "color:#9ca3af;"), { id: "vs-" + j }),
        td(doc, trunc(c.reason || "\u2014", 45), "max-width:180px;font-style:italic;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"),
      );
      tbody.appendChild(tr);
    }

    summary.textContent = cits.length + " citation(s) | " + withDOI + " DOI | " + withURL + " URL-only";
    setStatus(warns.length > 0 ? "Warnings: " + warns.slice(0, 2).join("; ") : "Parsed " + cits.length + " citation(s). Ready.", warns.length > 0 ? "warn" : "ok");
    (btnVerify as HTMLButtonElement).disabled = false;
    (btnImport as HTMLButtonElement).disabled = false;
  });

  // ── Verify DOIs ──
  btnVerify.addEventListener("click", async () => {
    if (!currentPayload) return;
    (btnVerify as HTMLButtonElement).disabled = true;
    setStatus("Verifying DOIs...", "info");
    try {
      const results = await controller.verifyDOIs((cur: number, tot: number, res: any) => {
        setStatus("Verifying DOIs (" + cur + "/" + tot + ")...", "info");
        const cits = currentPayload.citations;
        for (let k = 0; k < cits.length; k++) {
          if (cits[k].doi === res.doi) {
            const cell = doc.getElementById("vs-" + k);
            if (cell) { cell.textContent = res.valid ? "Verified" : "Not found"; cell.style.color = res.valid ? "#16a34a" : "#dc2626"; cell.style.fontWeight = "600"; }
            break;
          }
        }
      });
      let valid = 0, invalid = 0;
      for (const r of results) { if (r.valid) valid++; else invalid++; }
      setStatus("DOI check: " + valid + " valid, " + invalid + " not found", valid > 0 ? "ok" : "err");
    } catch (e: any) { setStatus("Error: " + e.message, "err"); }
    (btnVerify as HTMLButtonElement).disabled = false;
  });

  // ── Import ──
  btnImport.addEventListener("click", async () => {
    if (!currentPayload) return;
    (btnImport as HTMLButtonElement).disabled = true;
    (btnVerify as HTMLButtonElement).disabled = true;

    const importOpts = {
      collectionID: (collSelect as HTMLSelectElement).value ? parseInt((collSelect as HTMLSelectElement).value) : undefined,
      verifyDOIs: opts["verify"].checked,
      useSemanticScholar: opts["s2"].checked,
      resolveURLs: opts["resolve"].checked,
      checkDuplicates: opts["dedup"].checked,
      skipDuplicates: opts["skip-dup"].checked,
      attachReasons: opts["notes"].checked,
      linkRelated: opts["link"].checked,
      createLitMap: opts["litmap"].checked,
    };

    const labels: Record<string, string> = { resolve: "Resolving URLs", verify: "Verifying DOIs", "s2-verify": "Semantic Scholar", duplicates: "Checking duplicates", import: "Importing", notes: "Creating notes", linking: "Linking", litmap: "Lit map" };

    try {
      const results = await controller.runImport(importOpts, (stage: string, cur: number, tot: number, detail?: string) => {
        setStatus((labels[stage] || stage) + " (" + cur + "/" + tot + ")" + (detail ? " - " + detail : ""), "info");
      });
      let imported = 0, skipped = 0;
      for (const r of results) { if (r.skipped) skipped++; else imported++; }
      setStatus("Done! Imported " + imported + " item(s)." + (skipped > 0 ? " Skipped " + skipped + " duplicate(s)." : ""), "ok");
      summary.textContent = "Imported " + imported + " citation(s)" + (skipped > 0 ? ", skipped " + skipped + " dup(s)" : "");

      for (let j = 0; j < results.length; j++) {
        const cell = doc.getElementById("vs-" + j);
        if (!cell) continue;
        if (results[j].skipped) { cell.textContent = "Skipped"; cell.style.color = "#dc2626"; }
        else if (results[j].confidence) {
          const cf = results[j].confidence!;
          cell.textContent = cf.level + " (" + cf.score + ")";
          cell.style.color = cf.level === "high" ? "#16a34a" : (cf.level === "medium" ? "#d97706" : "#dc2626");
          cell.style.fontWeight = "600";
        }
      }
    } catch (e: any) { setStatus("Error: " + e.message, "err"); }
    (btnImport as HTMLButtonElement).disabled = false;
    (btnVerify as HTMLButtonElement).disabled = false;
  });

  // ── Browse ──
  btnBrowse.addEventListener("click", async () => {
    try {
      const fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(Components.interfaces.nsIFilePicker);
      fp.init(win, "Select JSON File", Components.interfaces.nsIFilePicker.modeOpen);
      fp.appendFilter("JSON Files", "*.json");
      const rv: number = await new Promise((resolve: any) => fp.open(resolve));
      if (rv === Components.interfaces.nsIFilePicker.returnOK) {
        (textarea as any).value = await Zotero.File.getContentsAsync(fp.file.path);
        btnPreview.click();
      }
    } catch (e: any) { setStatus("File error: " + e.message, "err"); }
  });
}

// ── DOM helpers ──
function h(doc: Document, tag: string, attrs?: Record<string, string>, ...children: (string | Node)[]): HTMLElement {
  const el = doc.createElementNS(HTML_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (typeof child === "string") el.appendChild(doc.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

function td(doc: Document, text: string, extraStyle?: string): HTMLElement {
  return h(doc, "td", { style: "padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;" + (extraStyle || "") }, text);
}

function makeBtn(doc: Document, text: string, primary?: boolean): HTMLElement {
  return h(doc, "button", {
    style: "padding:5px 14px;border-radius:6px;border:1px solid " + (primary ? "#2563eb;background:#2563eb;color:#fff" : "#bbb;background:#fff;color:#222") + ";cursor:pointer;font-size:12px;font-weight:500;",
  }, text);
}
