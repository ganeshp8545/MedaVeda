import { useEffect, useMemo, useState } from "react";

import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";
import CoursePicker from "./CoursePicker";

import type { Product, ProductInput, ProductScope, ProductType } from "../types/product";
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
  initialData?: Product | null;
  onClose: () => void;
  onSubmit: (data: ProductInput) => Promise<void>;
};

const SCOPES: { value: ProductScope; label: string; hint: string }[] = [
  { value: "chapter", label: "Single Chapter", hint: "Unlocks paid notes in one chapter; videos are free" },
  { value: "subject", label: "Full Subject", hint: "Unlocks every chapter under one subject" },
  { value: "year", label: "Full Year", hint: "Unlocks every subject/chapter under one year" },
  { value: "bundle", label: "Multi-Year Bundle", hint: "Unlocks 2 or 3 whole years combined" },
];

function buildEmptyForm(): ProductInput {
  return {
    title: "",
    description: "",
    scope: "chapter",
    productType: "notes",
    courseId: "",
    price: 0,
    originalPrice: undefined,
    thumbnail: "",
    chapterId: "",
    chapterTitle: "",
    subjectId: "",
    subjectTitle: "",
    yearId: "",
    yearTitle: "",
    yearIds: [],
    yearTitles: [],
    active: true,
  };
}

