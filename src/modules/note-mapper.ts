/**
 * Maps AI citation reasons and metadata into Zotero notes
 * attached to imported items.
 */

import type { AICitation, AIImportPayload } from "./json-parser";

/**
 * Create a Zotero note item attached to a parent item
 * containing the AI's reasoning for why this citation matters.
 */
export async function createReasonNote(
  parentItem: any,
  citation: AICitation,
  query?: string,
): Promise<any> {
  const noteHTML = buildNoteHTML(citation, query);

  const note = new Zotero.Item("note");
  note.libraryID = parentItem.libraryID;
  note.parentID = parentItem.id;
  note.setNote(noteHTML);
  await note.saveTx();

  return note;
}

/**
 * Build the HTML content for the reason note using the template from prefs,
 * or a sensible default.
 */
function buildNoteHTML(citation: AICitation, query?: string): string {
  let template: string;
  try {
    template = Zotero.Prefs.get(
      "extensions.zotero.citegen.noteTemplate",
      true,
    ) as string;
  } catch {
    template =
      '<h2>Citation Reason</h2><p><strong>Query:</strong> {{query}}</p><p><strong>Reason:</strong> {{reason}}</p><p><em>Imported on {{date}}</em></p>';
  }

  const now = new Date().toISOString().split("T")[0];

  let html = template
    .replace(/\{\{query\}\}/g, escapeHTML(query || "N/A"))
    .replace(/\{\{reason\}\}/g, escapeHTML(citation.reason || "No reason provided"))
    .replace(/\{\{date\}\}/g, now)
    .replace(/\{\{title\}\}/g, escapeHTML(citation.title))
    .replace(
      /\{\{authors\}\}/g,
      escapeHTML(citation.authors.join(", ") || "Unknown"),
    )
    .replace(/\{\{year\}\}/g, String(citation.year || "N/A"))
    .replace(/\{\{doi\}\}/g, escapeHTML(citation.doi || "N/A"));

  return html;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Batch-create reason notes for all imported items.
 */
export async function createAllReasonNotes(
  items: Array<{ zoteroItem: any; citation: AICitation }>,
  query?: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const { zoteroItem, citation } = items[i];
    if (citation.reason) {
      await createReasonNote(zoteroItem, citation, query);
    }
    onProgress?.(i + 1, items.length);
  }
}
