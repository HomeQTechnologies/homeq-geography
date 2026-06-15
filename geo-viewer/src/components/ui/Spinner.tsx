import clsx from "clsx";

interface SpinnerProps {
  size?: "sm";
}

export function Spinner({ size }: SpinnerProps) {
  return (
    <span
      className={clsx(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5",
      )}
      role="status"
      aria-label="Loading"
    />
  );
}
