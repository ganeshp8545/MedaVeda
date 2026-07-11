import * as admin from "firebase-admin";

// Initialized once and reused by every function in this project (Cloud
// Functions can reuse the same warm instance across invocations, so this
// module-level init runs at most once per instance).
if (admin.apps.length === 0) {
  admin.initializeApp();
}

export const db = admin.firestore();
export const auth = admin.auth();
export const FieldValue = admin.firestore.FieldValue;
