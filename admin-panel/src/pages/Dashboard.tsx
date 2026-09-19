import useDashboard from "../hooks/useDashboard";

import StatCard from "../components/StatCard";

export default function Dashboard() {
  const { stats, loading } = useDashboard();

  if (loading) {
    return (
      <h2 className="text-xl">
        Loading...
      </h2>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Academic Years"
          value={String(stats.years)}
          icon="📘"
          color="#16a34a"
        />
        <StatCard
          title="Subjects"
          value={String(stats.subjects)}
          icon="📚"
          color="#2563eb"
        />
        <StatCard
          title="Products"
          value={String(stats.products)}
          icon="📦"
          color="#ea580c"
        />
        <StatCard
          title="Students"
          value={String(stats.users)}
          icon="👥"
          color="#9333ea"
        />
        <StatCard
          title="Notes"
          value={String(stats.notes)}
          icon="📝"
          color="#0d9488"
        />
        <StatCard
          title="Videos"
          value={String(stats.videos)}
          icon="🎬"
          color="#dc2626"
        />
        <StatCard
          title="Quiz Tests"
          value={String(stats.quiz)}
          icon="❓"
          color="#d97706"
        />
      </div>
    </div>
  );
}
