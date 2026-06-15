import clsx from "clsx";
import type { InputHTMLAttributes } from "react";

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  small?: boolean;
  label?: string;
}

export function TextInput({ small, label, className, id, ...props }: TextInputProps) {
  const inputId = id ?? (label ? label.replace(/\s+/g, "-").toLowerCase() : undefined);

  const input = (
    <input
      id={inputId}
      className={clsx(
        "w-full rounded-lg border border-grey-200 bg-white text-grey-900 outline-none",
        "focus:border-primary-400 focus:ring-2 focus:ring-primary-200",
        "disabled:cursor-not-allowed disabled:bg-grey-50 disabled:text-grey-400",
        small ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm",
        className,
      )}
      {...props}
    />
  );

  if (!label) return input;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-xs font-medium text-grey-700">
        {label}
      </label>
      {input}
    </div>
  );
}
