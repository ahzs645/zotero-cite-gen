"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/modules/doi-verify.ts
  var doi_verify_exports = {};
  __export(doi_verify_exports, {
    enrichFromCrossRef: () => enrichFromCrossRef,
    verifyAllDOIs: () => verifyAllDOIs,
    verifyDOI: () => verifyDOI
  });
  async function verifyDOI(doi) {
    if (!doi) {
      return { doi: "", valid: false, message: "No DOI provided" };
    }
    const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();
    try {
      const response = await Zotero.HTTP.request("GET", CROSSREF_API + encodeURIComponent(cleanDoi), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json"
        },
        responseType: "json",
        timeout: 1e4
      });
      if (response.status === 200) {
        const data = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
        const work = data?.message;
        if (!work) {
          return { doi: cleanDoi, valid: false, message: "DOI resolved but returned empty data" };
        }
        return {
          doi: cleanDoi,
          valid: true,
          crossrefTitle: work.title?.[0],
          crossrefAuthors: work.author?.map(
            (a) => `${a.given || ""} ${a.family || ""}`.trim()
          ),
          crossrefYear: work.published?.["date-parts"]?.[0]?.[0] || work["published-print"]?.["date-parts"]?.[0]?.[0] || work.created?.["date-parts"]?.[0]?.[0],
          crossrefJournal: work["container-title"]?.[0]
        };
      }
      return {
        doi: cleanDoi,
        valid: false,
        message: `CrossRef returned status ${response.status}`
      };
    } catch (e) {
      return {
        doi: cleanDoi,
        valid: false,
        message: `Verification failed: ${e.message}`
      };
    }
  }
  async function verifyAllDOIs(citations, onProgress) {
    const results = [];
    const withDOI = citations.filter((c) => c.doi);
    for (let i = 0; i < withDOI.length; i++) {
      const result = await verifyDOI(withDOI[i].doi);
      results.push(result);
      if (onProgress) {
        onProgress(i + 1, withDOI.length, result);
      }
      if (i < withDOI.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    return results;
  }
  function enrichFromCrossRef(citation, verification) {
    if (!verification.valid) return citation;
    const enriched = { ...citation };
    if (verification.crossrefTitle) {
      enriched.title = verification.crossrefTitle;
    }
    if (verification.crossrefJournal && !enriched.journal) {
      enriched.journal = verification.crossrefJournal;
    }
    if (verification.crossrefYear && !enriched.year) {
      enriched.year = verification.crossrefYear;
    }
    if (verification.crossrefAuthors && verification.crossrefAuthors.length > 0 && enriched.authors.length === 0) {
      enriched.authors = verification.crossrefAuthors;
    }
    return enriched;
  }
  var CROSSREF_API, USER_AGENT;
  var init_doi_verify = __esm({
    "src/modules/doi-verify.ts"() {
      "use strict";
      CROSSREF_API = "https://api.crossref.org/works/";
      USER_AGENT = "ZoteroCiteGen/1.0 (https://github.com/ahmadjalil/zotero-cite-gen; mailto:cite-gen@zotero.org)";
    }
  });

  // src/modules/json-parser.ts
  var ITEM_TYPE_MAP = {
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
    patent: "patent"
  };
  function parseAICitationJSON(raw) {
    const cleaned = stripMarkdownFences(raw.trim());
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(
        `Invalid JSON: ${e.message}. Make sure the AI output is valid JSON.`
      );
    }
    if (Array.isArray(parsed)) {
      return {
        citations: parsed.map(normalizeCitation)
      };
    }
    if (typeof parsed === "object" && parsed !== null && "citations" in parsed && Array.isArray(parsed.citations)) {
      const envelope = parsed;
      return {
        query: envelope.query || void 0,
        context: envelope.context || void 0,
        citations: envelope.citations.map(normalizeCitation)
      };
    }
    if (typeof parsed === "object" && parsed !== null && "title" in parsed) {
      return {
        citations: [normalizeCitation(parsed)]
      };
    }
    throw new Error(
      "Unrecognized JSON format. Expected an array of citations, an object with a 'citations' key, or a single citation object."
    );
  }
  function stripMarkdownFences(text) {
    const fenceMatch = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
    if (fenceMatch) {
      return fenceMatch[1].trim();
    }
    return text;
  }
  function normalizeCitation(raw) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Each citation must be an object");
    }
    if (!raw.title || typeof raw.title !== "string") {
      throw new Error(
        `Citation missing required 'title' field: ${JSON.stringify(raw).slice(0, 100)}`
      );
    }
    let authors = [];
    if (Array.isArray(raw.authors)) {
      authors = raw.authors.map((a) => {
        if (typeof a === "string") return a;
        if (typeof a === "object" && a !== null) {
          if (a.family) return `${a.given || ""} ${a.family}`.trim();
          if (a.lastName) return `${a.firstName || ""} ${a.lastName}`.trim();
          if (a.name) return a.name;
        }
        return String(a);
      });
    } else if (typeof raw.authors === "string") {
      authors = raw.authors.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(raw.author)) {
      authors = raw.author.map((a) => {
        if (typeof a === "string") return a;
        if (a.family) return `${a.given || ""} ${a.family}`.trim();
        return String(a);
      });
    }
    let itemType = "journalArticle";
    if (raw.itemType || raw.type || raw.item_type) {
      const rawType = (raw.itemType || raw.type || raw.item_type || "").toLowerCase().replace(/[\s_-]/g, "");
      itemType = ITEM_TYPE_MAP[rawType] || raw.itemType || "journalArticle";
    }
    let year;
    if (raw.year) {
      year = typeof raw.year === "number" ? raw.year : parseInt(raw.year, 10);
      if (isNaN(year)) year = void 0;
    } else if (raw.date) {
      const match = String(raw.date).match(/(\d{4})/);
      if (match) year = parseInt(match[1], 10);
    } else if (raw.issued?.["date-parts"]?.[0]?.[0]) {
      year = raw.issued["date-parts"][0][0];
    }
    let doi = raw.doi || raw.DOI;
    if (doi) {
      doi = doi.replace(/^https?:\/\/doi\.org\//i, "").trim();
      if (!doi) doi = void 0;
    }
    return {
      title: raw.title.trim(),
      authors,
      year,
      itemType,
      journal: raw.journal || raw.publicationTitle || raw["container-title"] || raw.journalAbbreviation || void 0,
      volume: raw.volume ? String(raw.volume) : void 0,
      issue: raw.issue ? String(raw.issue) : void 0,
      pages: raw.pages || raw.page || void 0,
      doi,
      url: raw.url || raw.URL || void 0,
      abstract: raw.abstract || raw.abstractNote || void 0,
      reason: raw.reason || raw.relevance || raw.note || void 0,
      publisher: raw.publisher || void 0,
      place: raw.place || raw["publisher-place"] || void 0,
      isbn: raw.isbn || raw.ISBN || void 0,
      bookTitle: raw.bookTitle || raw["container-title"] || void 0,
      conferenceName: raw.conferenceName || raw["event-title"] || raw.conference || void 0,
      university: raw.university || raw.school || void 0
    };
  }
  function validatePayload(payload) {
    const warnings = [];
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
          `Citation ${i + 1} ("${c.title.slice(0, 50)}"): no DOI or URL \u2014 verification not possible`
        );
      }
    }
    return warnings;
  }

  // src/modules/import-dialog.ts
  init_doi_verify();

  // src/modules/importer.ts
  init_doi_verify();

  // src/modules/semantic-scholar.ts
  var S2_API = "https://api.semanticscholar.org/graph/v1";
  var S2_FIELDS = "paperId,title,authors,year,externalIds,url,citationCount,abstract,venue";
  async function searchByTitle(title, authors) {
    if (!title) {
      return { found: false, message: "No title provided" };
    }
    try {
      const query = encodeURIComponent(title);
      const response = await Zotero.HTTP.request(
        "GET",
        `${S2_API}/paper/search?query=${query}&limit=5&fields=${S2_FIELDS}`,
        {
          headers: { Accept: "application/json" },
          responseType: "json",
          timeout: 1e4
        }
      );
      if (response.status !== 200) {
        return {
          found: false,
          message: `Semantic Scholar returned status ${response.status}`
        };
      }
      const data = typeof response.response === "string" ? JSON.parse(response.response) : response.response;
      if (!data?.data || data.data.length === 0) {
        return { found: false, message: "No results found on Semantic Scholar" };
      }
      const best = findBestMatch(title, authors, data.data);
      if (!best) {
        return {
          found: false,
          message: "Results found but none closely matched the title"
        };
      }
      return {
        found: true,
        paperId: best.paperId,
        title: best.title,
        authors: best.authors?.map(
          (a) => a.name || `${a.given || ""} ${a.family || ""}`.trim()
        ),
        year: best.year,
        doi: best.externalIds?.DOI || void 0,
        url: best.url,
        citationCount: best.citationCount,
        abstract: best.abstract,
        venue: best.venue
      };
    } catch (e) {
      return {
        found: false,
        message: `Semantic Scholar lookup failed: ${e.message}`
      };
    }
  }
  function findBestMatch(queryTitle, queryAuthors, results) {
    const queryWords = normalizeTitle(queryTitle);
    let bestScore = 0;
    let bestResult = null;
    for (const result of results) {
      if (!result.title) continue;
      const resultWords = normalizeTitle(result.title);
      const intersection = queryWords.filter((w) => resultWords.includes(w));
      const union = /* @__PURE__ */ new Set([...queryWords, ...resultWords]);
      let score = intersection.length / union.size;
      if (queryAuthors && queryAuthors.length > 0 && result.authors) {
        const resultAuthorNames = result.authors.map(
          (a) => (a.name || "").toLowerCase()
        );
        const matchingAuthors = queryAuthors.filter((qa) => {
          const qaLower = qa.toLowerCase();
          return resultAuthorNames.some(
            (ra) => ra.includes(qaLower.split(" ").pop()) || qaLower.includes(ra.split(" ").pop())
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
    return bestScore >= 0.5 ? bestResult : null;
  }
  function normalizeTitle(title) {
    return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
  }

  // src/modules/url-resolver.ts
  async function resolveURL(citation) {
    const url = citation.url;
    if (!url) return citation;
    const arxivMatch = url.match(
      /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i
    );
    if (arxivMatch) {
      return resolveArxiv(citation, arxivMatch[1]);
    }
    return resolveHTMLMeta(citation, url);
  }
  async function resolveArxiv(citation, arxivId) {
    try {
      const response = await Zotero.HTTP.request(
        "GET",
        `https://export.arxiv.org/api/query?id_list=${arxivId}`,
        { timeout: 1e4 }
      );
      if (response.status !== 200) return citation;
      const xml = response.responseText;
      const enriched = { ...citation };
      const getTag = (tag) => {
        const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return match ? match[1].trim() : void 0;
      };
      const getAllTags = (tag) => {
        const matches = xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"));
        return Array.from(matches).map((m) => m[1].trim());
      };
      const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
      if (!entryMatch) return citation;
      const entry = entryMatch[1];
      const getEntryTag = (tag) => {
        const match = entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return match ? match[1].trim() : void 0;
      };
      const title = getEntryTag("title");
      if (title && !enriched.title) {
        enriched.title = title.replace(/\s+/g, " ");
      }
      const summary = getEntryTag("summary");
      if (summary && !enriched.abstract) {
        enriched.abstract = summary.replace(/\s+/g, " ");
      }
      const authorMatches = entry.matchAll(/<author>\s*<name>([^<]+)<\/name>/g);
      const authors = Array.from(authorMatches).map((m) => m[1].trim());
      if (authors.length > 0 && enriched.authors.length === 0) {
        enriched.authors = authors;
      }
      const published = getEntryTag("published");
      if (published && !enriched.year) {
        const yearMatch = published.match(/(\d{4})/);
        if (yearMatch) enriched.year = parseInt(yearMatch[1], 10);
      }
      const doiMatch = entry.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/);
      if (doiMatch && !enriched.doi) {
        enriched.doi = doiMatch[1].trim();
      }
      if (!citation.itemType || citation.itemType === "journalArticle") {
        enriched.itemType = "preprint";
      }
      if (!enriched.url) {
        enriched.url = `https://arxiv.org/abs/${arxivId}`;
      }
      return enriched;
    } catch (e) {
      Zotero.debug(
        `[CiteGen] arXiv resolution failed for ${arxivId}: ${e.message}`
      );
      return citation;
    }
  }
  async function resolveHTMLMeta(citation, url) {
    try {
      const response = await Zotero.HTTP.request("GET", url, {
        timeout: 15e3
      });
      if (response.status !== 200) return citation;
      const html = response.responseText;
      const enriched = { ...citation };
      const getMeta = (attr, value) => {
        const pattern = new RegExp(
          `<meta\\s+(?:[^>]*\\s)?${attr}=["']${value.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}["'][^>]*content=["']([^"']*?)["']|<meta\\s+(?:[^>]*\\s)?content=["']([^"']*?)["'][^>]*${attr}=["']${value.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}["']`,
          "i"
        );
        const match = html.match(pattern);
        return match ? (match[1] || match[2])?.trim() : void 0;
      };
      const getAllMeta = (attr, value) => {
        const pattern = new RegExp(
          `<meta\\s+(?:[^>]*\\s)?${attr}=["']${value.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}["'][^>]*content=["']([^"']*?)["']|<meta\\s+(?:[^>]*\\s)?content=["']([^"']*?)["'][^>]*${attr}=["']${value.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          )}["']`,
          "gi"
        );
        return Array.from(html.matchAll(pattern)).map(
          (m) => (m[1] || m[2])?.trim() || ""
        ).filter(Boolean);
      };
      if (!enriched.title || enriched.title === url) {
        enriched.title = getMeta("name", "citation_title") || getMeta("property", "og:title") || getMeta("name", "DC.title") || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || enriched.title;
      }
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
      if (!enriched.doi) {
        const doi = getMeta("name", "citation_doi") || getMeta("name", "DC.identifier");
        if (doi && doi.match(/10\.\d{4,}/)) {
          enriched.doi = doi.replace(/^https?:\/\/doi\.org\//i, "");
        }
      }
      if (!enriched.year) {
        const dateStr = getMeta("name", "citation_date") || getMeta("name", "citation_publication_date") || getMeta("name", "DC.date");
        if (dateStr) {
          const yearMatch = dateStr.match(/(\d{4})/);
          if (yearMatch) enriched.year = parseInt(yearMatch[1], 10);
        }
      }
      if (!enriched.journal) {
        enriched.journal = getMeta("name", "citation_journal_title") || getMeta("property", "og:site_name") || void 0;
      }
      if (!enriched.abstract) {
        enriched.abstract = getMeta("name", "citation_abstract") || getMeta("name", "description") || getMeta("property", "og:description") || getMeta("name", "DC.description") || void 0;
      }
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
          enriched.pages = lastPage ? `${firstPage}-${lastPage}` : firstPage;
        }
      }
      if (!getMeta("name", "citation_title") && (!enriched.itemType || enriched.itemType === "journalArticle")) {
        enriched.itemType = "webpage";
      }
      return enriched;
    } catch (e) {
      Zotero.debug(
        `[CiteGen] HTML meta resolution failed for ${url}: ${e.message}`
      );
      return citation;
    }
  }
  async function resolveAllURLs(citations, onProgress) {
    const needsResolution = citations.filter((c) => !c.doi && c.url);
    const resolved = /* @__PURE__ */ new Map();
    for (let i = 0; i < needsResolution.length; i++) {
      const idx = citations.indexOf(needsResolution[i]);
      const enriched = await resolveURL(needsResolution[i]);
      resolved.set(idx, enriched);
      onProgress?.(i + 1, needsResolution.length);
      if (i < needsResolution.length - 1) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    return citations.map((c, i) => resolved.get(i) || c);
  }

  // src/modules/duplicate-detect.ts
  async function checkDuplicate(citation) {
    const libraryID = Zotero.Libraries.userLibraryID;
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
          existingTitle: existing?.getField?.("title") || void 0,
          confidence: 1
        };
      }
    }
    if (citation.title) {
      const s = new Zotero.Search();
      s.libraryID = libraryID;
      s.addCondition("title", "is", citation.title);
      const ids = await s.search();
      if (ids.length > 0) {
        const existing = Zotero.Items.get(ids[0]);
        let confidence = 0.8;
        if (citation.year && existing?.getField?.("date")) {
          const existingYear = String(existing.getField("date")).match(
            /(\d{4})/
          );
          if (existingYear && parseInt(existingYear[1]) === citation.year) {
            confidence = 0.95;
          }
        }
        return {
          isDuplicate: true,
          matchType: citation.year ? "title+year" : "title",
          existingItemID: ids[0],
          existingTitle: existing?.getField?.("title") || void 0,
          confidence
        };
      }
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
            confidence: similarity * 0.9
            // scale down slightly since it's fuzzy
          };
        }
      }
    }
    return { isDuplicate: false, confidence: 0 };
  }
  function titleSimilarity(a, b) {
    const wordsA = new Set(normalize(a));
    const wordsB = new Set(normalize(b));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }
    const union = (/* @__PURE__ */ new Set([...wordsA, ...wordsB])).size;
    return intersection / union;
  }
  function normalize(title) {
    return title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 2);
  }

  // src/modules/confidence.ts
  function scoreCitation(citation, doiResult, s2Result, dupResult) {
    let score = 0;
    const reasons = [];
    if (doiResult?.valid) {
      score += 40;
      reasons.push("DOI verified via CrossRef");
    } else if (citation.doi && doiResult && !doiResult.valid) {
      score -= 20;
      reasons.push("DOI provided but not found on CrossRef");
    }
    if (s2Result?.found) {
      score += 30;
      reasons.push(
        `Found on Semantic Scholar${s2Result.citationCount ? ` (${s2Result.citationCount} citations)` : ""}`
      );
      if (s2Result.citationCount && s2Result.citationCount > 10) {
        score += 5;
      }
      if (s2Result.citationCount && s2Result.citationCount > 100) {
        score += 5;
      }
    }
    if (dupResult?.isDuplicate) {
      score += 15;
      reasons.push("Already exists in your library");
    }
    if (citation.doi) score += 5;
    if (citation.authors.length > 0) score += 5;
    if (citation.year) score += 3;
    if (citation.journal) score += 3;
    if (citation.abstract) score += 2;
    if (citation.volume) score += 1;
    if (citation.pages) score += 1;
    if (citation.year && (citation.year < 1900 || citation.year > (/* @__PURE__ */ new Date()).getFullYear() + 1)) {
      score -= 10;
      reasons.push("Suspicious year");
    }
    if (citation.authors.length === 0) {
      score -= 5;
      reasons.push("No authors listed");
    }
    if (!citation.doi && !citation.url) {
      score -= 10;
      reasons.push("No DOI or URL \u2014 cannot verify");
    }
    score = Math.max(0, Math.min(100, score));
    let level;
    if (score >= 60) {
      level = "high";
    } else if (score >= 35) {
      level = "medium";
    } else if (score > 0) {
      level = "low";
    } else {
      level = "unverified";
    }
    if (reasons.length === 0) {
      reasons.push("No verification data available");
    }
    return { level, score, reasons };
  }

  // src/modules/note-mapper.ts
  async function createReasonNote(parentItem, citation, query) {
    const noteHTML = buildNoteHTML(citation, query);
    const note = new Zotero.Item("note");
    note.libraryID = parentItem.libraryID;
    note.parentID = parentItem.id;
    note.setNote(noteHTML);
    await note.saveTx();
    return note;
  }
  function buildNoteHTML(citation, query) {
    let template;
    try {
      template = Zotero.Prefs.get(
        "extensions.zotero.citegen.noteTemplate",
        true
      );
    } catch {
      template = "<h2>AI Citation Reason</h2><p><strong>Query:</strong> {{query}}</p><p><strong>Reason:</strong> {{reason}}</p><p><em>Imported on {{date}}</em></p>";
    }
    const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    let html = template.replace(/\{\{query\}\}/g, escapeHTML(query || "N/A")).replace(/\{\{reason\}\}/g, escapeHTML(citation.reason || "No reason provided")).replace(/\{\{date\}\}/g, now).replace(/\{\{title\}\}/g, escapeHTML(citation.title)).replace(
      /\{\{authors\}\}/g,
      escapeHTML(citation.authors.join(", ") || "Unknown")
    ).replace(/\{\{year\}\}/g, String(citation.year || "N/A")).replace(/\{\{doi\}\}/g, escapeHTML(citation.doi || "N/A"));
    return html;
  }
  function escapeHTML(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/modules/related-linker.ts
  async function linkRelatedItems(results) {
    if (results.length < 2) return;
    const items = results.map((r) => r.zoteroItem).filter((item) => item && item.isRegularItem());
    if (items.length < 2) return;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        try {
          items[i].addRelatedItem(items[j]);
        } catch (e) {
          Zotero.debug(
            `[CiteGen] Could not link items ${items[i].id} and ${items[j].id}: ${e.message}`
          );
        }
      }
      try {
        await items[i].saveTx();
      } catch (e) {
        Zotero.debug(
          `[CiteGen] Could not save relations for item ${items[i].id}: ${e.message}`
        );
      }
    }
  }
  async function createLiteratureMapNote(results, query, collectionID) {
    if (results.length === 0) return null;
    const now = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    let html = `<h1>Literature Map: ${escapeHTML2(query || "AI Citation Import")}</h1>`;
    html += `<p><em>Imported ${results.length} citations on ${now}</em></p>`;
    html += "<hr/>";
    for (let i = 0; i < results.length; i++) {
      const { citation, doiResult } = results[i];
      const verified = doiResult?.valid ? " [DOI Verified]" : "";
      html += `<h2>${i + 1}. ${escapeHTML2(citation.title)}${verified}</h2>`;
      html += `<p><strong>Authors:</strong> ${escapeHTML2(citation.authors.join(", ") || "Unknown")}</p>`;
      if (citation.year) {
        html += `<p><strong>Year:</strong> ${citation.year}</p>`;
      }
      if (citation.journal) {
        html += `<p><strong>Source:</strong> ${escapeHTML2(citation.journal)}`;
        if (citation.volume) html += `, vol. ${escapeHTML2(citation.volume)}`;
        if (citation.issue) html += `(${escapeHTML2(citation.issue)})`;
        if (citation.pages) html += `, pp. ${escapeHTML2(citation.pages)}`;
        html += "</p>";
      }
      if (citation.doi) {
        html += `<p><strong>DOI:</strong> ${escapeHTML2(citation.doi)}</p>`;
      } else if (citation.url) {
        html += `<p><strong>URL:</strong> ${escapeHTML2(citation.url)}</p>`;
      }
      if (citation.reason) {
        html += `<blockquote><strong>Why it matters:</strong> ${escapeHTML2(citation.reason)}</blockquote>`;
      }
      html += "<hr/>";
    }
    const note = new Zotero.Item("note");
    note.libraryID = Zotero.Libraries.userLibraryID;
    note.setNote(html);
    await note.saveTx();
    if (collectionID) {
      const collection = Zotero.Collections.get(collectionID);
      if (collection) {
        collection.addItem(note.id);
        await collection.saveTx();
      }
    }
    return note;
  }
  function escapeHTML2(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/modules/importer.ts
  function parseAuthor(name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: "", lastName: parts[0], creatorType: "author" };
    }
    const lastName = parts.pop();
    const firstName = parts.join(" ");
    return { firstName, lastName, creatorType: "author" };
  }
  function mapCitationToFields(citation) {
    const fields = [];
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
    const t = citation.itemType || "journalArticle";
    if (t === "journalArticle" || t === "magazineArticle" || t === "newspaperArticle") {
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
        value: citation.conferenceName
      });
    }
    if (t === "thesis" && citation.university) {
      fields.push({ field: "university", value: citation.university });
    }
    return fields;
  }
  async function importSingleCitation(citation, libraryID, collectionID) {
    const itemType = citation.itemType || "journalArticle";
    const item = new Zotero.Item(itemType);
    item.libraryID = libraryID;
    const fields = mapCitationToFields(citation);
    for (const { field, value } of fields) {
      try {
        item.setField(field, value);
      } catch (e) {
        Zotero.debug(
          `[CiteGen] Could not set field "${field}" on ${itemType}: ${e.message}`
        );
      }
    }
    if (citation.authors.length > 0) {
      const creators = citation.authors.map(parseAuthor);
      item.setCreators(creators);
    }
    await item.saveTx();
    if (collectionID) {
      const collection = Zotero.Collections.get(collectionID);
      if (collection) {
        collection.addItem(item.id);
        await collection.saveTx();
      }
    }
    return item;
  }
  async function importCitations(payload, options = {}) {
    const {
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
      onProgress
    } = options;
    const libraryID = Zotero.Libraries.userLibraryID;
    let citations = [...payload.citations];
    const results = [];
    if (resolveURLs) {
      const needsResolve = citations.filter((c) => !c.doi && c.url);
      if (needsResolve.length > 0) {
        onProgress?.("resolve", 0, needsResolve.length, "Resolving URLs...");
        citations = await resolveAllURLs(citations, (current, total) => {
          onProgress?.("resolve", current, total);
        });
      }
    }
    let doiResults = [];
    if (verifyDOIs) {
      doiResults = await verifyAllDOIs(citations, (current, total) => {
        onProgress?.("verify", current, total);
      });
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
    const s2Results = /* @__PURE__ */ new Map();
    if (useSemanticScholar) {
      const needsS2 = citations.map((c, i) => ({ citation: c, index: i })).filter(({ citation }) => {
        if (!citation.doi) return true;
        const doiResult = doiResults.find((r) => r.doi === citation.doi);
        return doiResult && !doiResult.valid;
      });
      for (let i = 0; i < needsS2.length; i++) {
        const { citation, index } = needsS2[i];
        onProgress?.("s2-verify", i + 1, needsS2.length, citation.title.slice(0, 40));
        const result = await searchByTitle(citation.title, citation.authors);
        s2Results.set(index, result);
        if (result.found && result.doi && !citation.doi) {
          citations[index] = { ...citation, doi: result.doi };
        }
        if (i < needsS2.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    const dupResults = /* @__PURE__ */ new Map();
    if (checkDuplicates) {
      for (let i = 0; i < citations.length; i++) {
        onProgress?.("duplicates", i + 1, citations.length);
        const result = await checkDuplicate(citations[i]);
        if (result.isDuplicate) {
          dupResults.set(i, result);
        }
      }
    }
    const confidenceScores = /* @__PURE__ */ new Map();
    for (let i = 0; i < citations.length; i++) {
      const doiResult = doiResults.find((r) => r.doi === citations[i].doi);
      const s2Result = s2Results.get(i);
      const dupResult = dupResults.get(i);
      confidenceScores.set(i, scoreCitation(citations[i], doiResult, s2Result, dupResult));
    }
    for (let i = 0; i < citations.length; i++) {
      const citation = citations[i];
      onProgress?.("import", i + 1, citations.length, citation.title.slice(0, 40));
      const dupResult = dupResults.get(i);
      if (skipDuplicates && dupResult?.isDuplicate) {
        results.push({
          zoteroItem: null,
          citation,
          dupResult,
          confidence: confidenceScores.get(i),
          skipped: true,
          skipReason: `Duplicate of "${dupResult.existingTitle}" (${dupResult.matchType})`
        });
        continue;
      }
      try {
        const zoteroItem = await importSingleCitation(
          citation,
          libraryID,
          collectionID
        );
        if (importTag) {
          zoteroItem.addTag(importTag, 0);
        }
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
          confidence: conf
        });
      } catch (e) {
        Zotero.debug(
          `[CiteGen] Failed to import "${citation.title}": ${e.message}`
        );
      }
    }
    const imported = results.filter((r) => !r.skipped);
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
              `[CiteGen] Failed to create note for "${citation.title}": ${e.message}`
            );
          }
        }
      }
    }
    if (linkRelated && imported.length > 1) {
      onProgress?.("linking", 0, 1, "Linking related items...");
      try {
        await linkRelatedItems(imported);
      } catch (e) {
        Zotero.debug(`[CiteGen] Failed to link related items: ${e.message}`);
      }
    }
    if (createLitMap && imported.length > 0) {
      onProgress?.("litmap", 0, 1, "Creating literature map...");
      try {
        await createLiteratureMapNote(imported, query || payload.query, collectionID);
      } catch (e) {
        Zotero.debug(`[CiteGen] Failed to create lit map: ${e.message}`);
      }
    }
    return results;
  }

  // src/modules/import-dialog.ts
  var ImportDialogController = class {
    payload = null;
    doiResults = /* @__PURE__ */ new Map();
    /**
     * Parse pasted JSON text and return preview data.
     */
    parseInput(raw) {
      try {
        const payload = parseAICitationJSON(raw);
        const warnings = validatePayload(payload);
        this.payload = payload;
        return { success: true, payload, warnings };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    /**
     * Verify all DOIs in the current payload (standalone, for the Verify button).
     */
    async verifyDOIs(onProgress) {
      if (!this.payload) throw new Error("No citations parsed yet");
      const withDOI = this.payload.citations.filter((c) => c.doi);
      const results = [];
      for (let i = 0; i < withDOI.length; i++) {
        const result = await verifyDOI(withDOI[i].doi);
        this.doiResults.set(withDOI[i].doi, result);
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
    async runImport(options, onProgress) {
      if (!this.payload) throw new Error("No citations parsed yet");
      const mergedOptions = {
        verifyDOIs: options.verifyDOIs ?? getPref("verifyDOI"),
        useSemanticScholar: options.useSemanticScholar ?? true,
        resolveURLs: options.resolveURLs ?? true,
        checkDuplicates: options.checkDuplicates ?? true,
        skipDuplicates: options.skipDuplicates ?? false,
        attachReasons: options.attachReasons ?? getPref("attachReason"),
        linkRelated: options.linkRelated ?? true,
        createLitMap: options.createLitMap ?? true,
        importTag: options.importTag ?? (getPref("tagImported") ? getPref("importTag") : void 0),
        collectionID: options.collectionID,
        query: this.payload.query,
        onProgress
      };
      return importCitations(this.payload, mergedOptions);
    }
    getPayload() {
      return this.payload;
    }
  };
  function getPref(key) {
    try {
      return Zotero.Prefs.get(`extensions.zotero.citegen.${key}`, true);
    } catch {
      const defaults = {
        verifyDOI: true,
        attachReason: true,
        tagImported: true,
        importTag: "ai-citation"
      };
      return defaults[key];
    }
  }

  // src/modules/prompt-template.ts
  var CITATION_SYSTEM_PROMPT = `You are a research assistant. When asked about academic topics, provide citations in the following strict JSON format. Every citation MUST be a real, verifiable publication \u2014 do NOT fabricate citations.

Respond ONLY with valid JSON matching this schema:

\`\`\`json
{
  "query": "the user's original question",
  "citations": [
    {
      "title": "Full paper title",
      "authors": ["First Last", "First Last"],
      "year": 2023,
      "itemType": "journalArticle",
      "journal": "Full Journal Name",
      "volume": "12",
      "issue": "3",
      "pages": "100-115",
      "doi": "10.xxxx/xxxxx",
      "url": "https://...",
      "abstract": "Brief 1-2 sentence abstract",
      "reason": "Why this citation is relevant: what it supports, contradicts, or provides context for"
    }
  ]
}
\`\`\`

Rules:
- "itemType" must be one of: journalArticle, book, bookSection, conferencePaper, report, thesis, webpage, preprint
- "authors" is an array of "First Last" strings
- "doi" should be included whenever possible (omit the field if unknown, do NOT guess)
- "reason" MUST explain WHY this citation matters to the query \u2014 not just what the paper is about
- Include 5-15 citations ranked by relevance
- Do NOT include citations you are not confident are real publications
- Do NOT wrap in markdown code fences \u2014 return raw JSON only`;
  var CITATION_USER_PROMPT_TEMPLATE = `Find citations related to: "{topic}"

Focus on: {focus}
Number of citations: {count}`;
  function buildFullPrompt(topic, focus, count) {
    let prompt = CITATION_SYSTEM_PROMPT;
    if (topic) {
      prompt += "\n\n---\n\n" + CITATION_USER_PROMPT_TEMPLATE.replace("{topic}", topic).replace("{focus}", focus || "seminal and recent high-impact work").replace("{count}", String(count || 10));
    }
    return prompt;
  }

  // src/modules/ui-import.ts
  var HTML_NS = "http://www.w3.org/1999/xhtml";
  function openImportDialog() {
    const controller = new ImportDialogController();
    const mainWin = Zotero.getMainWindow();
    const win = mainWin.openDialog(
      "about:blank",
      "citegen-import",
      "chrome,centerscreen,resizable,width=820,height=620"
    );
    win.addEventListener("load", () => buildImportUI(win, controller));
  }
  function buildImportUI(win, controller) {
    const doc = win.document;
    win.document.title = "Import AI Citations";
    const root = h(doc, "div", {
      style: "font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#222;background:#f8f9fa;padding:14px;display:flex;flex-direction:column;height:100vh;gap:8px;overflow:hidden;box-sizing:border-box;margin:0;"
    });
    doc.documentElement.appendChild(root);
    const label = h(doc, "label", { style: "font-weight:600;display:block;margin-bottom:4px;" }, "Paste your AI-generated JSON below:");
    const textarea = h(doc, "textarea", {
      style: "width:100%;min-height:80px;max-height:150px;font-family:monospace;font-size:11px;border:1px solid #bbb;border-radius:6px;padding:8px;resize:vertical;box-sizing:border-box;background:#fff;",
      placeholder: '{"query":"topic","citations":[{"title":"...","authors":["..."],"year":2023,"doi":"...","reason":"..."}]}'
    });
    root.appendChild(h(doc, "div", {}, label, textarea));
    const btnPreview = makeBtn(doc, "Preview");
    const btnBrowse = makeBtn(doc, "Browse File...");
    const btnVerify = makeBtn(doc, "Verify DOIs");
    btnVerify.disabled = true;
    const btnImport = makeBtn(doc, "Import to Zotero", true);
    btnImport.disabled = true;
    const collSelect = h(doc, "select", { style: "padding:4px 8px;border-radius:6px;border:1px solid #bbb;font-size:12px;" });
    collSelect.appendChild(h(doc, "option", { value: "" }, "My Library"));
    try {
      const colls = Zotero.Collections.getByLibrary(Zotero.Libraries.userLibraryID);
      for (const c of colls) {
        collSelect.appendChild(h(doc, "option", { value: String(c.id) }, c.name));
      }
    } catch (e) {
    }
    const spacer = h(doc, "span", { style: "flex:1;" });
    root.appendChild(h(
      doc,
      "div",
      { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap;" },
      btnPreview,
      btnBrowse,
      btnVerify,
      spacer,
      h(doc, "span", { style: "font-size:12px;" }, "Into: "),
      collSelect,
      btnImport
    ));
    const opts = {};
    const optsDef = [
      ["verify", "Verify DOIs", true],
      ["s2", "Semantic Scholar", true],
      ["resolve", "Resolve URLs", true],
      ["dedup", "Check duplicates", true],
      ["skip-dup", "Skip duplicates", false],
      ["notes", "Attach reasons", true],
      ["link", "Link related", true],
      ["litmap", "Lit map", true]
    ];
    const optsRow = h(doc, "div", { style: "display:flex;gap:12px;flex-wrap:wrap;" });
    for (const [id, text, checked] of optsDef) {
      const cb = h(doc, "input", { type: "checkbox" });
      if (checked) cb.checked = true;
      opts[id] = cb;
      optsRow.appendChild(h(doc, "label", { style: "display:inline-flex;align-items:center;gap:3px;cursor:pointer;font-size:11px;" }, cb, text));
    }
    root.appendChild(optsRow);
    const statusBar = h(doc, "div", { style: "font-size:12px;padding:6px 10px;border-radius:6px;min-height:22px;background:#dbeafe;color:#1e40af;" }, "Ready. Paste JSON and click Preview.");
    const summary = h(doc, "div", { style: "font-size:11px;color:#666;" });
    root.appendChild(statusBar);
    root.appendChild(summary);
    const thead = h(doc, "thead");
    const headRow = h(doc, "tr");
    for (const col of ["#", "Title", "Authors", "Year", "Source", "Status", "Reason"]) {
      headRow.appendChild(h(doc, "th", { style: "text-align:left;padding:6px 8px;background:#f1f5f9;border-bottom:2px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;position:sticky;top:0;" }, col));
    }
    thead.appendChild(headRow);
    const tbody = h(doc, "tbody");
    const table = h(doc, "table", { style: "width:100%;border-collapse:collapse;font-size:11px;" }, thead, tbody);
    root.appendChild(h(doc, "div", { style: "flex:1;overflow:auto;border:1px solid #e2e8f0;border-radius:6px;background:#fff;" }, table));
    function setStatus(msg, type) {
      const colors = { info: "#dbeafe;color:#1e40af", err: "#fee2e2;color:#991b1b", ok: "#dcfce7;color:#166534", warn: "#fef3c7;color:#92400e" };
      statusBar.textContent = msg;
      statusBar.style.cssText = "font-size:12px;padding:6px 10px;border-radius:6px;min-height:22px;background:" + (colors[type] || colors.info);
    }
    function trunc(s, n) {
      return s.length > n ? s.substring(0, n - 1) + "\u2026" : s;
    }
    let currentPayload = null;
    btnPreview.addEventListener("click", () => {
      const raw = textarea.value;
      if (!raw.trim()) {
        setStatus("Paste some JSON first.", "err");
        return;
      }
      const result = controller.parseInput(raw);
      if (!result.success) {
        setStatus(result.error, "err");
        return;
      }
      currentPayload = result.payload;
      const cits = result.payload.citations;
      const warns = result.warnings || [];
      let withDOI = 0, withURL = 0;
      for (const c of cits) {
        if (c.doi) withDOI++;
        else if (c.url) withURL++;
      }
      while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
      for (let j = 0; j < cits.length; j++) {
        const c = cits[j];
        const src = c.doi ? "DOI" : c.url ? c.url.indexOf("arxiv") >= 0 ? "arXiv" : "URL" : "None";
        const tr = h(
          doc,
          "tr",
          {},
          td(doc, String(j + 1)),
          td(doc, trunc(c.title, 55), "max-width:220px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"),
          td(doc, trunc((c.authors || []).join(", ") || "Unknown", 30)),
          td(doc, c.year ? String(c.year) : "\u2014"),
          td(doc, src, "color:#64748b;font-size:10px;"),
          Object.assign(td(doc, c.doi ? "Pending" : c.url ? "URL only" : "No link", c.doi ? "color:#d97706;" : "color:#9ca3af;"), { id: "vs-" + j }),
          td(doc, trunc(c.reason || "\u2014", 45), "max-width:180px;font-style:italic;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;")
        );
        tbody.appendChild(tr);
      }
      summary.textContent = cits.length + " citation(s) | " + withDOI + " DOI | " + withURL + " URL-only";
      setStatus(warns.length > 0 ? "Warnings: " + warns.slice(0, 2).join("; ") : "Parsed " + cits.length + " citation(s). Ready.", warns.length > 0 ? "warn" : "ok");
      btnVerify.disabled = false;
      btnImport.disabled = false;
    });
    btnVerify.addEventListener("click", async () => {
      if (!currentPayload) return;
      btnVerify.disabled = true;
      setStatus("Verifying DOIs...", "info");
      try {
        const results = await controller.verifyDOIs((cur, tot, res) => {
          setStatus("Verifying DOIs (" + cur + "/" + tot + ")...", "info");
          const cits = currentPayload.citations;
          for (let k = 0; k < cits.length; k++) {
            if (cits[k].doi === res.doi) {
              const cell = doc.getElementById("vs-" + k);
              if (cell) {
                cell.textContent = res.valid ? "Verified" : "Not found";
                cell.style.color = res.valid ? "#16a34a" : "#dc2626";
                cell.style.fontWeight = "600";
              }
              break;
            }
          }
        });
        let valid = 0, invalid = 0;
        for (const r of results) {
          if (r.valid) valid++;
          else invalid++;
        }
        setStatus("DOI check: " + valid + " valid, " + invalid + " not found", valid > 0 ? "ok" : "err");
      } catch (e) {
        setStatus("Error: " + e.message, "err");
      }
      btnVerify.disabled = false;
    });
    btnImport.addEventListener("click", async () => {
      if (!currentPayload) return;
      btnImport.disabled = true;
      btnVerify.disabled = true;
      const importOpts = {
        collectionID: collSelect.value ? parseInt(collSelect.value) : void 0,
        verifyDOIs: opts["verify"].checked,
        useSemanticScholar: opts["s2"].checked,
        resolveURLs: opts["resolve"].checked,
        checkDuplicates: opts["dedup"].checked,
        skipDuplicates: opts["skip-dup"].checked,
        attachReasons: opts["notes"].checked,
        linkRelated: opts["link"].checked,
        createLitMap: opts["litmap"].checked
      };
      const labels = { resolve: "Resolving URLs", verify: "Verifying DOIs", "s2-verify": "Semantic Scholar", duplicates: "Checking duplicates", import: "Importing", notes: "Creating notes", linking: "Linking", litmap: "Lit map" };
      try {
        const results = await controller.runImport(importOpts, (stage, cur, tot, detail) => {
          setStatus((labels[stage] || stage) + " (" + cur + "/" + tot + ")" + (detail ? " - " + detail : ""), "info");
        });
        let imported = 0, skipped = 0;
        for (const r of results) {
          if (r.skipped) skipped++;
          else imported++;
        }
        setStatus("Done! Imported " + imported + " item(s)." + (skipped > 0 ? " Skipped " + skipped + " duplicate(s)." : ""), "ok");
        summary.textContent = "Imported " + imported + " citation(s)" + (skipped > 0 ? ", skipped " + skipped + " dup(s)" : "");
        for (let j = 0; j < results.length; j++) {
          const cell = doc.getElementById("vs-" + j);
          if (!cell) continue;
          if (results[j].skipped) {
            cell.textContent = "Skipped";
            cell.style.color = "#dc2626";
          } else if (results[j].confidence) {
            const cf = results[j].confidence;
            cell.textContent = cf.level + " (" + cf.score + ")";
            cell.style.color = cf.level === "high" ? "#16a34a" : cf.level === "medium" ? "#d97706" : "#dc2626";
            cell.style.fontWeight = "600";
          }
        }
      } catch (e) {
        setStatus("Error: " + e.message, "err");
      }
      btnImport.disabled = false;
      btnVerify.disabled = false;
    });
    btnBrowse.addEventListener("click", async () => {
      try {
        const fp = Components.classes["@mozilla.org/filepicker;1"].createInstance(Components.interfaces.nsIFilePicker);
        fp.init(win, "Select JSON File", Components.interfaces.nsIFilePicker.modeOpen);
        fp.appendFilter("JSON Files", "*.json");
        const rv = await new Promise((resolve) => fp.open(resolve));
        if (rv === Components.interfaces.nsIFilePicker.returnOK) {
          textarea.value = await Zotero.File.getContentsAsync(fp.file.path);
          btnPreview.click();
        }
      } catch (e) {
        setStatus("File error: " + e.message, "err");
      }
    });
  }
  function h(doc, tag, attrs, ...children) {
    const el = doc.createElementNS(HTML_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "style") el.style.cssText = v;
        else el.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (typeof child === "string") el.appendChild(doc.createTextNode(child));
      else if (child) el.appendChild(child);
    }
    return el;
  }
  function td(doc, text, extraStyle) {
    return h(doc, "td", { style: "padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;" + (extraStyle || "") }, text);
  }
  function makeBtn(doc, text, primary) {
    return h(doc, "button", {
      style: "padding:5px 14px;border-radius:6px;border:1px solid " + (primary ? "#2563eb;background:#2563eb;color:#fff" : "#bbb;background:#fff;color:#222") + ";cursor:pointer;font-size:12px;font-weight:500;"
    }, text);
  }

  // src/modules/ui-prompt.ts
  var HTML_NS2 = "http://www.w3.org/1999/xhtml";
  function openPromptDialog() {
    const mainWin = Zotero.getMainWindow();
    const win = mainWin.openDialog(
      "about:blank",
      "citegen-prompt",
      "chrome,centerscreen,resizable,width=650,height=520"
    );
    win.addEventListener("load", () => buildPromptUI(win));
  }
  function buildPromptUI(win) {
    const doc = win.document;
    win.document.title = "AI Citation Prompt";
    const root = h2(doc, "div", {
      style: "font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#222;background:#f8f9fa;padding:14px;display:flex;flex-direction:column;height:100vh;gap:10px;box-sizing:border-box;margin:0;"
    });
    doc.documentElement.appendChild(root);
    root.appendChild(h2(
      doc,
      "p",
      { style: "color:#475569;margin:0;" },
      "Give this prompt to your AI (ChatGPT, Claude, etc). Then paste the JSON output back into the Citation Importer."
    ));
    const topicInput = h2(doc, "input", { type: "text", placeholder: "e.g. transformer models in NLP", style: "flex:1;padding:6px 8px;border:1px solid #bbb;border-radius:6px;font-size:13px;" });
    const focusInput = h2(doc, "input", { type: "text", placeholder: "e.g. seminal papers and recent surveys", style: "flex:1;padding:6px 8px;border:1px solid #bbb;border-radius:6px;font-size:13px;" });
    const countInput = h2(doc, "input", { type: "number", value: "10", min: "1", max: "50", style: "max-width:80px;padding:6px 8px;border:1px solid #bbb;border-radius:6px;font-size:13px;" });
    root.appendChild(row(doc, "Topic:", topicInput));
    root.appendChild(row(doc, "Focus:", focusInput));
    root.appendChild(row(doc, "Count:", countInput));
    const output = h2(doc, "textarea", {
      style: "flex:1;width:100%;font-family:monospace;font-size:11px;border:1px solid #bbb;border-radius:6px;padding:8px;background:#fff;resize:none;box-sizing:border-box;",
      readonly: "readonly"
    });
    root.appendChild(output);
    const copyStatus = h2(doc, "span", { style: "font-size:12px;color:#16a34a;opacity:0;transition:opacity 0.3s;" }, "Copied!");
    const btnRegen = h2(doc, "button", { style: "padding:6px 16px;border-radius:6px;border:1px solid #bbb;background:#fff;cursor:pointer;font-size:13px;" }, "Regenerate");
    const btnCopy = h2(doc, "button", { style: "padding:6px 16px;border-radius:6px;border:1px solid #2563eb;background:#2563eb;color:#fff;cursor:pointer;font-size:13px;" }, "Copy to Clipboard");
    root.appendChild(h2(doc, "div", { style: "display:flex;gap:8px;justify-content:flex-end;align-items:center;" }, copyStatus, btnRegen, btnCopy));
    function gen() {
      const topic = topicInput.value.trim() || void 0;
      const focus = focusInput.value.trim() || void 0;
      const count = parseInt(countInput.value) || 10;
      output.value = buildFullPrompt(topic, focus, count);
    }
    btnRegen.addEventListener("click", gen);
    topicInput.addEventListener("input", gen);
    focusInput.addEventListener("input", gen);
    countInput.addEventListener("input", gen);
    btnCopy.addEventListener("click", () => {
      const text = output.value;
      if (!text) return;
      try {
        const ch = Components.classes["@mozilla.org/widget/clipboardhelper;1"].getService(Components.interfaces.nsIClipboardHelper);
        ch.copyString(text);
      } catch (e) {
        navigator.clipboard.writeText(text);
      }
      copyStatus.style.opacity = "1";
      setTimeout(() => {
        copyStatus.style.opacity = "0";
      }, 2e3);
    });
    gen();
  }
  function h2(doc, tag, attrs, ...children) {
    const el = doc.createElementNS(HTML_NS2, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === "style") el.style.cssText = v;
        else el.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (typeof child === "string") el.appendChild(doc.createTextNode(child));
      else if (child) el.appendChild(child);
    }
    return el;
  }
  function row(doc, labelText, input) {
    return h2(
      doc,
      "div",
      { style: "display:flex;gap:8px;align-items:center;" },
      h2(doc, "label", { style: "font-weight:600;min-width:55px;" }, labelText),
      input
    );
  }

  // src/index.ts
  var CiteGenPlugin = class {
    id = "";
    version = "";
    rootURI = "";
    initialized = false;
    menuIDs = [];
    sectionID = false;
    async init(params) {
      this.id = params.id;
      this.version = params.version;
      this.rootURI = params.rootURI;
      Zotero.PreferencePanes.register({
        pluginID: this.id,
        src: this.rootURI + "content/preferences.xhtml"
      });
      this.initialized = true;
      Zotero.debug(`[CiteGen] Initialized v${this.version}`);
    }
    async onMainWindowLoad(window) {
      if (!window) return;
      const doc = window.document;
      this.addMenuItem(doc, {
        id: "citegen-menu-import",
        label: "Import AI Citations (JSON)...",
        parentId: "menu_ToolsPopup",
        onCommand: () => this.openImportDialog()
      });
      this.addMenuItem(doc, {
        id: "citegen-menu-prompt",
        label: "Copy AI Citation Prompt...",
        parentId: "menu_ToolsPopup",
        onCommand: () => this.openPromptDialog()
      });
      this.addMenuItem(doc, {
        id: "citegen-menu-verify",
        label: "Verify DOIs for Selected Items",
        parentId: "menu_ToolsPopup",
        onCommand: () => this.verifySelectedItems()
      });
      this.addMenuItem(doc, {
        id: "citegen-context-import",
        label: "Import AI Citations (JSON)...",
        parentId: "zotero-itemmenu",
        onCommand: () => this.openImportDialog()
      });
      this.registerItemPaneSection();
      Zotero.debug("[CiteGen] Main window loaded");
    }
    onMainWindowUnload(window) {
      if (!window) return;
      const doc = window.document;
      for (const id of this.menuIDs) {
        doc.getElementById(id)?.remove();
      }
      this.menuIDs = [];
      if (this.sectionID) {
        Zotero.ItemPaneManager.unregisterSection(this.sectionID);
        this.sectionID = false;
      }
      Zotero.debug("[CiteGen] Main window unloaded");
    }
    shutdown() {
      this.initialized = false;
      Zotero.debug("[CiteGen] Shutdown");
    }
    // ── Public API (available as Zotero.CiteGen.*) ──
    createImportController() {
      return new ImportDialogController();
    }
    buildFullPrompt(topic, focus, count) {
      return buildFullPrompt(topic, focus, count);
    }
    getSystemPrompt() {
      return CITATION_SYSTEM_PROMPT;
    }
    /**
     * Programmatic import — can be called from other plugins or scripts.
     */
    async importFromJSON(json, options) {
      const payload = parseAICitationJSON(json);
      const warnings = validatePayload(payload);
      if (warnings.length > 0) {
        Zotero.debug(`[CiteGen] Import warnings: ${warnings.join("; ")}`);
      }
      return importCitations(payload, {
        ...options,
        query: payload.query
      });
    }
    // ── Private Methods ──
    openImportDialog() {
      openImportDialog();
    }
    openPromptDialog() {
      openPromptDialog();
    }
    async verifySelectedItems() {
      const items = ZoteroPane.getSelectedItems();
      if (!items || items.length === 0) {
        this.showNotification("No items selected.", "error");
        return;
      }
      const { verifyDOI: verifyDOI2 } = await Promise.resolve().then(() => (init_doi_verify(), doi_verify_exports));
      let valid = 0;
      let invalid = 0;
      let missing = 0;
      for (const item of items) {
        if (!item.isRegularItem()) continue;
        const doi = item.getField("DOI");
        if (!doi) {
          missing++;
          continue;
        }
        const result = await verifyDOI2(doi);
        if (result.valid) {
          valid++;
        } else {
          invalid++;
        }
      }
      this.showNotification(
        `DOI verification: ${valid} valid, ${invalid} invalid, ${missing} no DOI`,
        valid > 0 ? "success" : "warning"
      );
    }
    registerItemPaneSection() {
      try {
        this.sectionID = Zotero.ItemPaneManager.registerSection({
          paneID: "citegen-info",
          pluginID: this.id,
          header: {
            l10nID: "citegen-section-header",
            icon: this.rootURI + "content/icons/favicon@0.5x.png"
          },
          sidenav: {
            l10nID: "citegen-section-sidenav",
            icon: this.rootURI + "content/icons/favicon@0.5x.png"
          },
          onRender: ({
            body,
            item
          }) => {
            if (!item || !item.isRegularItem()) {
              body.textContent = "Select a regular item to see AI citation info.";
              return;
            }
            const noteIDs = item.getNotes();
            let reasonNote = null;
            for (const nid of noteIDs) {
              const note = Zotero.Items.get(nid);
              const content = note.getNote();
              if (content && content.includes("AI Citation Reason")) {
                reasonNote = content;
                break;
              }
            }
            if (reasonNote) {
              body.innerHTML = reasonNote;
            } else {
              body.innerHTML = '<p style="color: #9ca3af; font-style: italic;">No AI citation info. Import citations via Tools \u2192 Import AI Citations.</p>';
            }
          }
        });
      } catch (e) {
        Zotero.debug(
          `[CiteGen] Could not register item pane section: ${e.message}`
        );
      }
    }
    addMenuItem(doc, opts) {
      const menuitem = doc.createXULElement("menuitem");
      menuitem.id = opts.id;
      menuitem.setAttribute("label", opts.label);
      menuitem.addEventListener("command", opts.onCommand);
      const parent = doc.getElementById(opts.parentId);
      if (parent) {
        parent.appendChild(menuitem);
        this.menuIDs.push(opts.id);
      }
    }
    showNotification(message, type = "info") {
      try {
        const pw = new Zotero.ProgressWindow();
        pw.changeHeadline("Citation Generator");
        pw.addDescription(message);
        pw.show();
        pw.startCloseTimer(4e3);
      } catch {
        Zotero.debug(`[CiteGen] ${type}: ${message}`);
      }
    }
  };
  var plugin = new CiteGenPlugin();
  Zotero.CiteGen = plugin;
  var index_default = plugin;
})();
