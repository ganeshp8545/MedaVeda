export interface Course {
  id: string;
  name: string;
  code: string;
  description?: string;
  icon?: string;
  displayOrder: number;
  active: boolean;
  createdAt?: any;
}

export type CourseInput = Omit<Course, "id" | "createdAt">;
