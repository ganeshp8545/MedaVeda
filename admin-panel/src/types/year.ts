export interface Year {
  id: string;
  title: string;
  icon: string;
  color: string;
  order: number;
  active: boolean;
  createdAt?: any;
}

export type YearInput = Omit<Year, "id" | "createdAt">;
