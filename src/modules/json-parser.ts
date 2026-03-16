/**
 * Parses AI-generated citation JSON into a normalized format
 * that can be imported into Zotero.
 */

export interface AICitation {
  title: string;
  authors: string[];
  year?: number;
  itemType?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  reason?: string;
  publisher?: string;
  place?: string;
  isbn?: string;
  bookTitle?: string;
  conferenceName?: string;
  university?: string;
}

export interface AIImportPayload {
  query?: string;
  context?: string;
  citations: AICitation[];
}

/** Zotero itemType mapping from friendly names */
const ITEM_TYPE_MAP: Record<string, string> = {
  journalarticle: "journalArticle",
  "journal-article": "journalArticle",
  article: "journalArticle",
  book: "book",
  booksection: "bookSection",
  "book-section": "bookSection",
  chapter: "bookSection",
  conferencepaper: "conferencePaper",
  "conference-paper": "conferencePaper",
  report: "report",
  thesis: "thesis",
  webpage: "webpage",
  "web-page": "webpage",
  preprint: "preprint",
  manuscript: "manuscript",
  patent: "patent",
};

/**
 * Parse raw text input into a structured import payload.
 * Handles:
 *  - Direct JSON array: [{...}, {...}]
 *  - Envelope JSON: { "citations": [...], "query": "..." }
 *  - JSON wrapped in markdown code fences
 */
export function parseAICitationJSON(raw: string): AIImportPayload {
  const cleaned = stripMarkdownFences(raw.trim());

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(
      `Invalid JSON: ${(e as Error).message}. Make sure the AI output is valid JSON.`,
    );
  }

  // Case 1: Direct array of citations
  if (Array.isArray(parsed)) {
    return {
      citations: parsed.map(normalizeCitation),
    };
  }

  // Case 2: Envelope object with "citations" key
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "citations" in parsed &&
    Array.isArray((parsed as any).citations)
  ) {
    const envelope = parsed as any;
    return {
      query: envelope.query || undefined,
      context: envelope.context || undefined,
      citations: envelope.citations.map(normalizeCitation),
    };
  }

  // Case 3: Single citation object
  if (typeof parsed === "object" && parsed !== null && "title" in parsed) {
    return {
      citations: [normalizeCitation(parsed)],
    };
  }

  throw new Error(
    "Unrecognized JSON format. Expected an array of citations, an object with a 'citations' key, or a single citation object.",
  );
}

/** Strip ```json ... ``` or ``` ... ``` wrappers */
function stripMarkdownFences(text: string): string {
  // Match ```json\n...\n``` or ```\n...\n```
  const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  return text;
}

/** Normalize a single raw citation object into our standard shape */
function normalizeCitation(raw: any): AICitation {
  if (!raw || typeof raw !== "object") {
    throw new Error("Each citation must be an object");
  }

  if (!raw.title || typeof raw.title !== "string") {
    throw new Error(
      `Citation missing required 'title' field: ${JSON.stringify(raw).slice(0, 100)}`,
    );
  }

  // Normalize authors from various formats
  let authors: string[] = [];
  if (Array.isArray(raw.authors)) {
    authors = raw.authors.map((a: any) => {
      if (typeof a === "string") return a;
      if (typeof a === "object" && a !== null) {
        // Handle {"family": "Smith", "given": "John"} (CSL-JSON style)
        if (a.family) return `${a.given || ""} ${a.family}`.trim();
        // Handle {"firstName": "John", "lastName": "Smith"}
        if (a.lastName) return `${a.firstName || ""} ${a.lastName}`.trim();
        // Handle {"name": "John Smith"}
        if (a.name) return a.name;
      }
      return String(a);
    });
  } else if (typeof raw.authors === "string") {
    // Single author as string, or comma/semicolon separated
    authors = raw.authors.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean);
  } else if (Array.isArray(raw.author)) {
    // CSL-JSON uses "author" not "authors"
    authors = raw.author.map((a: any) => {
      if (typeof a === "string") return a;
      if (a.family) return `${a.given || ""} ${a.family}`.trim();
      return String(a);
    });
  }

  // Normalize itemType
  let itemType = "journalArticle"; // default
  if (raw.itemType || raw.type || raw.item_type) {
    const rawType = (raw.itemType || raw.type || raw.item_type || "")
      .toLowerCase()
      .replace(/[\s_-]/g, "");
    itemType = ITEM_TYPE_MAP[rawType] || raw.itemType || "journalArticle";
  }

  // Normalize year
  let year: number | undefined;
  if (raw.year) {
    year = typeof raw.year === "number" ? raw.year : parseInt(raw.year, 10);
    if (year !== undefined && isNaN(year)) year = undefined;
  } else if (raw.date) {
    const match = String(raw.date).match(/(\d{4})/);
    if (match) year = parseInt(match[1], 10);
  } else if (raw.issued?.["date-parts"]?.[0]?.[0]) {
    year = raw.issued["date-parts"][0][0];
  }

  // Normalize DOI - strip URL prefix if present
  let doi: string | undefined = raw.doi || raw.DOI;
  if (doi) {
    doi = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();
    if (!doi) doi = undefined;
  }

  return {
    title: raw.title.trim(),
    authors,
    year,
    itemType,
    journal:
      raw.journal ||
      raw.publicationTitle ||
      raw["container-title"] ||
      raw.journalAbbreviation ||
      undefined,
    volume: raw.volume ? String(raw.volume) : undefined,
    issue: raw.issue ? String(raw.issue) : undefined,
    pages: raw.pages || raw.page || undefined,
    doi,
    url: raw.url || raw.URL || undefined,
    abstract: raw.abstract || raw.abstractNote || undefined,
    reason: raw.reason || raw.relevance || raw.note || undefined,
    publisher: raw.publisher || undefined,
    place: raw.place || raw["publisher-place"] || undefined,
    isbn: raw.isbn || raw.ISBN || undefined,
    bookTitle: raw.bookTitle || raw["container-title"] || undefined,
    conferenceName:
      raw.conferenceName || raw["event-title"] || raw.conference || undefined,
    university: raw.university || raw.school || undefined,
  };
}

/**
 * Validate that the payload looks reasonable.
 * Returns an array of warning messages (empty = all good).
 */
export function validatePayload(payload: AIImportPayload): string[] {
  const warnings: string[] = [];

  if (payload.citations.length === 0) {
    warnings.push("No citations found in the input.");
  }

  for (let i = 0; i < payload.citations.length; i++) {
    const c = payload.citations[i];
    if (c.authors.length === 0) {
      warnings.push(`Citation ${i + 1} ("${c.title.slice(0, 50)}"): no authors`);
    }
    if (!c.year) {
      warnings.push(`Citation ${i + 1} ("${c.title.slice(0, 50)}"): no year`);
    }
    if (!c.doi && !c.url) {
      warnings.push(
        `Citation ${i + 1} ("${c.title.slice(0, 50)}"): no DOI or URL — verification not possible`,
      );
    }
  }

  return warnings;
}
