import clsx from "clsx";
import type { ReactNode } from "react";

type AlertType = "warning" | "danger" | "info";

interface AlertProps {
  type: AlertType;
  children: ReactNode;
}

const typeClasses: Record<AlertType, string> = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-red-200 bg-red-50 text-red-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};

export function Alert({ type, children }: AlertProps) {
  return (
    <div className={clsx("rounded-lg border px-3 py-2 text-sm", typeClasses[type])}>
      {children}
    </div>
  );
}
