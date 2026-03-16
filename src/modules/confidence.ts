/**
 * Confidence scoring for AI-generated citations.
 * Rates how likely each citation is real and accurate.
 */

import type { AICitation } from "./json-parser";
import type { DOIVerificationResult } from "./doi-verify";
import type { SemanticScholarResult } from "./semantic-scholar";
import type { DuplicateCheckResult } from "./duplicate-detect";

export type ConfidenceLevel = "high" | "medium" | "low" | "unverified";

export interface ConfidenceScore {
  level: ConfidenceLevel;
  score: number; // 0-100
  reasons: string[];
}

/**
 * Calculate a confidence score for a citation based on
 * all available verification data.
 */
export function scoreCitation(
  citation: AICitation,
  doiResult?: DOIVerificationResult,
  s2Result?: SemanticScholarResult,
  dupResult?: DuplicateCheckResult,
): ConfidenceScore {
  let score = 0;
  const reasons: string[] = [];

  // ── DOI verification (strongest signal) ──
  if (doiResult?.valid) {
    score += 40;
    reasons.push("DOI verified via CrossRef");
  } else if (citation.doi && doiResult && !doiResult.valid) {
    score -= 20;
    reasons.push("DOI provided but not found on CrossRef");
  }

  // ── Semantic Scholar match ──
  if (s2Result?.found) {
    score += 30;
    reasons.push(
      `Found on Semantic Scholar${s2Result.citationCount ? ` (${s2Result.citationCount} citations)` : ""}`,
    );

    // Bonus for having actual citations (not just a match)
    if (s2Result.citationCount && s2Result.citationCount > 10) {
      score += 5;
    }
    if (s2Result.citationCount && s2Result.citationCount > 100) {
      score += 5;
    }
  }

  // ── Already in library (user previously imported or manually added) ──
  if (dupResult?.isDuplicate) {
    score += 15;
    reasons.push("Already exists in your library");
  }

  // ── Metadata completeness ──
  if (citation.doi) score += 5;
  if (citation.authors.length > 0) score += 5;
  if (citation.year) score += 3;
  if (citation.journal) score += 3;
  if (citation.abstract) score += 2;
  if (citation.volume) score += 1;
  if (citation.pages) score += 1;

  // ── Metadata quality signals ──
  if (citation.year && (citation.year < 1900 || citation.year > new Date().getFullYear() + 1)) {
    score -= 10;
    reasons.push("Suspicious year");
  }

  if (citation.authors.length === 0) {
    score -= 5;
    reasons.push("No authors listed");
  }

  if (!citation.doi && !citation.url) {
    score -= 10;
    reasons.push("No DOI or URL — cannot verify");
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine level
  let level: ConfidenceLevel;
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

/**
 * Get a human-readable label and color for a confidence level.
 */
export function confidenceDisplay(level: ConfidenceLevel): {
  label: string;
  color: string;
  emoji: string;
} {
  switch (level) {
    case "high":
      return { label: "High confidence", color: "#16a34a", emoji: "●" };
    case "medium":
      return { label: "Medium confidence", color: "#d97706", emoji: "●" };
    case "low":
      return { label: "Low confidence", color: "#dc2626", emoji: "●" };
    case "unverified":
      return { label: "Unverified", color: "#9ca3af", emoji: "○" };
  }
}
