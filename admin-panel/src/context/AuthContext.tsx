import React, { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "../config/supabase";

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAdmin(currentUser: User | null) {
      setUser(currentUser);

      if (!currentUser) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Being logged in isn't enough - this Supabase project is shared
      // with the mobile app, so any student account could sign in here
      // too. `am_i_admin()` checks the server-side `admins` table (by
      // email) via a security-definer RPC, so the check can't be spoofed
      // client-side.
      try {
        const { data, error } = await supabase.rpc("am_i_admin");
        if (error) throw error;
        setIsAdmin(!!data);
      } catch (err) {
        console.error("Failed to check admin status:", err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      checkAdmin(data.session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      checkAdmin(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
