type Props = {
  title: string;
  value: string;
  icon: string;
  color: string;
};

export default function StatCard({
  title,
  value,
  icon,
  color,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <div className="flex justify-between items-center">

        <div>
          <p className="text-gray-500">
            {title}
          </p>

          <h2 className="text-3xl font-bold mt-2">
            {value}
          </h2>
        </div>

        <div
          className="text-4xl"
          style={{ color }}
        >
          {icon}
        </div>

      </div>
    </div>
  );
}