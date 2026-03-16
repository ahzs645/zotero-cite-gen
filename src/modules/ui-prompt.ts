/**
 * Prompt dialog — built entirely via DOM manipulation on about:blank.
 */

import { buildFullPrompt } from "./prompt-template";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export function openPromptDialog() {
  const mainWin = Zotero.getMainWindow();

  const win = mainWin.openDialog(
    "about:blank",
    "citegen-prompt",
    "chrome,centerscreen,resizable,width=650,height=520",
  );

  win.addEventListener("load", () => buildPromptUI(win));
}

function buildPromptUI(win: Window) {
  const doc = win.document;
  win.document.title = "AI Citation Prompt";

  const root = h(doc, "div", {
    style: "font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#222;background:#f8f9fa;padding:14px;display:flex;flex-direction:column;height:100vh;gap:10px;box-sizing:border-box;margin:0;",
  });
  doc.documentElement.appendChild(root);

  root.appendChild(h(doc, "p", { style: "color:#475569;margin:0;" },
    "Give this prompt to your AI (ChatGPT, Claude, etc). Then paste the JSON output back into the Citation Importer."));

  // Form fields
  const topicInput = h(doc, "input", { type: "text", placeholder: "e.g. transformer models in NLP", style: "flex:1;padding:6px 8px;border:1px solid #bbb;border-radius:6px;font-size:13px;" }) as HTMLInputElement;
  const focusInput = h(doc, "input", { type: "text", placeholder: "e.g. seminal papers and recent surveys", style: "flex:1;padding:6px 8px;border:1px solid #bbb;border-radius:6px;font-size:13px;" }) as HTMLInputElement;
  const countInput = h(doc, "input", { type: "number", value: "10", min: "1", max: "50", style: "max-width:80px;padding:6px 8px;border:1px solid #bbb;border-radius:6px;font-size:13px;" }) as HTMLInputElement;

  root.appendChild(row(doc, "Topic:", topicInput));
  root.appendChild(row(doc, "Focus:", focusInput));
  root.appendChild(row(doc, "Count:", countInput));

  // Output
  const output = h(doc, "textarea", {
    style: "flex:1;width:100%;font-family:monospace;font-size:11px;border:1px solid #bbb;border-radius:6px;padding:8px;background:#fff;resize:none;box-sizing:border-box;",
    readonly: "readonly",
  }) as HTMLTextAreaElement;
  root.appendChild(output);

  // Buttons
  const copyStatus = h(doc, "span", { style: "font-size:12px;color:#16a34a;opacity:0;transition:opacity 0.3s;" }, "Copied!");
  const btnRegen = h(doc, "button", { style: "padding:6px 16px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer;font-size:13px;" }, "Regenerate");
  const btnCopy = h(doc, "button", { style: "padding:6px 16px;border-radius:6px;border:1px solid #2563eb;background:#2563eb;color:#fff;cursor:pointer;font-size:13px;" }, "Copy to Clipboard");
  root.appendChild(h(doc, "div", { style: "display:flex;gap:8px;justify-content:flex-end;align-items:center;" }, copyStatus, btnRegen, btnCopy));

  function gen() {
    const topic = topicInput.value.trim() || undefined;
    const focus = focusInput.value.trim() || undefined;
    const count = parseInt(countInput.value) || 10;
    output.value = buildFullPrompt(topic, focus, count);
  }

  btnRegen.addEventListener("click", gen);
  topicInput.addEventListener("input", gen);
  focusInput.addEventListener("input", gen);
  countInput.addEventListener("input", gen);

  btnCopy.addEventListener("click", () => {
    const text = output.value;
    if (!text) return;
    try {
      const ch = Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper);
      ch.copyString(text);
    } catch (e) {
      navigator.clipboard.writeText(text);
    }
    (copyStatus as HTMLElement).style.opacity = "1";
    setTimeout(() => { (copyStatus as HTMLElement).style.opacity = "0"; }, 2000);
  });

  gen();
}

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

function row(doc: Document, labelText: string, input: HTMLElement): HTMLElement {
  return h(doc, "div", { style: "display:flex;gap:8px;align-items:center;" },
    h(doc, "label", { style: "font-weight:600;min-width:55px;" }, labelText),
    input,
  );
}
