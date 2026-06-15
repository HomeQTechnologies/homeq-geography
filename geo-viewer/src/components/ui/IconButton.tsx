import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ariaLabel: string;
  small?: boolean;
  children: ReactNode;
}

export function IconButton({ ariaLabel, small, disabled, className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center rounded-full text-grey-600 transition-colors",
        small ? "h-7 w-7" : "h-9 w-9",
        disabled ? "cursor-not-allowed opacity-50" : "hover:bg-grey-100",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
