import clsx from "clsx";

interface IconProps {
  name: string;
  size?: number;
  className?: string;
}

const iconNames: Record<string, string> = {
  search: "search",
  close: "close",
};

export function Icon({ name, size = 20, className }: IconProps) {
  return (
    <span
      className={clsx("material-symbols-rounded leading-none", className)}
      style={{ fontSize: size }}
      aria-hidden
    >
      {iconNames[name] ?? name}
    </span>
  );
}
