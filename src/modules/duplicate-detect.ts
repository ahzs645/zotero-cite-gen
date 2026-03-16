/**
 * Duplicate detection: checks if a citation already exists
 * in the user's Zotero library before importing.
 */

import type { AICitation } from "./json-parser";

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matchType?: "doi" | "title" | "title+year";
  existingItemID?: number;
  existingTitle?: string;
  confidence: number; // 0-1
}

/**
 * Check a single citation against the existing library.
 * Checks DOI first (exact match), then title similarity.
 */
export async function checkDuplicate(
  citation: AICitation,
  libraryID: number = Zotero.Libraries.userLibraryID,
): Promise<DuplicateCheckResult> {
  // 1. Check by DOI (highest confidence)
  if (citation.doi) {
    const s = new Zotero.Search();
    s.libraryID = libraryID;
    s.addCondition("DOI", "is", citation.doi);
    const ids = await s.search();

    if (ids.length > 0) {
      const existing = Zotero.Items.get(ids[0]);
      return {
        isDuplicate: true,
        matchType: "doi",
        existingItemID: ids[0],
        existingTitle: existing?.getField?.("title") || undefined,
        confidence: 1.0,
      };
    }
  }

  // 2. Check by exact title match
  if (citation.title) {
    const s = new Zotero.Search();
    s.libraryID = libraryID;
    s.addCondition("title", "is", citation.title);
    const ids = await s.search();

    if (ids.length > 0) {
      const existing = Zotero.Items.get(ids[0]);
      // Higher confidence if year also matches
      let confidence = 0.8;
      if (citation.year && existing?.getField?.("date")) {
        const existingYear = String(existing.getField("date")).match(
          /(\d{4})/,
        );
        if (existingYear && parseInt(existingYear[1]) === citation.year) {
          confidence = 0.95;
        }
      }

      return {
        isDuplicate: true,
        matchType: citation.year ? "title+year" : "title",
        existingItemID: ids[0],
        existingTitle: existing?.getField?.("title") || undefined,
        confidence,
      };
    }

    // 3. Fuzzy title search (contains) — lower confidence
    const fuzzy = new Zotero.Search();
    fuzzy.libraryID = libraryID;
    fuzzy.addCondition("title", "contains", citation.title);
    const fuzzyIds = await fuzzy.search();

    for (const id of fuzzyIds) {
      const existing = Zotero.Items.get(id);
      if (!existing?.isRegularItem()) continue;

      const existingTitle = existing.getField("title") || "";
      const similarity = titleSimilarity(citation.title, existingTitle);

      if (similarity >= 0.85) {
        return {
          isDuplicate: true,
          matchType: "title",
          existingItemID: id,
          existingTitle,
          confidence: similarity * 0.9, // scale down slightly since it's fuzzy
        };
      }
    }
  }

  return { isDuplicate: false, confidence: 0 };
}

/**
 * Check all citations for duplicates.
 * Returns a map of citation index → duplicate result.
 */
export async function checkAllDuplicates(
  citations: AICitation[],
  libraryID: number = Zotero.Libraries.userLibraryID,
  onProgress?: (current: number, total: number) => void,
): Promise<Map<number, DuplicateCheckResult>> {
  const results = new Map<number, DuplicateCheckResult>();

  for (let i = 0; i < citations.length; i++) {
    const result = await checkDuplicate(citations[i], libraryID);
    if (result.isDuplicate) {
      results.set(i, result);
    }
    onProgress?.(i + 1, citations.length);
  }

  return results;
}

/**
 * Normalized title similarity using word overlap (Jaccard).
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalize(a));
  const wordsB = new Set(normalize(b));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function normalize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}
