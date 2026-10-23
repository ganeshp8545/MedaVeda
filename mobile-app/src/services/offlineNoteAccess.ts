import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCurrentUser } from "./authState";
import { getSecureNoteUrl, NoteAccessError } from "./secureNotesService";
import { cancelDownload } from "../utils/downloadManager";
import { clearNoteVerification, hasRecentNoteVerification, recordNoteVerification } from "./offlineNoteVerification";

export async function mayOpenOfflineNote(noteId: string): Promise<boolean> {
  const owner = getCurrentUser()?.id;
  if (!owner || await AsyncStorage.getItem("medveda:offline-owner") !== owner) return false;
  const key = `medveda:note-denied:${owner}:${noteId}`;
  try {
    await getSecureNoteUrl(noteId);
    if (getCurrentUser()?.id !== owner) return false;
    await recordNoteVerification(owner, noteId);
    return getCurrentUser()?.id === owner;
  } catch (error) {
    if (getCurrentUser()?.id !== owner) return false;
    if (error instanceof NoteAccessError && (error.status === 403 || error.status === 401)) {
      await AsyncStorage.setItem(key, "1");
      await clearNoteVerification(owner, noteId);
      if (getCurrentUser()?.id === owner) await cancelDownload(noteId);
      return false;
    }
    if (error instanceof NoteAccessError && error.status !== undefined && error.status < 500 && error.status !== 429) return false;
    const denied = await AsyncStorage.getItem(key);
    const recent = denied !== "1" && await hasRecentNoteVerification(owner, noteId);
    return getCurrentUser()?.id === owner && recent;
  }
}
