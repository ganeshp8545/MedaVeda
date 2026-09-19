import type { Order, OrderStatus } from "../types/order";

type Props = {
  orders: Order[];
  onStatusChange: (order: Order, status: OrderStatus) => void;
};

const statusStyles: Record<OrderStatus, string> = {
  created: "bg-amber-100 text-amber-700",
  paid: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  refunded: "bg-gray-200 text-gray-600",
};

function formatDate(createdAt: any) {
  if (!createdAt) return "-";
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function OrdersTable({ orders, onStatusChange }: Props) {
  if (orders.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No orders yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-green-700 text-white">
          <tr>
            <th className="p-4 text-left">Date</th>
            <th className="p-4 text-left">Student</th>
            <th className="p-4 text-left">Product</th>
            <th className="p-4 text-left">Amount</th>
            <th className="p-4 text-left">Status</th>
            <th className="p-4 text-right">Update Status</th>
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b hover:bg-gray-50">
              <td className="p-4 text-gray-500">{formatDate(order.createdAt)}</td>

              <td className="p-4">
                <div className="font-medium text-gray-800">{order.userName || "-"}</div>
                <div className="text-xs text-gray-400">{order.userEmail || "-"}</div>
              </td>

              <td className="p-4">{order.productTitle}</td>

              <td className="p-4">₹ {order.amount}</td>

              <td className="p-4">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusStyles[order.status]}`}
                >
                  {order.status}
                </span>
              </td>

              <td className="p-4 text-right">
                <select
                  value={order.status}
                  onChange={(e) =>
                    onStatusChange(order, e.target.value as OrderStatus)
                  }
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
                >
                  <option value="created">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
