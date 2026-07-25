// Supabase table: "profiles" (auto-created by a DB trigger on signup).
// Columns (confirmed from the live schema): id, name, email, phone,
// photo_url, blocked, created_at, college. There is no "role" column,
// so that must never be written to the DB (see usersService.ts for the
// phone<->mobile mapping).
//
// BUG FIX: this type used to also declare currentYearId/currentYearTitle,
// with no matching columns in `profiles` at all. Nothing currently calls
// updateUserProfile with either field, so it wasn't crashing today - but
// it was the exact same landmine as the orders/product_title bug,
// waiting for a future "switch your current year" screen to trip it.
// Removed rather than guessed-fixed, since there's no requirement yet
// for what a "current year" selector should look like. If/when you want
// that feature, it needs an actual `current_year_id` column added via a
// migration first, then this type can get it back.
export type UserRole = "student" | "admin";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  mobile?: string;
  role: UserRole;
  createdAt?: number;
}
