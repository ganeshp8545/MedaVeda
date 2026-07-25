// Supabase doesn't expose a synchronous "auth.currentUser" like Firebase
// did. This tiny module recreates that convenience: it keeps an in-memory
// copy of the current user, kept fresh by Supabase's own auth listener,
// so screens that used to read `auth.currentUser` directly can just call
// `getCurrentUser()` instead with no other changes to their logic.
import type { User } from "@supabase/supabase-js";
import { supabase } from "../config/supabase";

let currentUser: User | null = null;

// BUG FIX: the admin panel has a "Block User" toggle (profiles.blocked)
// but nothing in the mobile app ever read that column - an admin
// blocking a problematic/abusive account did literally nothing, the
// student could keep browsing, downloading, and purchasing normally.
// This listener runs on every login and session restore; a blocked
// account is signed out immediately and every screen listening via
// onBlockedSignOut() gets a chance to show why.
type BlockedListener = () => void;
const blockedListeners = new Set<BlockedListener>();
export function onBlockedSignOut(fn: BlockedListener): () => void {
  blockedListeners.add(fn);
  return () => blockedListeners.delete(fn);
}

async function enforceNotBlocked(user: User): Promise<void> {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("blocked")
    .eq("id", user.id)
    .maybeSingle();

  // Fail open on a network/lookup error - a transient failure here
  // should not lock a legitimate student out of the app. A genuinely
  // blocked user will be caught again on their next session refresh.
  if (error || !profile?.blocked) return;

  currentUser = null;
  await supabase.auth.signOut();
  blockedListeners.forEach((fn) => fn());
}

supabase.auth.getSession().then(({ data }) => {
  currentUser = data.session?.user ?? null;
  if (currentUser) enforceNotBlocked(currentUser);
});

supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  if (currentUser) enforceNotBlocked(currentUser);
});

export function getCurrentUser(): User | null {
  return currentUser;
}

// Firebase's User had `.displayName`; Supabase stores that in
// `user_metadata.name` (set at signup - see RegisterScreen). This helper
// reads it the same way `.displayName` used to be read.
export function getCurrentUserDisplayName(): string | undefined {
  return currentUser?.user_metadata?.name;
}
