import { useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import { getUsers, setUserBlocked } from "../services/userService";

import type { AppUser } from "../types/user";

export default function useUsers(filters: ContentFilters = {}) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, [filters.courseId, filters.yearId]);

  async function loadUsers() {
    try {
      setLoading(true);
      const data = await getUsers(filters);
      setUsers(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleBlocked(id: string, blocked: boolean) {
    await setUserBlocked(id, blocked);
    await loadUsers();
  }

  return {
    users,
    loading,
    error,
    reload: loadUsers,
    toggleBlocked,
  };
}
