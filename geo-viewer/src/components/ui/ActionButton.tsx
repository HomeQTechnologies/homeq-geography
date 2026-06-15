import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./Spinner";

type ActionButtonType = "filled" | "secondary" | "default";
type ActionButtonSize = "sm";

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  type?: ActionButtonType;
  size?: ActionButtonSize;
  spinning?: boolean;
  children: ReactNode;
}

const typeClasses: Record<ActionButtonType, string> = {
  filled: "bg-primary-500 text-white hover:bg-primary-600 disabled:bg-grey-200 disabled:text-grey-400",
  secondary: "bg-primary-50 text-primary-600 hover:bg-primary-100 disabled:bg-grey-100 disabled:text-grey-400",
  default: "border border-grey-200 bg-white text-grey-700 hover:bg-grey-50 disabled:text-grey-400",
};

export function ActionButton({
  type: variant = "default",
  size,
  spinning = false,
  disabled,
  className,
  children,
  ...props
}: ActionButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || spinning}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        typeClasses[variant],
        className,
      )}
      {...props}
    >
      {spinning ? <Spinner size="sm" /> : null}
      {children}
    </button>
  );
}
