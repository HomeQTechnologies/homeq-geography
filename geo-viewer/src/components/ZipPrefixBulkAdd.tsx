import { useState } from "react";
import { ActionButton, BodyText, TextInput } from "@/components/ui";
import { searchGeoShapes } from "../api/geoShapesApi";
import {
  filterZip5ByPrefix,
  normalizeZip3Prefix,
  partitionNewZip5Suggestions,
  ZIP5_PREFIX_SEARCH_AMOUNT,
} from "../lib/zipPrefix";
import type { GeoSearchSuggestion } from "../lib/types";

interface ZipPrefixBulkAddProps {
  selectedIds: string[];
  showAll: boolean;
  onAddMany: (suggestions: GeoSearchSuggestion[]) => number;
}

type StatusMessage = {
  tone: "success" | "warning" | "error";
  text: string;
};

export function ZipPrefixBulkAdd({ selectedIds, showAll, onAddMany }: ZipPrefixBulkAddProps) {
  const [prefixInput, setPrefixInput] = useState("");
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const normalizedPrefix = normalizeZip3Prefix(prefixInput);
  const canSubmit = Boolean(normalizedPrefix) && !isFetching;

  const handleSubmit = async () => {
    const prefix = normalizeZip3Prefix(prefixInput);
    if (!prefix) return;

    setStatus(null);

    setIsFetching(true);
    try {
      const response = await searchGeoShapes({
        query: prefix,
        shapeTypes: "zip5",
        showAll,
        ignoreCache: true,
        amount: ZIP5_PREFIX_SEARCH_AMOUNT,
      });

      const matches = filterZip5ByPrefix(response.results, prefix);
      const { toAdd, skipped } = partitionNewZip5Suggestions(matches, selectedIds);
      const added = onAddMany(toAdd);

      if (matches.length === 0) {
        setStatus({
          tone: "warning",
          text: `No 5-digit postcodes found for prefix ${prefix}.`,
        });
        return;
      }

      const truncated = response.totalSuggestions > response.results.length;
      const parts = [`Added ${added} postcode${added === 1 ? "" : "s"}.`];

      if (skipped > 0) {
        parts.push(`${skipped} already on the map.`);
      }

      if (truncated) {
        parts.push(`Search returned ${response.results.length} of ${response.totalSuggestions} matches.`);
      }

      setStatus({
        tone: added > 0 ? "success" : "warning",
        text: parts.join(" "),
      });
    } catch {
      setStatus({
        tone: "error",
        text: "Failed to load postcodes for that prefix.",
      });
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <BodyText mb={0}>Add all 5-digit postcodes by prefix</BodyText>
      <div className="flex items-center gap-2">
        <TextInput
          small
          aria-label="3-digit postcode prefix"
          inputMode="numeric"
          pattern="\d*"
          maxLength={3}
          value={prefixInput}
          className="w-24"
          onChange={event => {
            setPrefixInput(event.target.value.replace(/\D/g, "").slice(0, 3));
            setStatus(null);
          }}
          onKeyDown={event => {
            if (event.key === "Enter" && canSubmit) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="e.g. 113"
        />
        <ActionButton
          type="filled"
          size="sm"
          disabled={!canSubmit}
          spinning={isFetching}
          onClick={() => void handleSubmit()}
        >
          {isFetching ? "Loading..." : "Add all"}
        </ActionButton>
      </div>
      <BodyText color="grey-40" type="label-small">
        Enter the first three digits to add every matching 5-digit postcode shape.
      </BodyText>
      {status && (
        <BodyText
          type="label-small"
          className={
            status.tone === "error"
              ? "text-red-600"
              : status.tone === "warning"
                ? "text-amber-700"
                : "text-green-700"
          }
        >
          {status.text}
        </BodyText>
      )}
    </div>
  );
}
