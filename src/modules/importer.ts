/**
 * Core importer: takes parsed AI citations and creates Zotero items.
 * Full pipeline: URL resolve → Semantic Scholar → DOI verify →
 * duplicate check → import → tag → notes → link related → lit map.
 */

import type { AICitation, AIImportPayload } from "./json-parser";
import type { DOIVerificationResult } from "./doi-verify";
import type { SemanticScholarResult } from "./semantic-scholar";
import type { DuplicateCheckResult } from "./duplicate-detect";
import type { ConfidenceScore } from "./confidence";
import { verifyAllDOIs, enrichFromCrossRef } from "./doi-verify";
import { searchByTitle } from "./semantic-scholar";
import { resolveAllURLs } from "./url-resolver";
import { checkDuplicate } from "./duplicate-detect";
import { scoreCitation } from "./confidence";
import { createReasonNote } from "./note-mapper";
import { linkRelatedItems, createLiteratureMapNote } from "./related-linker";

export interface ImportResult {
  zoteroItem: any;
  citation: AICitation;
  doiResult?: DOIVerificationResult;
  s2Result?: SemanticScholarResult;
  dupResult?: DuplicateCheckResult;
  confidence?: ConfidenceScore;
  skipped?: boolean;
  skipReason?: string;
}

export interface ImportOptions {
  /** Target library ID (defaults to user library) */
  libraryID?: number;
  /** Target collection ID (null = My Library root) */
  collectionID?: number;
  /** Verify DOIs via CrossRef before importing */
  verifyDOIs?: boolean;
  /** Use Semantic Scholar as fallback verification */
  useSemanticScholar?: boolean;
  /** Resolve metadata from URLs for items without DOIs */
  resolveURLs?: boolean;
  /** Check for duplicates before importing */
  checkDuplicates?: boolean;
  /** Skip items detected as duplicates */
  skipDuplicates?: boolean;
  /** Attach reason as a child note */
  attachReasons?: boolean;
  /** Link all imported items as "Related" */
  linkRelated?: boolean;
  /** Create a literature map summary note */
  createLitMap?: boolean;
  /** Tag to add to all imported items */
  importTag?: string;
  /** The original query for context in notes */
  query?: string;
  /** Progress callback */
  onProgress?: (stage: string, current: number, total: number, detail?: string) => void;
}

/**
 * Parse author string "First Last" into Zotero creator object.
 */
function parseAuthor(name: string): { firstName: string; lastName: string; creatorType: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: "", lastName: parts[0], creatorType: "author" };
  }
  const lastName = parts.pop()!;
  const firstName = parts.join(" ");
  return { firstName, lastName, creatorType: "author" };
}

/**
 * Map an AICitation to Zotero field setters.
 */
function mapCitationToFields(
  citation: AICitation,
): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = [];

  fields.push({ field: "title", value: citation.title });

  if (citation.year) {
    fields.push({ field: "date", value: String(citation.year) });
  }

  if (citation.doi) {
    fields.push({ field: "DOI", value: citation.doi });
  }

  if (citation.url) {
    fields.push({ field: "url", value: citation.url });
  }

  if (citation.abstract) {
    fields.push({ field: "abstractNote", value: citation.abstract });
  }

  // Type-specific fields
  const t = citation.itemType || "journalArticle";

  if (
    t === "journalArticle" ||
    t === "magazineArticle" ||
    t === "newspaperArticle"
  ) {
    if (citation.journal)
      fields.push({ field: "publicationTitle", value: citation.journal });
    if (citation.volume)
      fields.push({ field: "volume", value: citation.volume });
    if (citation.issue) fields.push({ field: "issue", value: citation.issue });
    if (citation.pages) fields.push({ field: "pages", value: citation.pages });
  }

  if (t === "book" || t === "bookSection") {
    if (citation.publisher)
      fields.push({ field: "publisher", value: citation.publisher });
    if (citation.place) fields.push({ field: "place", value: citation.place });
    if (citation.isbn) fields.push({ field: "ISBN", value: citation.isbn });
    if (t === "bookSection" && citation.bookTitle) {
      fields.push({ field: "bookTitle", value: citation.bookTitle });
    }
  }

  if (t === "conferencePaper" && citation.conferenceName) {
    fields.push({
      field: "conferenceName",
      value: citation.conferenceName,
    });
  }

  if (t === "thesis" && citation.university) {
    fields.push({ field: "university", value: citation.university });
  }

  return fields;
}

