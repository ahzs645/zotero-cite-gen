/**
 * Automatically links imported citations to each other
 * using Zotero's "Related" feature, since they came from
 * the same AI query / research context.
 */

import type { ImportResult } from "./importer";

/**
 * Link all imported items to each other as "Related" in Zotero.
 * Items from the same import batch are contextually related.
 */
export async function linkRelatedItems(
  results: ImportResult[],
): Promise<void> {
  if (results.length < 2) return;

  const items = results
    .map((r) => r.zoteroItem)
    .filter((item) => item && item.isRegularItem());

  if (items.length < 2) return;

  // Link each pair — Zotero.Item.addRelatedItem handles bidirectional
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      try {
        items[i].addRelatedItem(items[j]);
      } catch (e) {
        Zotero.debug(
          `[CiteGen] Could not link items ${items[i].id} and ${items[j].id}: ${(e as Error).message}`,
        );
      }
    }
    // Save after adding all relations for this item
    try {
      await items[i].saveTx();
    } catch (e) {
      Zotero.debug(
        `[CiteGen] Could not save relations for item ${items[i].id}: ${(e as Error).message}`,
      );
    }
  }
}

/**
 * Create a parent note that serves as a "literature map" —
 * a standalone note in the collection summarizing all imported
 * citations and their reasons.
 */
export async function createLiteratureMapNote(
  results: ImportResult[],
  query?: string,
  collectionID?: number,
): Promise<any> {
  if (results.length === 0) return null;

  const now = new Date().toISOString().split("T")[0];
  let html = `<h1>Literature Map: ${escapeHTML(query || "AI Citation Import")}</h1>`;
  html += `<p><em>Imported ${results.length} citations on ${now}</em></p>`;
  html += "<hr/>";

  // Group by confidence level if available
  for (let i = 0; i < results.length; i++) {
    const { citation, doiResult } = results[i];
    const verified = doiResult?.valid ? " [DOI Verified]" : "";

    html += `<h2>${i + 1}. ${escapeHTML(citation.title)}${verified}</h2>`;
    html += `<p><strong>Authors:</strong> ${escapeHTML(citation.authors.join(", ") || "Unknown")}</p>`;

    if (citation.year) {
      html += `<p><strong>Year:</strong> ${citation.year}</p>`;
    }

    if (citation.journal) {
      html += `<p><strong>Source:</strong> ${escapeHTML(citation.journal)}`;
      if (citation.volume) html += `, vol. ${escapeHTML(citation.volume)}`;
      if (citation.issue) html += `(${escapeHTML(citation.issue)})`;
      if (citation.pages) html += `, pp. ${escapeHTML(citation.pages)}`;
      html += "</p>";
    }

    if (citation.doi) {
      html += `<p><strong>DOI:</strong> ${escapeHTML(citation.doi)}</p>`;
    } else if (citation.url) {
      html += `<p><strong>URL:</strong> ${escapeHTML(citation.url)}</p>`;
    }

    if (citation.reason) {
      html += `<blockquote><strong>Why it matters:</strong> ${escapeHTML(citation.reason)}</blockquote>`;
    }

    html += "<hr/>";
  }

  // Create the note
  const note = new Zotero.Item("note");
  note.libraryID = Zotero.Libraries.userLibraryID;
  note.setNote(html);
  await note.saveTx();

  // Add to collection if specified
  if (collectionID) {
    const collection = Zotero.Collections.get(collectionID);
    if (collection) {
      collection.addItem(note.id);
      await collection.saveTx();
    }
  }

  return note;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
