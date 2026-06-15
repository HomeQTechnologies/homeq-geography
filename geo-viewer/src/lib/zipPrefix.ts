import { parseShapeTypeKey } from "./shapeTypes";
import type { GeoSearchSuggestion } from "./types";

export const ZIP3_PREFIX_LENGTH = 3;
export const ZIP5_POSTAL_CODE_LENGTH = 5;
/** Upper bound for zip5 matches per 3-digit prefix (11300–11399). */
export const ZIP5_PREFIX_SEARCH_AMOUNT = 100;

export function normalizeZip3Prefix(input: string): string | null {
  const digits = input.replace(/\s/g, "");
  if (!/^\d{3}$/.test(digits)) return null;
  return digits;
}

export function getSuggestionPostalDigits(suggestion: GeoSearchSuggestion): string {
  return (suggestion.postalCode ?? "").replace(/\s/g, "");
}

export function isZip5Suggestion(suggestion: GeoSearchSuggestion): boolean {
  return parseShapeTypeKey(suggestion.id) === "zip5";
}

export function matchesZip3Prefix(suggestion: GeoSearchSuggestion, prefix: string): boolean {
  if (!isZip5Suggestion(suggestion)) return false;

  const digits = getSuggestionPostalDigits(suggestion);
  return digits.length === ZIP5_POSTAL_CODE_LENGTH && digits.startsWith(prefix);
}

export function filterZip5ByPrefix(
  suggestions: GeoSearchSuggestion[],
  prefix: string,
): GeoSearchSuggestion[] {
  return suggestions
    .filter(suggestion => matchesZip3Prefix(suggestion, prefix))
    .sort((a, b) => getSuggestionPostalDigits(a).localeCompare(getSuggestionPostalDigits(b)));
}

export function partitionNewZip5Suggestions(
  suggestions: GeoSearchSuggestion[],
  selectedIds: string[],
): { toAdd: GeoSearchSuggestion[]; skipped: number } {
  const selected = new Set(selectedIds);
  const toAdd: GeoSearchSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (selected.has(suggestion.id)) continue;
    toAdd.push(suggestion);
  }

  return { toAdd, skipped: suggestions.length - toAdd.length };
}
