import { useEffect, useRef, useState } from "react";

import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";
import ChapterPicker from "./ChapterPicker";

import { extractStoragePath, getSignedUrl, uploadFile } from "../services/storageService";

import type { Note, NoteInput } from "../types/note";
import type { Year } from "../types/year";
import type { Course } from "../types/course";
import type { Subject } from "../types/subject";
import type { Chapter } from "../types/chapter";

type Props = {
  open: boolean;
  courses: Course[];
  years: Year[];
  subjects: Subject[];
  chapters: Chapter[];
  initialData?: Note | null;
  onClose: () => void;
  onSubmit: (data: NoteInput, uploadRequestId?: string) => Promise<void>;
};

function buildEmptyForm(): NoteInput {
  return {
    title: "",
    description: "",
    pdfUrl: "",
    chapterId: "",
    chapterTitle: "",
    yearId: "",
    courseId: "",
    order: 1,
    active: false,
    isFreePreview: false,
  };
}

export default function NoteFormModal({
  open,
  courses,
  years,
  subjects,
  chapters,
  initialData,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<NoteInput>(buildEmptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const uploadedRef = useRef<{ file: File; url: string; requestId: string } | null>(null);
  const requestRef = useRef<string | null>(null);

  // PDF upload state - a newly-picked file waiting to be uploaded, plus
  // upload progress. `form.pdfUrl` holds the *existing* URL when editing,
  // and only gets overwritten with the freshly-uploaded URL on submit.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              title: initialData.title,
              description: initialData.description ?? "",
              pdfUrl: initialData.pdfUrl,
              chapterId: initialData.chapterId,
              chapterTitle: initialData.chapterTitle,
              yearId: initialData.yearId,
              courseId: initialData.courseId,
              order: initialData.order,
              active: initialData.active,
              isFreePreview: initialData.isFreePreview ?? false,
            }
          : buildEmptyForm()
      );
      setErrors({});
      setSelectedFile(null);
      uploadedRef.current = null;
      requestRef.current = null;
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open, initialData]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;

    if (file && file.type !== "application/pdf") {
      setErrors({ ...errors, pdfUrl: "Please choose a PDF file" });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    uploadedRef.current = null;
    requestRef.current = file ? crypto.randomUUID() : null;
    setErrors({ ...errors, pdfUrl: "" });
  }

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!form.title.trim() || form.title.trim().length > 200) newErrors.title = "Title must be 1–200 characters";
    if (form.description.length > 2000) newErrors.description = "Description must be 2000 characters or less";
    if (!selectedFile && !form.pdfUrl.trim()) {
      newErrors.pdfUrl = "Please upload a PDF file";
    }
    if (!form.chapterId) newErrors.chapterId = "Please select a Chapter";
    if (!Number.isSafeInteger(form.order) || form.order < 1 || form.order > 2147483647) newErrors.order = "Order must be a whole number from 1 to 2147483647";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // The stored pdfUrl is a public-style URL that stops resolving once the
  // "notes" bucket is private, so open a short-lived signed URL instead. The
  // tab is opened synchronously (popup blockers) and pointed at the URL once
  // it is ready.
  async function handleViewCurrentPdf() {
    const path = extractStoragePath("notes", form.pdfUrl);
    if (!path) {
      // Not a notes-bucket URL (e.g. an external link): open it as-is.
      window.open(form.pdfUrl, "_blank", "noopener,noreferrer");
      return;
    }

    const tab = window.open("", "_blank");
    try {
      const signedUrl = await getSignedUrl("notes", path);
      if (tab) {
        tab.opener = null;
        tab.location.href = signedUrl;
      } else {
        window.location.assign(signedUrl);
      }
    } catch (err: any) {
      console.error(err);
      tab?.close();
      setErrors({
        ...errors,
        pdfUrl: "Could not open the current PDF. Please try again.",
      });
    }
  }

  async function handleSubmit() {
    if (savingRef.current) return;
    if (!validate()) return;

    try {
      savingRef.current = true;
      setSaving(true);

      let pdfUrl = form.pdfUrl;
      let uploadRequestId: string | undefined;

      if (selectedFile) {
        if (uploadedRef.current?.file === selectedFile) {
          pdfUrl = uploadedRef.current.url;
          uploadRequestId = uploadedRef.current.requestId;
        } else {
          setUploading(true);
          setUploadProgress(0);
          const result = await uploadFile(selectedFile, "notes", setUploadProgress,
            ["application/pdf"], requestRef.current ?? crypto.randomUUID());
          pdfUrl = result.pdfUrl;
          uploadRequestId = result.requestId;
          uploadedRef.current = { file: selectedFile, url: pdfUrl, requestId: result.requestId };
          setUploading(false);
        }
      }

      await onSubmit({ ...form, pdfUrl }, uploadRequestId);
      onClose();
    } catch (err: any) {
      console.error(err);
      setUploading(false);
      setErrors({
        form:
          err?.message && typeof err.message === "string"
            ? err.message
            : "Something went wrong while saving. Please try again.",
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={saving}
      title={initialData ? "Edit Note" : "Create New Note"}
    >
      <fieldset disabled={saving} className="min-w-0">
      {chapters.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Chapter first before adding a Note.
        </p>
      )}

      <ChapterPicker
        key={open ? initialData?.id ?? "new" : "closed"}
        courses={courses}
        years={years}
        subjects={subjects}
        chapters={chapters}
        chapterId={form.chapterId}
        onChange={(chapterId, chapterTitle, yearId, courseId) =>
          setForm({ ...form, chapterId, chapterTitle, yearId, courseId })
        }
        error={errors.chapterId}
      />

      <Input
        label="Title"
        placeholder="e.g. Bone Structure Notes"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        error={errors.title}
      />

      <div className="mb-4">
        <label htmlFor="note-description" className="mb-1.5 block text-sm font-medium text-gray-700">Description</label>
        <textarea id="note-description" rows={3} maxLength={2000}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
        {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          PDF File
        </label>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-green-700 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-green-800"
        />

        {selectedFile && (
          <p className="mt-1.5 text-xs text-gray-600">
            Selected: {selectedFile.name}
          </p>
        )}

        {!selectedFile && form.pdfUrl && (
          <button
            type="button"
            onClick={handleViewCurrentPdf}
            className="mt-1.5 inline-block text-xs font-medium text-green-700 hover:underline"
          >
            View current PDF
          </button>
        )}

        {uploading && (
          <div className="mt-2">
            <p className="mt-1 text-xs text-gray-500" role="status">
              {uploadProgress === 100 ? "Upload complete. Saving note..." : uploadProgress === 75 ? "PDF uploaded. Waiting for validation..." : "Uploading PDF..."}
            </p>
          </div>
        )}

        {errors.pdfUrl && (
          <p className="mt-1 text-xs text-red-500">{errors.pdfUrl}</p>
        )}
      </div>

      <Input
        label="Order"
        type="number"
        min={1}
        value={form.order}
        onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
        error={errors.order}
      />

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        Active (visible to students)
      </label>

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.isFreePreview}
          onChange={(e) => setForm({ ...form, isFreePreview: e.target.checked })}
        />
        Free preview (any signed-in student can open this without buying)
      </label>

      {errors.form && (
        <p className="mb-3 text-sm text-red-500">{errors.form}</p>
      )}

      <div className="mt-2 flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          loading={saving}
          disabled={chapters.length === 0 || !form.chapterId}
        >
          Save
        </Button>
      </div>
      </fieldset>
    </Modal>
  );
}
