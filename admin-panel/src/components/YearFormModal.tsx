import { useEffect, useState } from "react";

import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";

import type { Year, YearInput } from "../types/year";

type Props = {
  open: boolean;
  initialData?: Year | null;
  onClose: () => void;
  onSubmit: (data: YearInput) => Promise<void>;
};

const emptyForm: YearInput = {
  title: "",
  icon: "📘",
  color: "#4CAF50",
  order: 1,
  active: true,
};

export default function YearFormModal({
  open,
  initialData,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<YearInput>(emptyForm);
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
              order: initialData.order,
              active: initialData.active,
            }
          : emptyForm
      );
      setErrors({});
    }
  }, [open, initialData]);

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.icon.trim()) newErrors.icon = "Icon is required";
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
      title={initialData ? "Edit Year" : "Create New Year"}
    >
      <Input
        label="Title"
        placeholder="e.g. 1st Professional"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        error={errors.title}
      />

      <Input
        label="Icon (emoji)"
        placeholder="📘"
        value={form.icon}
        onChange={(e) => setForm({ ...form, icon: e.target.value })}
        error={errors.icon}
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
        <Button onClick={handleSubmit} loading={saving}>
          Save
        </Button>
      </div>
    </Modal>
  );
}
