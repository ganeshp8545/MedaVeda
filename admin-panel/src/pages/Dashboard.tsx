import { useState } from "react";

import useDashboard from "../hooks/useDashboard";
import useCourses from "../hooks/useCourses";

import StatCard from "../components/StatCard";
import CoursePicker from "../components/CoursePicker";

export default function Dashboard() {
  const { courses } = useCourses();
  const [courseFilter, setCourseFilter] = useState("");
  const { stats, loading } = useDashboard({ courseId: courseFilter || undefined });

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
      {filterBar}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Courses"
          value={String(stats.courses)}
          icon="🎓"
          color="#0891b2"
        />
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
