import CloseRounded from "@mui/icons-material/CloseRounded";
import clsx from "clsx";
import { useMemo, useState, type KeyboardEvent } from "react";
import { BodyText } from "@/components/ui";

interface MeshDefinitionFaceMultiSelectProps {
  options: string[];
  value: string[];
  onChange: (faces: string[]) => void;
  disabled?: boolean;
}

function sortFaceNames(faceNames: string[]): string[] {
  return [...faceNames].sort((left, right) => left.localeCompare(right));
}

export function MeshDefinitionFaceMultiSelect({
  options,
  value,
  onChange,
  disabled = false,
}: MeshDefinitionFaceMultiSelectProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const sortedOptions = useMemo(
    () => sortFaceNames(options),
    [options],
  );

  const selectedFaces = useMemo(
    () => sortFaceNames(value),
    [value],
  );

  const filteredOptions = useMemo(() => {
    const available = sortedOptions.filter(faceName => !value.includes(faceName));
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return available;

    return available.filter(faceName => faceName.toLowerCase().includes(trimmedQuery));
  }, [query, sortedOptions, value]);

  const addFace = (faceName: string) => {
    if (disabled || value.includes(faceName)) return;
    onChange(sortFaceNames([...value, faceName]));
    setQuery("");
    setIsOpen(false);
  };

  const removeFace = (faceName: string) => {
    if (disabled) return;
    onChange(value.filter(name => name !== faceName));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (filteredOptions[0]) {
        addFace(filteredOptions[0]);
      }
      return;
    }

    if (event.key === "Backspace" && query.length === 0 && selectedFaces.length > 0) {
      removeFace(selectedFaces[selectedFaces.length - 1]!);
    }

    if (event.key === "Escape") {
      setQuery("");
      setIsOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {selectedFaces.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {selectedFaces.map(faceName => (
            <li
              key={faceName}
              className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1"
            >
              <BodyText type="label-small" className="text-primary-700">
                {faceName}
              </BodyText>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${faceName}`}
                className="text-primary-600 hover:text-primary-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => removeFace(faceName)}
              >
                <CloseRounded sx={{ fontSize: 14 }} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <BodyText color="grey-40" type="body-small">
          No faces selected yet.
        </BodyText>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          disabled={disabled || sortedOptions.length === 0}
          placeholder={
            sortedOptions.length === 0
              ? "No definition faces available"
              : "Type to search and add a face..."
          }
          onChange={event => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setIsOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
          className={clsx(
            "w-full rounded-lg border border-grey-200 bg-white px-3 py-2 text-sm text-grey-900 outline-none",
            "focus:border-primary-400 focus:ring-2 focus:ring-primary-200",
            "disabled:cursor-not-allowed disabled:bg-grey-50 disabled:text-grey-400",
          )}
        />

        {isOpen && filteredOptions.length > 0 ? (
          <ul
            role="listbox"
            className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-grey-200 bg-white py-1 shadow-lg"
          >
            {filteredOptions.map(faceName => (
              <li key={faceName} role="option">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-grey-900 hover:bg-grey-50"
                  onMouseDown={event => {
                    event.preventDefault();
                    addFace(faceName);
                  }}
                >
                  {faceName}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
