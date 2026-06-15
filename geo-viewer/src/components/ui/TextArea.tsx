import clsx from "clsx";
import type { TextareaHTMLAttributes } from "react";

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean;
}

export function TextArea({ autoGrow: _autoGrow, className, rows = 3, ...props }: TextAreaProps) {
  return (
    <textarea
      rows={rows}
      className={clsx(
        "w-full resize-y rounded-lg border border-grey-200 bg-white px-3 py-2 text-sm text-grey-900 outline-none",
        "focus:border-primary-400 focus:ring-2 focus:ring-primary-200",
        "disabled:cursor-not-allowed disabled:bg-grey-50 disabled:text-grey-400",
        className,
      )}
      {...props}
    />
  );
}