export default function ProductFormModal({
  open,
  courses,
  years: allYears,
  subjects: allSubjects,
  chapters: allChapters,
  initialData,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<ProductInput>(buildEmptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Everything below the course picker is limited to the chosen course, so a
  // product can never point at another course's year/subject/chapter (the DB
  // trigger enforces the same rule).
  const years = useMemo(
    () => allYears.filter((y) => y.courseId === form.courseId),
    [allYears, form.courseId]
  );
  const subjects = useMemo(
    () => allSubjects.filter((s) => s.courseId === form.courseId),
    [allSubjects, form.courseId]
  );
  const chapters = useMemo(
    () => allChapters.filter((c) => c.courseId === form.courseId),
    [allChapters, form.courseId]
  );

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              title: initialData.title,
              description: initialData.description,
              scope: initialData.scope,
              productType: initialData.productType ?? "other",
              courseId: initialData.courseId,
              price: initialData.price,
              originalPrice: initialData.originalPrice ?? undefined,
              thumbnail: initialData.thumbnail,
              chapterId: initialData.chapterId ?? "",
              chapterTitle: initialData.chapterTitle ?? "",
              subjectId: initialData.subjectId ?? "",
              subjectTitle: initialData.subjectTitle ?? "",
              yearId: initialData.yearId ?? "",
              yearTitle: initialData.yearTitle ?? "",
              yearIds: initialData.yearIds ?? [],
              yearTitles: initialData.yearTitles ?? [],
              active: initialData.active,
            }
          : buildEmptyForm()
      );
      setErrors({});
    }
  }, [open, initialData]);

  // For "chapter" and "subject" scope, narrow down via Year -> Subject.
  const [pickerYearId, setPickerYearId] = useState("");

  useEffect(() => {
    if (open) {
      setPickerYearId(initialData?.yearId ?? "");
    }
  }, [open, initialData]);

  const subjectsInPickerYear = useMemo(
    () => subjects.filter((s) => s.yearId === pickerYearId),
    [subjects, pickerYearId]
  );

  const chaptersInSubject = useMemo(
    () => chapters.filter((c) => c.subjectId === form.subjectId),
    [chapters, form.subjectId]
  );

  function handleScopeChange(scope: ProductScope) {
    setForm({
      ...buildEmptyForm(),
      title: form.title,
      description: form.description,
      price: form.price,
      originalPrice: form.originalPrice,
      thumbnail: form.thumbnail,
      active: form.active,
      productType: form.productType === "notes" || form.productType === "notes_bundle"
        ? scope === "bundle" ? "notes_bundle" : "notes" : form.productType,
      courseId: form.courseId,
      scope,
    });
    setPickerYearId("");
  }

  // Changing the course clears every selection below it (scope-specific
  // targets), keeping only the basic product details.
  function handleCourseChange(courseId: string) {
    setForm({
      ...buildEmptyForm(),
      title: form.title,
      description: form.description,
      price: form.price,
      originalPrice: form.originalPrice,
      thumbnail: form.thumbnail,
      active: form.active,
      productType: form.productType,
      scope: form.scope,
      courseId,
    });
    setPickerYearId("");
  }

  function handlePickerYearChange(yearId: string) {
    const selectedYear = years.find((y) => y.id === yearId);
    setPickerYearId(yearId);

    if (form.scope === "year") {
      setForm({ ...form, yearId, yearTitle: selectedYear?.title ?? "" });
    } else {
      setForm({
        ...form,
        yearId,
        yearTitle: selectedYear?.title ?? "",
        subjectId: "",
        subjectTitle: "",
        chapterId: "",
        chapterTitle: "",
      });
    }
  }

  function handleSubjectChange(subjectId: string) {
    const selectedSubject = subjects.find((s) => s.id === subjectId);
    setForm({
      ...form,
      subjectId,
      subjectTitle: selectedSubject?.title ?? "",
      chapterId: "",
      chapterTitle: "",
    });
  }

  function handleChapterChange(chapterId: string) {
    const selectedChapter = chapters.find((c) => c.id === chapterId);
    setForm({
      ...form,
      chapterId,
      chapterTitle: selectedChapter?.title ?? "",
    });
  }

  function toggleBundleYear(yearId: string) {
    const current = form.yearIds ?? [];
    const isSelected = current.includes(yearId);

    const nextIds = isSelected
      ? current.filter((id) => id !== yearId)
      : [...current, yearId];

    const nextTitles = nextIds
      .map((id) => years.find((y) => y.id === id)?.title ?? "")
      .filter(Boolean);

    setForm({ ...form, yearIds: nextIds, yearTitles: nextTitles });
  }

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!form.courseId) newErrors.courseId = "Please select a Course";
    if (!form.title.trim()) newErrors.title = "Title is required";
    if ((form.productType === "notes_bundle") !== (form.scope === "bundle") &&
        (form.productType === "notes" || form.productType === "notes_bundle"))
      newErrors.productType = "Use Notes for chapter, subject or year; Notes bundle for a bundle";
    if (!Number.isFinite(form.price) || form.price < 0 || form.price > 99999999.99 ||
        Math.abs(form.price * 100 - Math.round(form.price * 100)) > 0.000001)
      newErrors.price = "Enter a nonnegative INR price with at most two decimal places";
    if (
      form.originalPrice !== undefined &&
      form.originalPrice !== null &&
      form.originalPrice !== 0 &&
      form.originalPrice < form.price
    ) {
      newErrors.originalPrice = "M.R.P. should be higher than the selling price";
    }

    if (form.scope === "chapter" && !form.chapterId) {
      newErrors.selection = "Please select Year, Subject & Chapter";
    }
    if (form.scope === "subject" && !form.subjectId) {
      newErrors.selection = "Please select Year & Subject";
    }
    if (form.scope === "year" && !form.yearId) {
      newErrors.selection = "Please select a Year";
    }
    if (form.scope === "bundle" && (form.yearIds ?? []).length < 2) {
      newErrors.selection = "Select at least 2 years for a bundle";
    }

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
      title={initialData ? "Edit Product" : "Create New Product"}
    >
      {allYears.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Year first before adding a Product.
        </p>
      )}

      <div className="mb-4">
        <CoursePicker
          courses={courses}
          value={form.courseId}
          onChange={handleCourseChange}
          error={errors.courseId}
        />
      </div>

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          What does this product unlock?
        </label>
        <div className="grid grid-cols-2 gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => handleScopeChange(s.value)}
              className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                form.scope === s.value
                  ? "border-green-600 bg-green-50 text-green-800"
                  : "border-gray-300 text-gray-600 hover:border-gray-400"
              }`}
            >
              <div className="font-medium">{s.label}</div>
              <div className="text-xs text-gray-500">{s.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Title"
        placeholder="e.g. Kriya Sharir - Full Subject Pack"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        error={errors.title}
      />

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        />
      </div>

      {/* Scope-specific selection */}
      {form.scope === "bundle" ? (
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Select 2 or 3 Years to bundle
          </label>
          <div className="flex flex-wrap gap-2">
            {years.map((year) => {
              const selected = (form.yearIds ?? []).includes(year.id);
              return (
                <button
                  key={year.id}
                  type="button"
                  onClick={() => toggleBundleYear(year.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    selected
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-gray-300 text-gray-600 hover:border-gray-400"
                  }`}
                >
                  {year.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Year
            </label>
            <select
              value={pickerYearId}
              onChange={(e) => handlePickerYearChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            >
              <option value="">-- Select --</option>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.title}
                </option>
              ))}
            </select>
          </div>

          {form.scope !== "year" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Subject
              </label>
              <select
                value={form.subjectId}
                onChange={(e) => handleSubjectChange(e.target.value)}
                disabled={!pickerYearId}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-100"
              >
                <option value="">-- Select --</option>
                {subjectsInPickerYear.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.scope === "chapter" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Chapter
              </label>
              <select
                value={form.chapterId}
                onChange={(e) => handleChapterChange(e.target.value)}
                disabled={!form.subjectId}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-100"
              >
                <option value="">-- Select --</option>
                {chaptersInSubject.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {errors.selection && (
        <p className="mb-3 -mt-2 text-xs text-red-500">{errors.selection}</p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4">
        <Input
          label="Price (₹)"
          type="number"
          min={0}
          step={0.01}
          value={form.price}
          onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
          error={errors.price}
        />

        <Input
          label="M.R.P. (₹) — optional"
          type="number"
          min={0}
          placeholder="Leave blank for no discount"
          value={form.originalPrice ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              originalPrice: e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
          error={errors.originalPrice}
        />
      </div>

      <div className="mb-4">
        <Input
          label="Thumbnail URL"
          placeholder="https://..."
          value={form.thumbnail}
          onChange={(e) => setForm({ ...form, thumbnail: e.target.value })}
        />
      </div>

      {!!form.originalPrice && form.originalPrice > form.price && (
        <p className="mb-4 -mt-2 text-xs text-green-700">
          Shown to students as M.R.P. ₹{form.originalPrice} (
          {Math.round(((form.originalPrice - form.price) / form.originalPrice) * 100)}% off)
        </p>
      )}

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Product classification
        </label>
        <select
          value={form.productType}
          onChange={(e) => setForm({ ...form, productType: e.target.value as ProductType })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        >
          <option value="other">Unclassified legacy product — review required</option>
          <option value="notes">Paid notes — chapter, subject or year</option>
          <option value="notes_bundle">Paid notes bundle</option>
          <option value="video">Video — free, not billable</option>
        </select>
        {errors.productType && <p className="mt-1 text-xs text-red-600">{errors.productType}</p>}
        <p className="mt-1 text-xs text-gray-500">
          Google Play can bill only explicitly classified paid notes with a paid PDF in the selected scope.
          Review legacy products before changing their classification. Videos remain free.
        </p>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        Active (visible in Store)
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
          disabled={!form.courseId || years.length === 0}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}
