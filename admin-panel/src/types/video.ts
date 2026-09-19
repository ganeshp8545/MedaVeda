// IMPORTANT: this must match the mobile app's types/video.ts exactly -
// Video Lectures are always free, so they are scoped to a Subject (not a
// Chapter), same as Quiz Tests.
export interface Video {
  id: string;
  title: string;
  youtubeUrl: string;

  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;

  order: number;
  active: boolean;
  createdAt?: any;
}

export type VideoInput = Omit<Video, "id" | "createdAt">;
