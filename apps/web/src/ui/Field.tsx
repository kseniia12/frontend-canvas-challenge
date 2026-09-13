import type { ChangeEvent } from 'react';

type Props = {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

export function Field({ label, name, value, onChange, error }: Props) {
  const id = `f-${name}`;
  return (
    <div className={error ? 'field is-invalid' : 'field'}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      {error ? <span className="field-error">{error}</span> : null}
    </div>
  );
}
