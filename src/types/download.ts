// Roadmap change 8 - Offline / Downloads.
//
// Unlike every other type in this folder, this one has NO Firestore
// collection behind it - a download is purely a local artifact (a PDF
// file on device storage + a metadata entry in AsyncStorage). It is
// never written to or read from Firestore, and never synced across
// devices. See utils/downloadsManager.ts for where it's actually stored.
export interface DownloadedNote {
  id: string; // Note id (same id as the Firestore "notes" doc it came from)
  title: string;

  chapterId: string;
  chapterTitle: string;
  subjectId: string;
  subjectTitle: string;
  yearId: string;
  yearTitle: string;

  // file:// URI on-device where the PDF actually lives - this is what
  // gets passed straight into PdfViewerScreen for offline reading.
  localUri: string;

  fileSizeBytes?: number;
  downloadedAt: number;
}
