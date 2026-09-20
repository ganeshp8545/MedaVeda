// Optional scoping used by the admin services/hooks: every list can be
// narrowed to one course (and, where the table has a year_id, one year).
export interface ContentFilters {
  courseId?: string;
  yearId?: string;
}
