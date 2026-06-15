import clsx from "clsx";
import type { ReactNode } from "react";

interface SimpleCheckboxProps {
  checked: boolean;
  onClick: (checked: boolean) => void;
  children?: ReactNode;
}

export function SimpleCheckbox({ checked, onClick, children }: SimpleCheckboxProps) {
  return (
    <label className="inline-flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onClick(event.target.checked)}
        className={clsx(
          "mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-grey-300",
          "accent-primary-500",
        )}
      />
      {children ? <span className="min-w-0 flex-1">{children}</span> : null}
    </label>
  );
}
