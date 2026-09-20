// Single source of truth for the signed-in student's current Course + Year.
//
// The profile is loaded once after login (and re-loaded after a change) and
// shared by every screen through useCourseYear() - screens should not each
// fetch the profile just to learn the course. Server-side RLS is the real
// guard for what a student can see; this state only drives which course the
// client asks for and which screens to show (onboarding gate, headers).
import { supabase } from "../config/supabase";
import { getCurrentUser } from "./authState";
import { fetchUserProfile, setMyCourseYear } from "./usersService";
import { clearRecentChapters } from "../utils/recentActivity";
import { clearRecentSearches } from "../utils/recentSearches";
import { clearCache } from "../utils/localCache";

export interface CourseYearState {
  // idle: not loaded yet / signed out. ready: profile loaded (course/year may still be unset).
  status: "idle" | "loading" | "ready" | "error";
  courseId?: string;
  courseTitle?: string;
  yearId?: string;
  yearTitle?: string;
}

const IDLE: CourseYearState = { status: "idle" };

let state: CourseYearState = IDLE;
let stateUserId: string | null = null;
let inFlight: Promise<CourseYearState> | null = null;

const listeners = new Set<(s: CourseYearState) => void>();
const courseChangeHandlers = new Set<() => void>();

function setState(next: CourseYearState) {
  state = next;
  listeners.forEach((fn) => fn(state));
}

export function getCourseYear(): CourseYearState {
  return state;
}

export function subscribeCourseYear(fn: (s: CourseYearState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// In-memory caches that depend on the course (e.g. the search index)
// register here to drop themselves when the course changes.
export function onCourseChange(fn: () => void): () => void {
  courseChangeHandlers.add(fn);
  return () => courseChangeHandlers.delete(fn);
}

// True once the profile is known and the student still has to pick a
// course and/or year (new signups, and existing students who were
// backfilled to a course but never chose a year).
export function needsCourseYearSelection(s: CourseYearState = state): boolean {
  return s.status === "ready" && (!s.courseId || !s.yearId);
}

export async function loadCourseYear(force = false): Promise<CourseYearState> {
  // authState's own session read may not have finished yet right after
  // launch/login, so fall back to asking Supabase directly.
  const user =
    getCurrentUser() ?? (await supabase.auth.getSession()).data.session?.user ?? null;
  if (!user) {
    stateUserId = null;
    setState(IDLE);
    return state;
  }

  if (!force && state.status === "ready" && stateUserId === user.id) return state;
  if (inFlight && stateUserId === user.id) return inFlight;

  stateUserId = user.id;
  if (state.status !== "ready") setState({ ...state, status: "loading" });

  const uid = user.id;
  inFlight = fetchUserProfile(uid)
    .then((profile) => {
      // Ignore a result that arrives after the user signed out/switched.
      if (stateUserId !== uid) return state;
      setState({
        status: "ready",
        courseId: profile?.courseId,
        courseTitle: profile?.courseTitle,
        yearId: profile?.yearId,
        yearTitle: profile?.yearTitle,
      });
      return state;
    })
    .catch((err) => {
      console.log("loadCourseYear failed:", err);
      if (stateUserId === uid) setState({ ...state, status: state.courseId ? "ready" : "error" });
      return state;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

// Clears everything on this device that belongs to the previous course:
// Continue Learning, recent searches, cached catalog lists, and the
// in-memory search index. Downloaded files are deliberately NOT deleted -
// the Downloads screen just hides other courses' items.
async function clearCourseScopedLocalState(): Promise<void> {
  await Promise.all([clearRecentChapters(), clearRecentSearches(), clearCache()]);
  courseChangeHandlers.forEach((fn) => fn());
}

// Saves the student's choice through the validated set_my_course_year RPC
// (the only permitted write path), then refreshes the shared state. If the
// course itself changed, course-scoped local state is cleared first.
export async function saveCourseYear(courseId: string, yearId: string): Promise<void> {
  const previousCourseId = state.courseId;
  await setMyCourseYear(courseId, yearId);

  if (previousCourseId && previousCourseId !== courseId) {
    await clearCourseScopedLocalState();
  }
  await loadCourseYear(true);
}

// Where to send a student straight after login / on app start. If the
// profile can't be loaded (e.g. offline) we fall through to Home, whose own
// guard re-checks once the profile arrives.
export async function resolvePostLoginRoute(): Promise<"Home" | "SelectCourseYear"> {
  const s = await loadCourseYear(true);
  return needsCourseYearSelection(s) ? "SelectCourseYear" : "Home";
}

supabase.auth.onAuthStateChange((_event, session) => {
  const uid = session?.user?.id ?? null;
  if (uid !== stateUserId) {
    stateUserId = uid;
    inFlight = null;
    setState(IDLE);
  }
});
