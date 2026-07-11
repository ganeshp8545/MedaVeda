export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;

  Home: undefined;

  // Entry point for the Home screen's Notes/Video/MCQ shortcuts.
  Years: {
    mode: "notes" | "videos" | "quiz";
  };

  Subjects: {
    yearId: string;
    yearTitle: string;
    // When set, tapping a Subject -> Chapter navigates straight to that
    // content type (skipping the ChapterDetails hub) - powers the Home
    // screen's Notes/Video/MCQ quick-access shortcuts.
    mode?: "notes" | "videos" | "quiz";
  };

  Chapters: {
    subjectId: string;
    subjectTitle: string;
    yearId: string;
    yearTitle: string;
    mode?: "notes" | "videos" | "quiz";
  };

  ChapterDetails: {
    chapterId: string;
    chapterTitle: string;
    subjectId: string;
    subjectTitle: string;
    yearId: string;
    yearTitle: string;
  };

  // General catalog: chapters, subject/year packs, multi-year bundles.
  Store: undefined;

  Notes: {
    chapterId: string;
    chapterTitle: string;
    subjectId: string;
    yearId: string;
    unlocked: boolean;
  };

  Videos: {
    chapterId: string;
    chapterTitle: string;
    subjectId: string;
    yearId: string;
    unlocked: boolean;
  };

  // Test list for a chapter - shows every Test with lock/free state.
  QuizTests: {
    chapterId: string;
    chapterTitle: string;
    subjectId: string;
    yearId: string;
    unlocked: boolean;
  };

  // Plays a single Test's 20 questions. Access is decided one screen back
  // (QuizTests), so this screen just plays whatever Test it's given.
  Quiz: {
    chapterId: string;
    chapterTitle: string;
    subjectId: string;
    yearId: string;
    test: {
      id: string;
      title: string;
      questions: {
        question: string;
        options: string[];
        answer: string;
      }[];
    };
    hasMoreLockedTests?: boolean;
  };

  Profile: undefined;
  EditProfile: undefined;
  MyPurchases: undefined;

  PdfViewer: {
    pdfUrl: string;
  };

  Search: undefined;
  Settings: undefined;
  About: undefined;
  Contact: undefined;
  Privacy: undefined;
  Terms: undefined;
};
