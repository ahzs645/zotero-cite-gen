/**
 * DOI verification via the CrossRef API.
 * Checks that a DOI resolves to a real publication
 * and optionally enriches metadata from the response.
 */

import type { AICitation } from "./json-parser";

export interface DOIVerificationResult {
  doi: string;
  valid: boolean;
  /** Enriched metadata from CrossRef if found */
  crossrefTitle?: string;
  crossrefAuthors?: string[];
  crossrefYear?: number;
  crossrefJournal?: string;
  message?: string;
}

const CROSSREF_API = "https://api.crossref.org/works/";
const USER_AGENT = "ZoteroCiteGen/1.0 (https://github.com/ahmadjalil/zotero-cite-gen; mailto:cite-gen@zotero.org)";

/**
 * Verify a single DOI against CrossRef.
 */
export async function verifyDOI(doi: string): Promise<DOIVerificationResult> {
  if (!doi) {
    return { doi: "", valid: false, message: "No DOI provided" };
  }

  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();

  try {
    const response = await Zotero.HTTP.request("GET", CROSSREF_API + encodeURIComponent(cleanDoi), {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      responseType: "json",
      timeout: 10000,
    });

    if (response.status === 200) {
      const data =
        typeof response.response === "string"
          ? JSON.parse(response.response)
          : response.response;

      const work = data?.message;
      if (!work) {
        return { doi: cleanDoi, valid: false, message: "DOI resolved but returned empty data" };
      }

      return {
        doi: cleanDoi,
        valid: true,
        crossrefTitle: work.title?.[0],
        crossrefAuthors: work.author?.map(
          (a: any) => `${a.given || ""} ${a.family || ""}`.trim(),
        ),
        crossrefYear:
          work.published?.["date-parts"]?.[0]?.[0] ||
          work["published-print"]?.["date-parts"]?.[0]?.[0] ||
          work.created?.["date-parts"]?.[0]?.[0],
        crossrefJournal: work["container-title"]?.[0],
      };
    }

    return {
      doi: cleanDoi,
      valid: false,
      message: `CrossRef returned status ${response.status}`,
    };
  } catch (e) {
    return {
      doi: cleanDoi,
      valid: false,
      message: `Verification failed: ${(e as Error).message}`,
    };
  }
}

/**
 * Verify DOIs for an array of citations.
 * Adds a small delay between requests to respect CrossRef rate limits.
 */
export async function verifyAllDOIs(
  citations: AICitation[],
  onProgress?: (current: number, total: number, result: DOIVerificationResult) => void,
): Promise<DOIVerificationResult[]> {
  const results: DOIVerificationResult[] = [];
  const withDOI = citations.filter((c) => c.doi);

  for (let i = 0; i < withDOI.length; i++) {
    const result = await verifyDOI(withDOI[i].doi!);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, withDOI.length, result);
    }

    // Rate limit: CrossRef polite pool allows ~50 req/s with good User-Agent,
    // but let's be conservative
    if (i < withDOI.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * Enrich a citation with CrossRef data where the AI may have been inaccurate.
 * Only overwrites fields that CrossRef has better data for.
 */
export function enrichFromCrossRef(
  citation: AICitation,
  verification: DOIVerificationResult,
): AICitation {
  if (!verification.valid) return citation;

  const enriched = { ...citation };

  // Trust CrossRef for title if it's substantially different (AI may have paraphrased)
  if (verification.crossrefTitle) {
    enriched.title = verification.crossrefTitle;
  }

  // Trust CrossRef for journal name
  if (verification.crossrefJournal && !enriched.journal) {
    enriched.journal = verification.crossrefJournal;
  }

  // Trust CrossRef for year
  if (verification.crossrefYear && !enriched.year) {
    enriched.year = verification.crossrefYear;
  }

  // Trust CrossRef for authors if AI gave none
  if (
    verification.crossrefAuthors &&
    verification.crossrefAuthors.length > 0 &&
    enriched.authors.length === 0
  ) {
    enriched.authors = verification.crossrefAuthors;
  }

  return enriched;
}