/**
 * Import a single citation into Zotero.
 */
async function importSingleCitation(
  citation: AICitation,
  libraryID: number,
  collectionID?: number,
): Promise<any> {
  const itemType = citation.itemType || "journalArticle";

  const item = new Zotero.Item(itemType);
  item.libraryID = libraryID;

  // Set fields
  const fields = mapCitationToFields(citation);
  for (const { field, value } of fields) {
    try {
      item.setField(field, value);
    } catch (e) {
      Zotero.debug(
        `[CiteGen] Could not set field "${field}" on ${itemType}: ${(e as Error).message}`,
      );
    }
  }

  // Set creators
  if (citation.authors.length > 0) {
    const creators = citation.authors.map(parseAuthor);
    item.setCreators(creators);
  }

  if (collectionID) {
    item.addToCollection(collectionID);
  }

  // Save the item, including collection membership
  await item.saveTx();

  return item;
}

/**
 * Full import pipeline.
 *
 * Stages: resolve URLs → verify DOIs → Semantic Scholar fallback →
 * check duplicates → score confidence → import → tag → notes →
 * link related → create literature map
 */
export async function importCitations(
  payload: AIImportPayload,
  options: ImportOptions = {},
): Promise<ImportResult[]> {
  const {
    libraryID: requestedLibraryID,
    collectionID,
    verifyDOIs = true,
    useSemanticScholar = true,
    resolveURLs = true,
    checkDuplicates = true,
    skipDuplicates = false,
    attachReasons = true,
    linkRelated = true,
    createLitMap = true,
    importTag,
    query,
    onProgress,
  } = options;

  const libraryID = requestedLibraryID ?? Zotero.Libraries.userLibraryID;
  let citations = [...payload.citations];
  const results: ImportResult[] = [];

  // ── Stage 1: Resolve URLs for items without DOIs ──
  if (resolveURLs) {
    const needsResolve = citations.filter((c) => !c.doi && c.url);
    if (needsResolve.length > 0) {
      onProgress?.("resolve", 0, needsResolve.length, "Resolving URLs...");
      citations = await resolveAllURLs(citations, (current, total) => {
        onProgress?.("resolve", current, total);
      });
    }
  }

  // ── Stage 2: Verify DOIs via CrossRef ──
  let doiResults: DOIVerificationResult[] = [];
  if (verifyDOIs) {
    doiResults = await verifyAllDOIs(citations, (current, total) => {
      onProgress?.("verify", current, total);
    });

    // Enrich citations with CrossRef data
    let doiIndex = 0;
    citations = citations.map((c) => {
      if (c.doi) {
        const enriched = enrichFromCrossRef(c, doiResults[doiIndex]);
        doiIndex++;
        return enriched;
      }
      return c;
    });
  }

  // ── Stage 3: Semantic Scholar fallback for unverified items ──
  const s2Results: Map<number, SemanticScholarResult> = new Map();
  if (useSemanticScholar) {
    const needsS2 = citations
      .map((c, i) => ({ citation: c, index: i }))
      .filter(({ citation }) => {
        // Use S2 if no DOI, or if DOI failed verification
        if (!citation.doi) return true;
        const doiResult = doiResults.find((r) => r.doi === citation.doi);
        return doiResult && !doiResult.valid;
      });

    for (let i = 0; i < needsS2.length; i++) {
      const { citation, index } = needsS2[i];
      onProgress?.("s2-verify", i + 1, needsS2.length, citation.title.slice(0, 40));

      const result = await searchByTitle(citation.title, citation.authors);
      s2Results.set(index, result);

      // If S2 found a DOI we didn't have, add it
      if (result.found && result.doi && !citation.doi) {
        citations[index] = { ...citation, doi: result.doi };
      }

      // Rate limit: S2 allows 100 req/5min without API key
      if (i < needsS2.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  // ── Stage 4: Check for duplicates ──
  const dupResults: Map<number, DuplicateCheckResult> = new Map();
  if (checkDuplicates) {
    for (let i = 0; i < citations.length; i++) {
      onProgress?.("duplicates", i + 1, citations.length);
      const result = await checkDuplicate(citations[i], libraryID);
      if (result.isDuplicate) {
        dupResults.set(i, result);
      }
    }
  }

  // ── Stage 5: Score confidence ──
  const confidenceScores: Map<number, ConfidenceScore> = new Map();
  for (let i = 0; i < citations.length; i++) {
    const doiResult = doiResults.find((r) => r.doi === citations[i].doi);
    const s2Result = s2Results.get(i);
    const dupResult = dupResults.get(i);
    confidenceScores.set(i, scoreCitation(citations[i], doiResult, s2Result, dupResult));
  }

  // ── Stage 6: Import items ──
  for (let i = 0; i < citations.length; i++) {
    const citation = citations[i];
    onProgress?.("import", i + 1, citations.length, citation.title.slice(0, 40));

    // Skip duplicates if configured
    const dupResult = dupResults.get(i);
    if (skipDuplicates && dupResult?.isDuplicate) {
      results.push({
        zoteroItem: null,
        citation,
        dupResult,
        confidence: confidenceScores.get(i),
        skipped: true,
        skipReason: `Duplicate of "${dupResult.existingTitle}" (${dupResult.matchType})`,
      });
      continue;
    }

    try {
      const zoteroItem = await importSingleCitation(
        citation,
        libraryID,
        collectionID,
      );

      // Add import tag
      if (importTag) {
        zoteroItem.addTag(importTag, 0);
      }

      // Add confidence tag
      const conf = confidenceScores.get(i);
      if (conf) {
        zoteroItem.addTag(`citegen:${conf.level}`, 1);
      }

      await zoteroItem.saveTx();

      results.push({
        zoteroItem,
        citation,
        doiResult: doiResults.find((r) => r.doi === citation.doi),
        s2Result: s2Results.get(i),
        dupResult,
        confidence: conf,
      });
    } catch (e) {
      Zotero.debug(
        `[CiteGen] Failed to import "${citation.title}": ${(e as Error).message}`,
      );
    }
  }

  const imported = results.filter((r) => !r.skipped);

  // ── Stage 7: Attach reason notes ──
  if (attachReasons) {
    const queryText = query || payload.query;
    for (let i = 0; i < imported.length; i++) {
      const { zoteroItem, citation } = imported[i];
      onProgress?.("notes", i + 1, imported.length);

      if (citation.reason) {
        try {
          await createReasonNote(zoteroItem, citation, queryText);
        } catch (e) {
          Zotero.debug(
            `[CiteGen] Failed to create note for "${citation.title}": ${(e as Error).message}`,
          );
        }
      }
    }
  }

  // ── Stage 8: Link related items ──
  if (linkRelated && imported.length > 1) {
    onProgress?.("linking", 0, 1, "Linking related items...");
    try {
      await linkRelatedItems(imported);
    } catch (e) {
      Zotero.debug(`[CiteGen] Failed to link related items: ${(e as Error).message}`);
    }
  }

  // ── Stage 9: Create literature map ──
  if (createLitMap && imported.length > 0) {
    onProgress?.("litmap", 0, 1, "Creating literature map...");
    try {
      await createLiteratureMapNote(
        imported,
        query || payload.query,
        libraryID,
        collectionID,
      );
    } catch (e) {
      Zotero.debug(`[CiteGen] Failed to create lit map: ${(e as Error).message}`);
    }
  }

  return results;
}
