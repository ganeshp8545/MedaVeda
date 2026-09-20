import { useMemo, useState } from "react";
import useCourses from "../hooks/useCourses";
import CoursePicker from "../components/CoursePicker";

import useUsers from "../hooks/useUsers";

import UsersTable from "../components/UsersTable";
import SearchBar from "../components/SearchBar";
import ConfirmDialog from "../components/ConfirmDialog";

import type { AppUser } from "../types/user";

export default function Users() {
  const { courses } = useCourses();
  const [courseFilter, setCourseFilter] = useState("");

  const { users, loading, error, toggleBlocked } = useUsers({ courseId: courseFilter || undefined });

  const [search, setSearch] = useState("");

  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const term = search.toLowerCase();
      return (
        user.name?.toLowerCase().includes(term) ||
        user.email?.toLowerCase().includes(term) ||
        user.phone?.toLowerCase().includes(term)
      );
    });
  }, [users, search]);

  async function confirmToggle() {
    if (!pendingUser) return;
    try {
      setSaving(true);
      await toggleBlocked(pendingUser.id, !pendingUser.blocked);
      setPendingUser(null);
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
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-gray-500 mt-1">
          Students registered on the MedVeda app.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <div className="w-48">
          <CoursePicker
            courses={courses}
            value={courseFilter}
            onChange={(id) => {
              setCourseFilter(id);
            }}
            label=""
            placeholder="All Courses"
          />
        </div>

        <SearchBar value={search} onChange={setSearch} />
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center shadow">
          <h2 className="text-xl font-semibold">No Users Found</h2>
          <p className="text-gray-500 mt-2">Try a different search.</p>
        </div>
      ) : (
        <UsersTable users={filteredUsers} onToggleBlock={setPendingUser} />
      )}

      <ConfirmDialog
        open={!!pendingUser}
        title={pendingUser?.blocked ? "Unblock User?" : "Block User?"}
        message={
          pendingUser
            ? pendingUser.blocked
              ? `"${pendingUser.name || pendingUser.email}" will regain access to the app.`
              : `"${pendingUser.name || pendingUser.email}" will lose access to the app immediately.`
            : ""
        }
        loading={saving}
        confirmLabel={pendingUser?.blocked ? "Unblock" : "Block"}
        loadingLabel={pendingUser?.blocked ? "Unblocking..." : "Blocking..."}
        onCancel={() => setPendingUser(null)}
        onConfirm={confirmToggle}
      />
    </div>
  );
}
