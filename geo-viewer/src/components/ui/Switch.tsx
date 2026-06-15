import clsx from "clsx";

interface SwitchProps {
  checked: boolean;
  onChange: () => void;
  type?: "filled";
}

export function Switch({ checked, onChange, type }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors",
        checked
          ? type === "filled"
            ? "bg-primary-500"
            : "bg-primary-400"
          : "bg-grey-200",
      )}
    >
      <span
        className={clsx(
          "pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
