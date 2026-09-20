export interface AppUser {
  id: string;

  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;

  blocked: boolean;
  createdAt?: any;

  // Added by 20260919120000_multi_course_and_referrals.sql. courseId/
  // yearId are both nullable in the DB (a brand-new signup has neither
  // until the mobile onboarding gate runs). courseTitle/yearTitle are
  // joined display fields, not real columns.
  courseId?: string;
  courseTitle?: string;
  yearId?: string;
  yearTitle?: string;
  referralCode: string;
}
