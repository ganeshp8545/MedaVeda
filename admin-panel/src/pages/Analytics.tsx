import { useState } from "react";

import useAnalytics from "../hooks/useAnalytics";
import useCourses from "../hooks/useCourses";

import StatCard from "../components/StatCard";
import TopProductsTable from "../components/TopProductsTable";
import CoursePicker from "../components/CoursePicker";

export default function Analytics() {
  const { courses } = useCourses();
  const [courseFilter, setCourseFilter] = useState("");
  const { data, loading, error } = useAnalytics({ courseId: courseFilter || undefined });

  const filterBar = (
    <div className="mb-6 w-56">
      <CoursePicker
        courses={courses}
        value={courseFilter}
        onChange={setCourseFilter}
        label=""
        placeholder="All Courses"
      />
    </div>
  );


  if (loading) {
    return (
      <div>
        {filterBar}
        <h2 className="text-xl">Loading...</h2>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-gray-500 mt-1">
          Revenue and sales overview.
        </p>
      </div>

      {filterBar}

      {error && <p className="text-red-500 mb-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Revenue"
          value={`₹ ${data.totalRevenue}`}
          icon="💰"
          color="#16a34a"
        />
        <StatCard
          title="Total Orders"
          value={String(data.totalOrders)}
          icon="🧾"
          color="#2563eb"
        />
        <StatCard
          title="Total Users"
          value={String(data.totalUsers)}
          icon="👥"
          color="#9333ea"
        />
        <StatCard
          title="Total Products"
          value={String(data.totalProducts)}
          icon="📦"
          color="#ea580c"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Paid Orders"
          value={String(data.paidOrders)}
          icon="✅"
          color="#16a34a"
        />
        <StatCard
          title="Pending Orders"
          value={String(data.pendingOrders)}
          icon="⏳"
          color="#d97706"
        />
        <StatCard
          title="Failed Orders"
          value={String(data.failedOrders)}
          icon="❌"
          color="#dc2626"
        />
        <StatCard
          title="Refunded Orders"
          value={String(data.refundedOrders)}
          icon="↩️"
          color="#6b7280"
        />
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Top Selling Products
        </h2>
        <TopProductsTable products={data.topProducts} />
      </div>
    </div>
  );
}
