import { useCallback, useEffect, useState } from "react";
import type { ContentFilters } from "../types/filters";

import { getUsers, setUserBlocked } from "../services/userService";

import type { AppUser } from "../types/user";

export default function useUsers(filters: ContentFilters = {}) {
  const { courseId, yearId } = filters;
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getUsers({ courseId, yearId });
      setUsers(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [courseId, yearId]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

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
