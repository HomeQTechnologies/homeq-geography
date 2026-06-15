import CloseRounded from "@mui/icons-material/CloseRounded";
import clsx from "clsx";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BodyText, IconButton } from "@/components/ui";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, title, onClose, children, footer, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          "relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-grey-200 bg-white shadow-xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-grey-200 px-4 py-3">
          <BodyText id="modal-title" type="title-small">
            {title}
          </BodyText>
          <IconButton ariaLabel="Close dialog" onClick={onClose}>
            <CloseRounded fontSize="small" />
          </IconButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer ? (
          <div className="flex justify-end gap-2 border-t border-grey-200 px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
