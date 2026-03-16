/**
 * Prompt dialog — built via DOM manipulation on about:blank.
 * Styling the real document fixes the transparent popup gaps without relying on a custom XHTML window.
 */

import { buildFullPrompt } from "./prompt-template";

const HTML_NS = "http://www.w3.org/1999/xhtml";

export function openPromptDialog(_rootURI: string) {
  const mainWin = Zotero.getMainWindow();
  const win = mainWin.openDialog(
    "about:blank",
    "citegen-prompt",
    "chrome,centerscreen,resizable,dialog=no,width=650,height=520",
  );

  const init = () => buildPromptUI(win);
  if (win.document.readyState === "complete") {
    init();
  } else {
    win.addEventListener("load", init, { once: true });
  }
}

function buildPromptUI(win: Window) {
  const doc = win.document;
  prepareDialogDocument(doc);
  doc.title = "AI Citation Prompt";

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
      "box-sizing:border-box",
    ].join(";"),
  });
  doc.body.appendChild(root);

  root.appendChild(
    h(
      doc,
      "p",
      { style: "color:#475569;margin:0;" },
      "Give this prompt to your AI (ChatGPT, Claude, etc). Then paste the JSON output back into the Citation Importer.",
    ),
  );

  const topicInput = h(doc, "input", {
    type: "text",
    placeholder: "e.g. transformer models in NLP",
    style: inputStyle("flex:1"),
  }) as HTMLInputElement;
  const focusInput = h(doc, "input", {
    type: "text",
    placeholder: "e.g. seminal papers and recent surveys",
    style: inputStyle("flex:1"),
  }) as HTMLInputElement;
  const countInput = h(doc, "input", {
    type: "number",
    value: "10",
    min: "1",
    max: "50",
    style: inputStyle("max-width:80px"),
  }) as HTMLInputElement;

  root.appendChild(row(doc, "Topic:", topicInput));
  root.appendChild(row(doc, "Focus:", focusInput));
  root.appendChild(row(doc, "Count:", countInput));

  const output = h(doc, "textarea", {
    style: [
      "flex:1",
      "width:100%",
      "font-family:monospace",
      "font-size:11px",
      "border:1px solid #c4c4c4",
      "border-radius:6px",
      "padding:8px",
      "background:#fff",
      "resize:none",
      "box-sizing:border-box",
      "line-height:1.45",
    ].join(";"),
    readonly: "readonly",
  }) as HTMLTextAreaElement;
  root.appendChild(output);

  const copyStatus = h(
    doc,
    "span",
    {
      style: "font-size:12px;color:#16a34a;opacity:0;transition:opacity 0.3s;",
    },
    "Copied!",
  );
  const btnRegen = makeButton(doc, "Regenerate");
  const btnCopy = makeButton(doc, "Copy to Clipboard", true);
  root.appendChild(
    h(
      doc,
      "div",
      { style: "display:flex;gap:8px;justify-content:flex-end;align-items:center;" },
      copyStatus,
      btnRegen,
      btnCopy,
    ),
  );

  function regenerate() {
    const topic = topicInput.value.trim() || undefined;
    const focus = focusInput.value.trim() || undefined;
    const count = parseInt(countInput.value, 10) || 10;
    output.value = buildFullPrompt(topic, focus, count);
  }

  btnRegen.addEventListener("click", regenerate);
  topicInput.addEventListener("input", regenerate);
  focusInput.addEventListener("input", regenerate);
  countInput.addEventListener("input", regenerate);

  btnCopy.addEventListener("click", () => {
    const text = output.value;
    if (!text) return;
    try {
      const clipboard = Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(
        Components.interfaces.nsIClipboardHelper,
      );
      clipboard.copyString(text);
    } catch {
      navigator.clipboard.writeText(text);
    }
    copyStatus.style.opacity = "1";
    win.setTimeout(() => {
      copyStatus.style.opacity = "0";
    }, 2000);
  });

  regenerate();
}

function prepareDialogDocument(doc: Document) {
  doc.documentElement.style.cssText = "height:100%;margin:0;background:#f8f9fa;";
  doc.body.style.cssText =
    "height:100%;margin:0;background:#f8f9fa;overflow:hidden;box-sizing:border-box;";
  while (doc.head.firstChild) {
    doc.head.removeChild(doc.head.firstChild);
  }
  while (doc.body.firstChild) {
    doc.body.removeChild(doc.body.firstChild);
  }
}

function inputStyle(extra: string) {
  return [
    extra,
    "padding:6px 8px",
    "border:1px solid #c4c4c4",
    "border-radius:6px",
    "font-size:13px",
    "background:#fff",
    "box-sizing:border-box",
  ].join(";");
}

function makeButton(doc: Document, text: string, primary = false) {
  return h(
    doc,
    "button",
    {
      style: [
        "padding:6px 16px",
        "border-radius:6px",
        `border:1px solid ${primary ? "#2563eb" : "#c4c4c4"}`,
        `background:${primary ? "#2563eb" : "#fff"}`,
        `color:${primary ? "#fff" : "#222"}`,
        "cursor:pointer",
        "font-size:13px",
      ].join(";"),
    },
    text,
  ) as HTMLButtonElement;
}

function row(doc: Document, labelText: string, input: HTMLElement) {
  return h(
    doc,
    "div",
    { style: "display:flex;gap:8px;align-items:center;" },
    h(doc, "label", { style: "font-weight:600;min-width:55px;" }, labelText),
    input,
  );
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
