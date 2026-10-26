import { forwardRef } from "react";

type BaseProps = {
  label: string;
  error?: string;
  hint?: string;
  options?: Array<{
    label: string;
    value: string;
  }>;
};

type InputFieldProps = BaseProps &
  React.InputHTMLAttributes<HTMLInputElement> &
  React.SelectHTMLAttributes<HTMLSelectElement>;

export const InputField = forwardRef<
  HTMLInputElement | HTMLSelectElement,
  InputFieldProps
>(function InputField({ label, error, hint, options, className = "", ...props }, ref) {
  const id = props.name ?? props.id ?? label;

  return (
    <label className="input-field">
      <div className="field-heading">
        <span>{label}</span>
        {hint ? <span id={`${id}-hint`} className="field-hint">{hint}</span> : null}
      </div>
      <div className={`field-shell ${error ? "field-error" : ""}`}>
        {options ? (
          <select
            ref={ref as React.Ref<HTMLSelectElement>}
            id={id}
            aria-label={label}
            aria-invalid={Boolean(error)}
            aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
            className={`input-core appearance-none ${className}`.trim()}
            {...props}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={ref as React.Ref<HTMLInputElement>}
            id={id}
            aria-label={label}
            aria-invalid={Boolean(error)}
            aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
            className={`input-core ${className}`.trim()}
            {...props}
          />
        )}
      </div>
      {error ? <p id={`${id}-error`} role="alert" className="field-error-message">{error}</p> : null}
    </label>
  );
});
