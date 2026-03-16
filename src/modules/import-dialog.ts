/**
 * Import dialog controller: bridges the XHTML dialog UI
 * with the importer pipeline.
 */

import { parseAICitationJSON, validatePayload } from "./json-parser";
import type { AIImportPayload } from "./json-parser";
import { verifyDOI } from "./doi-verify";
import type { DOIVerificationResult } from "./doi-verify";
import { importCitations } from "./importer";
import type { ImportResult, ImportOptions } from "./importer";

export class ImportDialogController {
  private payload: AIImportPayload | null = null;
  private doiResults: Map<string, DOIVerificationResult> = new Map();

  /**
   * Parse pasted JSON text and return preview data.
   */
  parseInput(raw: string): {
    success: boolean;
    payload?: AIImportPayload;
    warnings?: string[];
    error?: string;
  } {
    try {
      const payload = parseAICitationJSON(raw);
      const warnings = validatePayload(payload);
      this.payload = payload;
      return { success: true, payload, warnings };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Verify all DOIs in the current payload (standalone, for the Verify button).
   */
  async verifyDOIs(
    onProgress: (current: number, total: number, result: DOIVerificationResult) => void,
  ): Promise<DOIVerificationResult[]> {
    if (!this.payload) throw new Error("No citations parsed yet");

    const withDOI = this.payload.citations.filter((c) => c.doi);
    const results: DOIVerificationResult[] = [];

    for (let i = 0; i < withDOI.length; i++) {
      const result = await verifyDOI(withDOI[i].doi!);
      this.doiResults.set(withDOI[i].doi!, result);
      results.push(result);
      onProgress(i + 1, withDOI.length, result);

      if (i < withDOI.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return results;
  }

  /**
   * Run the full import pipeline into Zotero.
   * Accepts all pipeline options from the dialog checkboxes.
   */
  async runImport(
    options: Partial<ImportOptions>,
    onProgress: (stage: string, current: number, total: number, detail?: string) => void,
  ): Promise<ImportResult[]> {
    if (!this.payload) throw new Error("No citations parsed yet");

    // Merge dialog options with preference defaults
    const mergedOptions: ImportOptions = {
      libraryID: options.libraryID,
      verifyDOIs: options.verifyDOIs ?? getPref("verifyDOI"),
      useSemanticScholar: options.useSemanticScholar ?? true,
      resolveURLs: options.resolveURLs ?? true,
      checkDuplicates: options.checkDuplicates ?? true,
      skipDuplicates: options.skipDuplicates ?? false,
      attachReasons: options.attachReasons ?? getPref("attachReason"),
      linkRelated: options.linkRelated ?? false,
      createLitMap: options.createLitMap ?? true,
      importTag: options.importTag ??
        (getPref("tagImported") ? (getPref("importTag") as string) : undefined),
      collectionID: options.collectionID,
      query: this.payload.query,
      onProgress,
    };

    return importCitations(this.payload, mergedOptions);
  }

  getPayload(): AIImportPayload | null {
    return this.payload;
  }
}

function getPref(key: string): any {
  try {
    return Zotero.Prefs.get(`extensions.zotero.citegen.${key}`, true);
  } catch {
    // Defaults if prefs not available
    const defaults: Record<string, any> = {
      verifyDOI: true,
      attachReason: true,
      tagImported: false,
      importTag: "",
    };
    return defaults[key];
  }
}
