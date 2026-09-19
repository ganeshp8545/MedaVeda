type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function ProductFilter({
  value,
  onChange,
}: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded-lg px-4 py-2"
    >
      <option value="">All Products</option>
      <option value="chapter">Single Chapter</option>
      <option value="subject">Full Subject</option>
      <option value="year">Full Year</option>
      <option value="bundle">Multi-Year Bundle</option>
    </select>
  );
}
