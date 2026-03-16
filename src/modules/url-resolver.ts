/**
 * URL metadata resolver: extracts citation metadata from URLs
 * that don't have DOIs. Handles:
 *  - arXiv URLs → arXiv API
 *  - General URLs → HTML meta tags (OpenGraph, citation_* meta)
 *  - Fallback → basic URL info
 */

import type { AICitation } from "./json-parser";

/**
 * Resolve metadata from a URL, returning an enriched citation.
 */
export async function resolveURL(
  citation: AICitation,
): Promise<AICitation> {
  const url = citation.url;
  if (!url) return citation;

  // Try arXiv first
  const arxivMatch = url.match(
    /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i,
  );
  if (arxivMatch) {
    return resolveArxiv(citation, arxivMatch[1]);
  }

  // Try HTML meta tag extraction
  return resolveHTMLMeta(citation, url);
}

/**
 * Resolve metadata from arXiv via their API.
 */
async function resolveArxiv(
  citation: AICitation,
  arxivId: string,
): Promise<AICitation> {
  try {
    const response = await Zotero.HTTP.request(
      "GET",
      `https://export.arxiv.org/api/query?id_list=${arxivId}`,
      { timeout: 10000 },
    );

    if (response.status !== 200) return citation;

    const xml = response.responseText;
    const enriched = { ...citation };

    // Parse the Atom XML response
    const getTag = (tag: string): string | undefined => {
      const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return match ? match[1].trim() : undefined;
    };

    const getAllTags = (tag: string): string[] => {
      const matches = xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"));
      return Array.from(matches).map((m) => m[1].trim());
    };

    // Extract entry data (skip the feed-level title)
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) return citation;
    const entry = entryMatch[1];

    const getEntryTag = (tag: string): string | undefined => {
      const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return match ? match[1].trim() : undefined;
    };

    // Title
    const title = getEntryTag("title");
    if (title && !enriched.title) {
      enriched.title = title.replace(/\s+/g, " ");
    }

    // Abstract
    const summary = getEntryTag("summary");
    if (summary && !enriched.abstract) {
      enriched.abstract = summary.replace(/\s+/g, " ");
    }

    // Authors
    const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
    const authors = Array.from(authorMatches).map((m) => m[1].trim());
    if (authors.length > 0 && enriched.authors.length === 0) {
      enriched.authors = authors;
    }

    // Year from published date
    const published = getEntryTag("published");
    if (published && !enriched.year) {
      const yearMatch = published.match(/(\d{4})/);
      if (yearMatch) enriched.year = parseInt(yearMatch[1], 10);
    }

    // DOI from arxiv entry (sometimes present in <link> or <arxiv:doi>)
    const doiMatch = entry.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/);
    if (doiMatch && !enriched.doi) {
      enriched.doi = doiMatch[1].trim();
    }

    // Set itemType to preprint for arXiv
    if (!citation.itemType || citation.itemType === "journalArticle") {
      enriched.itemType = "preprint";
    }

    // Set URL to the abstract page
    if (!enriched.url) {
      enriched.url = `https://arxiv.org/abs/${arxivId}`;
    }

    return enriched;
  } catch (e) {
    Zotero.debug(
      `[CiteGen] arXiv resolution failed for ${arxivId}: ${(e as Error).message}`,
    );
    return citation;
  }
}

/**
 * Resolve metadata from a generic URL by reading HTML meta tags.
 * Looks for:
 *  - OpenGraph: og:title, og:description, og:type
 *  - Citation meta: citation_title, citation_author, citation_date,
 *    citation_doi, citation_journal_title
 *  - Dublin Core: DC.title, DC.creator, DC.date
 */
