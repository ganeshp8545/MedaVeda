import { useEffect, useState } from "react";

import {
  CourseYearState,
  getCourseYear,
  loadCourseYear,
  subscribeCourseYear,
} from "../services/courseState";

// Reads the shared Course/Year state and makes sure it gets loaded. Every
// caller sees the same object, so nothing re-fetches the profile per screen.
export default function useCourseYear() {
  const [state, setState] = useState<CourseYearState>(getCourseYear());

  useEffect(() => {
    const unsubscribe = subscribeCourseYear(setState);
    setState(getCourseYear());
    if (getCourseYear().status === "idle") loadCourseYear();
    return unsubscribe;
  }, []);

  return { ...state, ready: state.status === "ready", reload: () => loadCourseYear(true) };
}
