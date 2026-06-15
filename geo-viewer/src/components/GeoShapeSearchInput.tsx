import { useEffect, useRef, useState } from "react";
import { BodyText, Icon } from "@/components/ui";
import { searchGeoShapes } from "../api/geoShapesApi";
import { formatSuggestionLabel, getShapeTypeLabel } from "../lib/shapeTypes";
import type { GeoSearchSuggestion } from "../lib/types";

interface GeoShapeSearchInputProps {
  onAdd: (suggestion: GeoSearchSuggestion) => void;
  selectedIds: string[];
  shapeTypes?: string;
  showAll: boolean;
}

export function GeoShapeSearchInput({ onAdd, selectedIds, shapeTypes, showAll }: GeoShapeSearchInputProps) {
  const [value, setValue] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<GeoSearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(value), 250);
    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    if (debouncedSearch.length <= 1) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);

    void searchGeoShapes({ query: debouncedSearch, shapeTypes, showAll, ignoreCache: true })
      .then(response => {
        if (!cancelled) {
          setSuggestions(response.results);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSuggestions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, searchGeoShapes, shapeTypes, showAll]);

  const showDropdown = isOpen && value.length > 1;
  const firstAddableSuggestion = suggestions.find(s => !selectedIds.includes(s.id));

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const handleSelect = (suggestion: GeoSearchSuggestion) => {
    onAdd(suggestion);
    setValue("");
    setSuggestions([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <BodyText mb={1}>Search geo shapes</BodyText>
      <div className="bg-grey-100 border-grey-200 focus-within:ring-primary-400 flex h-14 items-center gap-2 rounded-lg border px-4 py-2 focus-within:border-transparent focus-within:ring-2 focus-within:outline-none">
        <Icon name="search" size={16} className="text-grey-400" />
        <input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-label="Search geo shapes"
          value={value}
          onChange={e => {
            setValue(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (value.length > 1) setIsOpen(true);
          }}
          onKeyDown={e => {
            if (e.key === "Escape") setIsOpen(false);
            if (e.key === "Enter" && firstAddableSuggestion) {
              e.preventDefault();
              handleSelect(firstAddableSuggestion);
            }
          }}
          placeholder="e.g. Stockholm, Södermalm..."
          className="flex-1 border-none bg-transparent outline-none"
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            aria-label="Clear search"
            className="hover:bg-grey-200 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            onClick={() => {
              setValue("");
              setSuggestions([]);
              setIsOpen(false);
            }}
          >
            <Icon name="close" size={14} className="text-grey-400" />
          </button>
        ) : (
          <span className="h-6 w-6 shrink-0" aria-hidden />
        )}
      </div>

      {showDropdown && (
        <ul
          role="listbox"
          className="border-grey-200 absolute top-full z-50 mt-1 max-h-[300px] w-full overflow-y-auto rounded-lg border bg-white py-2 shadow-lg"
        >
          {isSearching && suggestions.length === 0 && (
            <li className="pointer-events-none px-4 py-2">
              <BodyText textAlign="center" className="text-grey-40">
                Searching...
              </BodyText>
            </li>
          )}
          {!isSearching && suggestions.length === 0 && (
            <li className="pointer-events-none px-4 py-2">
              <BodyText textAlign="center" className="text-grey-40">
                No results found
              </BodyText>
            </li>
          )}
          {suggestions.map(suggestion => {
            const isAlreadyAdded = selectedIds.includes(suggestion.id);

            return (
              <li key={suggestion.id} role="option" aria-disabled={isAlreadyAdded}>
                <button
                  type="button"
                  disabled={isAlreadyAdded}
                  className={
                    isAlreadyAdded
                      ? "flex w-full cursor-default flex-row items-center justify-between gap-2 px-4 py-2 text-left opacity-60"
                      : "hover:bg-grey-50 flex w-full cursor-pointer flex-row items-center justify-between gap-2 px-4 py-2 text-left"
                  }
                  onMouseDown={e => {
                    if (!isAlreadyAdded) e.preventDefault();
                  }}
                  onClick={() => {
                    if (!isAlreadyAdded) handleSelect(suggestion);
                  }}
                >
                  <BodyText color={isAlreadyAdded ? "grey-40" : undefined}>
                    {formatSuggestionLabel(suggestion)}
                  </BodyText>
                  <div className="flex shrink-0 items-center gap-2">
                    {isAlreadyAdded && (
                      <BodyText color="grey-40" type="label-small">
                        Already added
                      </BodyText>
                    )}
                    <BodyText color="grey-40" type="body-small">
                      {getShapeTypeLabel(suggestion.id)}
                    </BodyText>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
