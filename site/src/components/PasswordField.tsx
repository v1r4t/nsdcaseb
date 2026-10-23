import { useState } from 'react';

interface PasswordFieldProps {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  disabled?: boolean;
  describedBy?: string;
  invalid?: boolean;
  placeholder?: string;
  label: string;
}

/** Password input with a Show/Hide toggle. Label + hint/error markup stays with the caller. */
export default function PasswordField({
  id, name, value, onChange, autoComplete, disabled, describedBy, invalid, placeholder, label,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={`field pr-16 ${invalid ? 'field-invalid' : ''}`}
        placeholder={placeholder}
      />
      <button
        type="button"
        disabled={disabled}
        aria-pressed={visible}
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        onClick={() => setVisible((v) => !v)}
        className="link absolute right-2 top-1/2 -translate-y-1/2 text-sm"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
