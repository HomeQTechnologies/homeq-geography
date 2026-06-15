import clsx from "clsx";
import type { ReactNode } from "react";
import { BodyText } from "@/components/ui";

interface DrawStepSectionProps {
  step: number;
  title: string;
  description?: string;
  complete?: boolean;
  children: ReactNode;
}

export function DrawStepSection({ step, title, description, complete = false, children }: DrawStepSectionProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <span
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-medium",
            complete ? "bg-primary-400 text-white" : "bg-grey-100 text-grey-500",
          )}
        >
          {complete ? "✓" : step}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BodyText type="label-small" className="font-medium">
              {title}
            </BodyText>
            {complete && (
              <BodyText type="label-small" className="text-primary-400">
                Complete
              </BodyText>
            )}
          </div>
          {description && (
            <BodyText color="grey-40" type="label-small" className="mt-1">
              {description}
            </BodyText>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>
    </div>
  );
}
