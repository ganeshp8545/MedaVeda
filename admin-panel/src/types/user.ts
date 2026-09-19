export interface AppUser {
  id: string;

  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;

  blocked: boolean;
  createdAt?: any;
}
