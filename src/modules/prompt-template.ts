/**
 * The system prompt template that users give to their AI
 * to get properly formatted citation JSON output.
 */

export const CITATION_SYSTEM_PROMPT = `You are a research assistant. When asked about academic topics, provide citations in the following strict JSON format. Every citation MUST be a real, verifiable publication — do NOT fabricate citations.

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
- "reason" MUST explain WHY this citation matters to the query — not just what the paper is about
- Include 5-15 citations ranked by relevance
- Do NOT include citations you are not confident are real publications
- Do NOT wrap in markdown code fences — return raw JSON only`;

export const CITATION_USER_PROMPT_TEMPLATE = `Find citations related to: "{topic}"

Focus on: {focus}
Number of citations: {count}`;

/**
 * Build a full prompt the user can copy and give to their AI.
 */
export function buildFullPrompt(
  topic?: string,
  focus?: string,
  count?: number,
): string {
  let prompt = CITATION_SYSTEM_PROMPT;

  if (topic) {
    prompt +=
      "\n\n---\n\n" +
      CITATION_USER_PROMPT_TEMPLATE.replace("{topic}", topic)
        .replace("{focus}", focus || "seminal and recent high-impact work")
        .replace("{count}", String(count || 10));
  }

  return prompt;
}
