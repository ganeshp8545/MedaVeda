import { useEffect, useState } from "react";

import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";
import SubjectPicker from "./SubjectPicker";

import type { Video, VideoInput } from "../types/video";
import type { Year } from "../types/year";
import type { Subject } from "../types/subject";

type Props = {
  open: boolean;
  years: Year[];
  subjects: Subject[];
  initialData?: Video | null;
  onClose: () => void;
  onSubmit: (data: VideoInput) => Promise<void>;
};

function buildEmptyForm(): VideoInput {
  return {
    title: "",
    youtubeUrl: "",
    subjectId: "",
    subjectTitle: "",
    yearId: "",
    yearTitle: "",
    order: 1,
    active: true,
  };
}

export default function VideoFormModal({
  open,
  years,
  subjects,
  initialData,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<VideoInput>(buildEmptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              title: initialData.title,
              youtubeUrl: initialData.youtubeUrl,
              subjectId: initialData.subjectId,
              subjectTitle: initialData.subjectTitle,
              yearId: initialData.yearId,
              yearTitle: initialData.yearTitle,
              order: initialData.order,
              active: initialData.active,
            }
          : buildEmptyForm()
      );
      setErrors({});
    }
  }, [open, initialData]);

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.youtubeUrl.trim()) newErrors.youtubeUrl = "YouTube URL is required";
    if (!form.subjectId) newErrors.subjectId = "Please select a Subject";
    if (form.order < 1) newErrors.order = "Order must be 1 or greater";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    try {
      setSaving(true);
      await onSubmit(form);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrors({
        form:
          err?.message && typeof err.message === "string"
            ? err.message
            : "Something went wrong while saving. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialData ? "Edit Video" : "Create New Video"}
    >
      {subjects.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Subject first before adding a Video.
        </p>
      )}

      <SubjectPicker
        years={years}
        subjects={subjects}
        subjectId={form.subjectId}
        onChange={(subjectId, subjectTitle, yearId, yearTitle) =>
          setForm({ ...form, subjectId, subjectTitle, yearId, yearTitle })
        }
        error={errors.subjectId}
      />

      <Input
        label="Title"
        placeholder="e.g. Chapter 1 - Introduction"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        error={errors.title}
      />

      <Input
        label="YouTube URL"
        placeholder="https://youtube.com/..."
        value={form.youtubeUrl}
        onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
        error={errors.youtubeUrl}
      />

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
          disabled={subjects.length === 0}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
