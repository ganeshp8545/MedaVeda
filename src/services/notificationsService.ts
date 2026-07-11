import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "../config/firebase";

// SRS Part 4, section 7 - Notification Types: New Notes, New Videos,
// Offers, Payment Success, Exam Reminder, App Updates. `type` is optional
// so existing/older notification docs without it still render fine.
export type NotificationType =
  | "new_notes"
  | "new_video"
  | "offer"
  | "payment_success"
  | "exam_reminder"
  | "app_update";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type?: NotificationType;
  createdAt?: number;
}

const notificationsCollection = collection(db, "notifications");

// Reads a top-level `notifications` collection (documents with
// { title, body, active, createdAt }) if the admin panel has created one.
// If the collection doesn't exist yet, or a Firestore index is missing,
// this fails soft and just returns an empty list instead of throwing -
// the Notifications section on the dashboard should never block the rest
// of the screen from loading.
export async function fetchNotifications(): Promise<AppNotification[]> {
  try {
    const q = query(notificationsCollection, where("active", "==", true));
    const snapshot = await getDocs(q);

    const results = snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as any;
      return {
        id: docSnap.id,
        title: data.title ?? "Update",
        body: data.body ?? "",
        type: data.type as NotificationType | undefined,
        createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : data.createdAt,
      };
    });

    return results.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  } catch (error) {
    console.log("fetchNotifications: no notifications available yet", error);
    return [];
  }
}
