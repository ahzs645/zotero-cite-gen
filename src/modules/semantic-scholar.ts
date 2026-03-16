/**
 * Semantic Scholar API fallback for verifying citations
 * when no DOI is available. Searches by title + authors.
 *
 * API docs: https://api.semanticscholar.org/api-docs/
 */

export interface SemanticScholarResult {
  found: boolean;
  paperId?: string;
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  url?: string;
  citationCount?: number;
  abstract?: string;
  venue?: string;
  message?: string;
}

const S2_API = "https://api.semanticscholar.org/graph/v1";
const S2_FIELDS =
  "paperId,title,authors,year,externalIds,url,citationCount,abstract,venue";

/**
 * Search Semantic Scholar by title to verify a citation exists.
 * Returns the best matching result.
 */
export async function searchByTitle(
  title: string,
  authors?: string[],
): Promise<SemanticScholarResult> {
  if (!title) {
    return { found: false, message: "No title provided" };
  }

  try {
    // Use the paper search endpoint with the title
    const query = encodeURIComponent(title);
    const response = await Zotero.HTTP.request(
      "GET",
      `${S2_API}/paper/search?query=${query}&limit=5&fields=${S2_FIELDS}`,
      {
        headers: { Accept: "application/json" },
        responseType: "json",
        timeout: 10000,
      },
    );

    if (response.status !== 200) {
      return {
        found: false,
        message: `Semantic Scholar returned status ${response.status}`,
      };
    }

    const data =
      typeof response.response === "string"
        ? JSON.parse(response.response)
        : response.response;

    if (!data?.data || data.data.length === 0) {
      return { found: false, message: "No results found on Semantic Scholar" };
    }

    // Find best match by comparing titles
    const best = findBestMatch(title, authors, data.data);
    if (!best) {
      return {
        found: false,
        message: "Results found but none closely matched the title",
      };
    }

    return {
      found: true,
      paperId: best.paperId,
      title: best.title,
      authors: best.authors?.map(
        (a: any) => a.name || `${a.given || ""} ${a.family || ""}`.trim(),
      ),
      year: best.year,
      doi: best.externalIds?.DOI || undefined,
      url: best.url,
      citationCount: best.citationCount,
      abstract: best.abstract,
      venue: best.venue,
    };
  } catch (e) {
    return {
      found: false,
      message: `Semantic Scholar lookup failed: ${(e as Error).message}`,
    };
  }
}

/**
 * Look up a paper directly by DOI on Semantic Scholar.
 * Useful for getting citation counts and other enrichment data.
 */
export async function lookupByDOI(
  doi: string,
): Promise<SemanticScholarResult> {
  try {
    const response = await Zotero.HTTP.request(
      "GET",
      `${S2_API}/paper/DOI:${encodeURIComponent(doi)}?fields=${S2_FIELDS}`,
      {
        headers: { Accept: "application/json" },
        responseType: "json",
        timeout: 10000,
      },
    );

    if (response.status !== 200) {
      return { found: false, message: `Status ${response.status}` };
    }

    const paper =
      typeof response.response === "string"
        ? JSON.parse(response.response)
        : response.response;

    return {
      found: true,
      paperId: paper.paperId,
      title: paper.title,
      authors: paper.authors?.map((a: any) => a.name),
      year: paper.year,
      doi: paper.externalIds?.DOI,
      url: paper.url,
      citationCount: paper.citationCount,
      abstract: paper.abstract,
      venue: paper.venue,
    };
  } catch (e) {
    return {
      found: false,
      message: `DOI lookup failed: ${(e as Error).message}`,
    };
  }
}

/**
 * Find the result whose title best matches the query.
 * Uses normalized Jaccard similarity on word sets.
 */
function findBestMatch(
  queryTitle: string,
  queryAuthors: string[] | undefined,
  results: any[],
): any | null {
  const queryWords = normalizeTitle(queryTitle);

  let bestScore = 0;
  let bestResult = null;

  for (const result of results) {
    if (!result.title) continue;

    const resultWords = normalizeTitle(result.title);

    // Jaccard similarity on word sets
    const intersection = queryWords.filter((w) => resultWords.includes(w));
    const union = new Set([...queryWords, ...resultWords]);
    let score = intersection.length / union.size;

    // Boost if authors match
    if (queryAuthors && queryAuthors.length > 0 && result.authors) {
      const resultAuthorNames = result.authors.map((a: any) =>
        (a.name || "").toLowerCase(),
      );
      const matchingAuthors = queryAuthors.filter((qa) => {
        const qaLower = qa.toLowerCase();
        return resultAuthorNames.some(
          (ra: string) =>
            ra.includes(qaLower.split(" ").pop()!) ||
            qaLower.includes(ra.split(" ").pop()!),
        );
      });
      if (matchingAuthors.length > 0) {
        score += 0.2 * (matchingAuthors.length / queryAuthors.length);
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }

  // Require at least 50% word overlap to count as a match
  return bestScore >= 0.5 ? bestResult : null;
}

function normalizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2); // skip short words like "a", "of", "in"
}
