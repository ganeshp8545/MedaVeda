import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

const variantClasses: Record<Variant, string> = {
  primary: "bg-green-700 text-white hover:bg-green-800",
  secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export default function Button({
  variant = "primary",
  loading = false,
  disabled,
  children,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? "Saving..." : children}
    </button>
  );
}
