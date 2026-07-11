import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "../config/firebase";

// SRS Part 5, section 8 (TypeScript Models) - the User model.
// Backs the `users` collection described in section 1 ("Student profile,
// role, purchased packages, progress") and the Student Profile fields
// listed in SRS Part 4, section 5.
//
// Note: `purchasedPackages`/`completedChapters`/`completedMcqs` etc. are
// intentionally NOT duplicated onto this doc - they're derived live from
// the `purchases` collection (purchasesService) and quiz attempt history
// (useQuizStats) respectively, so there's a single source of truth and no
// risk of this profile doc drifting out of sync with those.
export type UserRole = "student" | "admin";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  mobile?: string;
  college?: string;
  currentYearId?: string;
  currentYearTitle?: string;
  role: UserRole;
  createdAt?: number;
}

const usersCollectionName = "users";

// Called right after signup. Uses `setDoc(..., { merge: true })` so it's
// safe to call more than once (e.g. retried after a transient failure)
// without overwriting fields written elsewhere.
export async function createUserProfile(
  uid: string,
  data: { name: string; email: string }
): Promise<void> {
  await setDoc(
    doc(db, usersCollectionName, uid),
    {
      name: data.name,
      email: data.email,
      role: "student" as UserRole,
      createdAt: Date.now(),
    },
    { merge: true }
  );
}

export async function fetchUserProfile(
  uid: string
): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, usersCollectionName, uid));
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  return {
    uid: snap.id,
    name: data.name ?? "",
    email: data.email ?? "",
    mobile: data.mobile,
    college: data.college,
    currentYearId: data.currentYearId,
    currentYearTitle: data.currentYearTitle,
    role: (data.role as UserRole) ?? "student",
    createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
  };
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Pick<UserProfile, "name" | "mobile" | "college" | "currentYearId" | "currentYearTitle">>
): Promise<void> {
  await setDoc(doc(db, usersCollectionName, uid), data, { merge: true });
}