async function resolveHTMLMeta(
  citation: AICitation,
  url: string,
): Promise<AICitation> {
  try {
    const response = await Zotero.HTTP.request("GET", url, {
      timeout: 15000,
    });

    if (response.status !== 200) return citation;

    const html = response.responseText;
    const enriched = { ...citation };

    // Helper to get meta content by name or property
    const getMeta = (attr: string, value: string): string | undefined => {
      const pattern = new RegExp(
        `<meta\\s+(?:[^>]*\\s)?${attr}=["']${value.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}["'][^>]*content=["']([^"']*?)["']|<meta\\s+(?:[^>]*\\s)?content=["']([^"']*?)["'][^>]*${attr}=["']${value.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}["']`,
        "i",
      );
      const match = html.match(pattern);
      return match ? (match[1] || match[2])?.trim() : undefined;
    };

    const getAllMeta = (attr: string, value: string): string[] => {
      const pattern = new RegExp(
        `<meta\\s+(?:[^>]*\\s)?${attr}=["']${value.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}["'][^>]*content=["']([^"']*?)["']|<meta\\s+(?:[^>]*\\s)?content=["']([^"']*?)["'][^>]*${attr}=["']${value.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}["']`,
        "gi",
      );
      return Array.from(html.matchAll(pattern)).map(
        (m) => (m[1] || m[2])?.trim() || "",
      ).filter(Boolean);
    };

    // Title: citation_title > og:title > DC.title > <title>
    if (!enriched.title || enriched.title === url) {
      enriched.title =
        getMeta("name", "citation_title") ||
        getMeta("property", "og:title") ||
        getMeta("name", "DC.title") ||
        html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ||
        enriched.title;
    }

    // Authors
    if (enriched.authors.length === 0) {
      const citationAuthors = getAllMeta("name", "citation_author");
      if (citationAuthors.length > 0) {
        enriched.authors = citationAuthors;
      } else {
        const dcCreators = getAllMeta("name", "DC.creator");
        if (dcCreators.length > 0) {
          enriched.authors = dcCreators;
        }
      }
    }

    // DOI
    if (!enriched.doi) {
      const doi =
        getMeta("name", "citation_doi") || getMeta("name", "DC.identifier");
      if (doi && doi.match(/10\.\d{4,}/)) {
        enriched.doi = doi.replace(/^https?:\/\/doi\.org\//i, "");
      }
    }

    // Date / Year
    if (!enriched.year) {
      const dateStr =
        getMeta("name", "citation_date") ||
        getMeta("name", "citation_publication_date") ||
        getMeta("name", "DC.date");
      if (dateStr) {
        const yearMatch = dateStr.match(/(\d{4})/);
        if (yearMatch) enriched.year = parseInt(yearMatch[1], 10);
      }
    }

    // Journal
    if (!enriched.journal) {
      enriched.journal =
        getMeta("name", "citation_journal_title") ||
        getMeta("property", "og:site_name") ||
        undefined;
    }

    // Abstract
    if (!enriched.abstract) {
      enriched.abstract =
        getMeta("name", "citation_abstract") ||
        getMeta("name", "description") ||
        getMeta("property", "og:description") ||
        getMeta("name", "DC.description") ||
        undefined;
    }

    // Volume, Issue, Pages
    if (!enriched.volume) {
      enriched.volume = getMeta("name", "citation_volume");
    }
    if (!enriched.issue) {
      enriched.issue = getMeta("name", "citation_issue");
    }
    if (!enriched.pages) {
      const firstPage = getMeta("name", "citation_firstpage");
      const lastPage = getMeta("name", "citation_lastpage");
      if (firstPage) {
        enriched.pages = lastPage
          ? `${firstPage}-${lastPage}`
          : firstPage;
      }
    }

    // If it's a webpage with no scholarly metadata, set type
    if (
      !getMeta("name", "citation_title") &&
      (!enriched.itemType || enriched.itemType === "journalArticle")
    ) {
      enriched.itemType = "webpage";
    }

    return enriched;
  } catch (e) {
    Zotero.debug(
      `[CiteGen] HTML meta resolution failed for ${url}: ${(e as Error).message}`,
    );
    return citation;
  }
}

/**
 * Resolve metadata for all citations that lack DOIs.
 */
export async function resolveAllURLs(
  citations: AICitation[],
  onProgress?: (current: number, total: number) => void,
): Promise<AICitation[]> {
  const needsResolution = citations.filter((c) => !c.doi && c.url);
  const resolved = new Map<number, AICitation>();

  for (let i = 0; i < needsResolution.length; i++) {
    const idx = citations.indexOf(needsResolution[i]);
    const enriched = await resolveURL(needsResolution[i]);
    resolved.set(idx, enriched);
    onProgress?.(i + 1, needsResolution.length);

    // Small delay between requests
    if (i < needsResolution.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return citations.map((c, i) => resolved.get(i) || c);
}
