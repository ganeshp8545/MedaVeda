import { type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export default function Input({ label, error, className = "", ...rest }: Props) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>

      <input
        className={`w-full rounded-lg border px-3 py-2.5 text-sm outline-none transition focus:border-green-600 focus:ring-1 focus:ring-green-600 ${
          error ? "border-red-400" : "border-gray-300"
        } ${className}`}
        {...rest}
      />

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
