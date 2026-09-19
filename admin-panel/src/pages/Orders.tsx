import { useMemo, useState } from "react";

import useOrders from "../hooks/useOrders";

import OrdersTable from "../components/OrdersTable";
import OrderFilter from "../components/OrderFilter";
import SearchBar from "../components/SearchBar";
import ConfirmDialog from "../components/ConfirmDialog";

import type { Order, OrderStatus } from "../types/order";

export default function Orders() {
  const { orders, loading, error, changeStatus } = useOrders();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const [pendingChange, setPendingChange] = useState<{
    order: Order;
    status: OrderStatus;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.userName?.toLowerCase().includes(search.toLowerCase()) ||
        order.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
        order.productTitle?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = !status || order.status === status;

      return matchesSearch && matchesStatus;
    });
  }, [orders, search, status]);

  function requestStatusChange(order: Order, newStatus: OrderStatus) {
    if (newStatus === order.status) return;
    setPendingChange({ order, status: newStatus });
  }

  async function confirmStatusChange() {
    if (!pendingChange) return;
    try {
      setSaving(true);
      await changeStatus(pendingChange.order.id, pendingChange.status);
      setPendingChange(null);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <h2 className="text-xl">
        Loading...
      </h2>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Orders</h1>
        <p className="text-gray-500 mt-1">
          View and manage student purchases.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <SearchBar value={search} onChange={setSearch} />
        <OrderFilter value={status} onChange={setStatus} />
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center shadow">
          <h2 className="text-xl font-semibold">No Orders Found</h2>
          <p className="text-gray-500 mt-2">Try changing your filters.</p>
        </div>
      ) : (
        <OrdersTable
          orders={filteredOrders}
          onStatusChange={requestStatusChange}
        />
      )}

      <ConfirmDialog
        open={!!pendingChange}
        title="Change Order Status?"
        message={
          pendingChange
            ? `Mark this order as "${pendingChange.status}" for ${pendingChange.order.userName || "this student"}?`
            : ""
        }
        loading={saving}
        confirmLabel="Update Status"
        loadingLabel="Updating..."
        onCancel={() => setPendingChange(null)}
        onConfirm={confirmStatusChange}
      />
    </div>
  );
}
