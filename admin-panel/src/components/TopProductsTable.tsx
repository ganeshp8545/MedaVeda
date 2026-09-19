import type { TopProduct } from "../services/analyticsService";

type Props = {
  products: TopProduct[];
};

export default function TopProductsTable({ products }: Props) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl bg-white p-10 text-center text-gray-400 shadow">
        No sales yet.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden">
      <table className="w-full">
        <thead className="bg-green-700 text-white">
          <tr>
            <th className="p-4 text-left">Product</th>
            <th className="p-4 text-left">Orders</th>
            <th className="p-4 text-left">Revenue</th>
          </tr>
        </thead>

        <tbody>
          {products.map((product) => (
            <tr key={product.productId} className="border-b hover:bg-gray-50">
              <td className="p-4">{product.productTitle}</td>
              <td className="p-4">{product.orders}</td>
              <td className="p-4">₹ {product.revenue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
