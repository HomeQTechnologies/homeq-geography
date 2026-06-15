import clsx from "clsx";
import type { ReactNode } from "react";

interface TabsProps {
  mode?: "wrap";
  children: ReactNode;
}

interface TabProps {
  isActive?: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export function Tabs({ mode, children }: TabsProps) {
  return (
    <div
      className={clsx(
        "flex gap-1",
        mode === "wrap" && "flex-wrap",
      )}
      role="tablist"
    >
      {children}
    </div>
  );
}

export function Tab({ isActive, onClick, children }: TabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={clsx(
        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        isActive
          ? "bg-primary-500 text-white"
          : "bg-grey-100 text-grey-600 hover:bg-grey-200",
      )}
    >
      {children}
    </button>
  );
}
