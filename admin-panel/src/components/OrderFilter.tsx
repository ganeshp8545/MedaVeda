type Props = {
  value: string;
  onChange: (value: string) => void;
};

export default function OrderFilter({ value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded-lg px-4 py-2"
    >
      <option value="">All Statuses</option>
      <option value="created">Pending</option>
      <option value="paid">Paid</option>
      <option value="failed">Failed</option>
      <option value="refunded">Refunded</option>
    </select>
  );
}
