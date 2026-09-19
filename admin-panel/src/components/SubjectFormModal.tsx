import { useEffect, useState } from "react";

import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";

import type { Subject, SubjectInput } from "../types/subject";
import type { Year } from "../types/year";

type Props = {
  open: boolean;
  years: Year[];
  initialData?: Subject | null;
  onClose: () => void;
  onSubmit: (data: SubjectInput) => Promise<void>;
};

function buildEmptyForm(years: Year[]): SubjectInput {
  return {
    title: "",
    icon: "📖",
    color: "#2196F3",
    yearId: years[0]?.id ?? "",
    yearTitle: years[0]?.title ?? "",
    order: 1,
    active: true,
  };
}

export default function SubjectFormModal({
  open,
  years,
  initialData,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<SubjectInput>(buildEmptyForm(years));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              title: initialData.title,
              icon: initialData.icon,
              color: initialData.color,
              yearId: initialData.yearId,
              yearTitle: initialData.yearTitle,
              order: initialData.order,
              active: initialData.active,
            }
          : buildEmptyForm(years)
      );
      setErrors({});
    }
  }, [open, initialData, years]);

  function handleYearChange(yearId: string) {
    const selectedYear = years.find((y) => y.id === yearId);
    setForm({
      ...form,
      yearId,
      yearTitle: selectedYear?.title ?? "",
    });
  }

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.yearId) newErrors.yearId = "Please select a Year";
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
      title={initialData ? "Edit Subject" : "Create New Subject"}
    >
      {years.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Year first before adding a Subject.
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

      <Input
        label="Title"
        placeholder="e.g. Kriya Sharir"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        error={errors.title}
      />

      <Input
        label="Icon (emoji)"
        placeholder="📖"
        value={form.icon}
        onChange={(e) => setForm({ ...form, icon: e.target.value })}
      />

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Color
        </label>
        <input
          type="color"
          value={form.color}
          onChange={(e) => setForm({ ...form, color: e.target.value })}
          className="h-10 w-20 cursor-pointer rounded-lg border border-gray-300"
        />
      </div>

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
