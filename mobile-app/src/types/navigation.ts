export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;

  Home: undefined;

  // Post-login gate: shown while the student has no course/year chosen
  // ("onboarding", no back), and reachable from Profile to change them.
  SelectCourseYear: { mode?: "onboarding" | "change" } | undefined;

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

  // Only reached for the "notes" shortcut (and general browsing) now -
  // Video/MCQ shortcuts skip straight from Subjects to Videos/QuizTests,
  // since those are subject-scoped, not chapter-scoped, content.
  Chapters: {
    subjectId: string;
    subjectTitle: string;
    yearId: string;
    yearTitle: string;
    mode?: "notes";
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

  // Product-based split: Video Lectures are always free and subject-scoped
  // (no chapterId, no unlocked check - every video in the subject shows).
  Videos: {
    subjectId: string;
    subjectTitle: string;
    yearId: string;
    yearTitle: string;
  };

  // Test list for a Subject - always free, shows every Test in it.
  QuizTests: {
    subjectId: string;
    subjectTitle: string;
    yearId: string;
    yearTitle: string;
  };

  // Plays a single Test's questions. Access is already free/unrestricted,
  // so this screen just plays whatever Test it's given.
  Quiz: {
    subjectId: string;
    subjectTitle: string;
    yearId: string;
    yearTitle: string;
    test: {
      id: string;
      title: string;
      questions: {
        question: string;
        options: string[];
      }[];
    };
  };

  Profile: undefined;
  Referral: undefined;
  ReferralTerms: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
  MyPurchases: undefined;
  Downloads: undefined;
  Notifications: undefined;

  PdfViewer: {
    pdfUrl: string;
  };

  Search: undefined;
  Settings: undefined;
  StudyReminder: undefined;

  // Reached by in-app navigation after provider verification. The screen
  // independently confirms the order and entitlement before showing success.
  PaymentSuccess: {
    title?: string;
    amount?: string;
    orderId?: string;
  };
  PaymentFailed: {
    title?: string;
    reason?: string;
    pending?: boolean;
    provider?: "razorpay" | "play";
    internalOrderId?: string;
    verifyUrl?: string;
    paymentId?: string;
  };
  OrderSummary: {
    productId: string;
    productTitle: string;
    ucbOrderId?: string;
  };
  PlayBilling: {
    productId: string;
    productTitle: string;
  };
  PaymentCheckout: {
    keyId: string;
    isLiveMode?: boolean;
    razorpayOrderId: string;
    amountPaise: number;
    productTitle: string;
    internalOrderId: string;
    verifyUrl: string;
    prefillName?: string;
    prefillEmail?: string;
    timeoutSeconds?: number;
  };
  About: undefined;
  Contact: undefined;
  Privacy: undefined;
  Terms: undefined;
};
