import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";

type BodyTextType = "label-small" | "body-small" | "title-small" | "title-medium";
type BodyTextColor = "grey-40" | string;

interface BodyTextProps {
  children: ReactNode;
  type?: BodyTextType;
  color?: BodyTextColor;
  mb?: number;
  textAlign?: CSSProperties["textAlign"];
  heading?: "span";
  className?: string;
}

const typeClasses: Record<BodyTextType, string> = {
  "label-small": "text-xs leading-4",
  "body-small": "text-sm leading-5",
  "title-small": "text-base font-semibold leading-6",
  "title-medium": "text-lg font-semibold leading-7",
};

const colorClasses: Record<string, string> = {
  "grey-40": "text-grey-500",
};

export function BodyText({
  children,
  type = "body-small",
  color,
  mb,
  textAlign,
  heading,
  className,
}: BodyTextProps) {
  const Component = heading === "span" ? "span" : "p";
  const style: CSSProperties = {};
  if (mb !== undefined) style.marginBottom = `${mb * 0.25}rem`;
  if (textAlign) style.textAlign = textAlign;

  return (
    <Component
      className={clsx(
        "m-0",
        typeClasses[type],
        color ? colorClasses[color] ?? `text-${color}` : "text-grey-900",
        className,
      )}
      style={Object.keys(style).length > 0 ? style : undefined}
    >
      {children}
    </Component>
  );
}
