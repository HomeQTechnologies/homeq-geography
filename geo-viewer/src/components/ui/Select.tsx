interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  updateValue: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
}

export function Select({ value, updateValue, options, disabled }: SelectProps) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={event => updateValue(event.target.value)}
      className="w-full rounded-lg border border-grey-200 bg-white px-3 py-2 text-sm text-grey-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:bg-grey-50 disabled:text-grey-400"
    >
      {options.length === 0 ? (
        <option value="">No options</option>
      ) : (
        options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))
      )}
    </select>
  );
}
