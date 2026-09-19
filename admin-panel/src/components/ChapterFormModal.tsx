import { useEffect, useMemo, useState } from "react";

import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";

import type { Chapter, ChapterInput } from "../types/chapter";
import type { Year } from "../types/year";
import type { Subject } from "../types/subject";

type Props = {
  open: boolean;
  years: Year[];
  subjects: Subject[];
  initialData?: Chapter | null;
  onClose: () => void;
  onSubmit: (data: ChapterInput) => Promise<void>;
};

function buildEmptyForm(years: Year[]): ChapterInput {
  return {
    title: "",
    yearId: years[0]?.id ?? "",
    yearTitle: years[0]?.title ?? "",
    subjectId: "",
    subjectTitle: "",
    order: 1,
    active: true,
  };
}

export default function ChapterFormModal({
  open,
  years,
  subjects,
  initialData,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<ChapterInput>(buildEmptyForm(years));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              title: initialData.title,
              yearId: initialData.yearId,
              yearTitle: initialData.yearTitle,
              subjectId: initialData.subjectId,
              subjectTitle: initialData.subjectTitle,
              order: initialData.order,
              active: initialData.active,
            }
          : buildEmptyForm(years)
      );
      setErrors({});
    }
  }, [open, initialData, years]);

  const subjectsInYear = useMemo(
    () => subjects.filter((s) => s.yearId === form.yearId),
    [subjects, form.yearId]
  );

  function handleYearChange(yearId: string) {
    const selectedYear = years.find((y) => y.id === yearId);
    setForm({
      ...form,
      yearId,
      yearTitle: selectedYear?.title ?? "",
      subjectId: "",
      subjectTitle: "",
    });
  }

  function handleSubjectChange(subjectId: string) {
    const selectedSubject = subjects.find((s) => s.id === subjectId);
    setForm({
      ...form,
      subjectId,
      subjectTitle: selectedSubject?.title ?? "",
    });
  }

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.yearId) newErrors.yearId = "Please select a Year";
    if (!form.subjectId) newErrors.subjectId = "Please select a Subject";
    if (form.order < 1) newErrors.order = "Order must be 1 or higher";

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
      title={initialData ? "Edit Chapter" : "Create New Chapter"}
    >
      {years.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Year first.
        </p>
      )}

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Year
        </label>
        <select
          value={form.yearId}
          onChange={(e) => handleYearChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        >
          <option value="">-- Select --</option>
          {years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.title}
            </option>
          ))}
        </select>
        {errors.yearId && (
          <p className="mt-1 text-xs text-red-500">{errors.yearId}</p>
        )}
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Subject
        </label>
        <select
          value={form.subjectId}
          onChange={(e) => handleSubjectChange(e.target.value)}
          disabled={!form.yearId}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-100"
        >
          <option value="">-- Select --</option>
          {subjectsInYear.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.title}
            </option>
          ))}
        </select>
        {form.yearId && subjectsInYear.length === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            No subjects under this year yet - add one in Subjects first.
          </p>
        )}
        {errors.subjectId && (
          <p className="mt-1 text-xs text-red-500">{errors.subjectId}</p>
        )}
      </div>

      <Input
        label="Chapter Title"
        placeholder="e.g. Chapter 1: Introduction to Doshas"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        error={errors.title}
      />

      <Input
        label="Order"
        type="number"
        min={1}
        value={form.order}
        onChange={(e) =>
          setForm({ ...form, order: Number(e.target.value) })
        }
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
          disabled={years.length === 0}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
