import { useEffect, useState } from "react";

import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";

import type { Course, CourseInput } from "../types/course";

type Props = {
  open: boolean;
  initialData?: Course | null;
  onClose: () => void;
  // `id` is only sent on create, and only if the admin typed one.
  onSubmit: (data: CourseInput & { id?: string }) => Promise<void>;
};

const emptyForm: CourseInput = {
  name: "",
  code: "",
  description: "",
  icon: "🎓",
  displayOrder: 1,
  active: true,
};

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export default function CourseFormModal({ open, initialData, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<CourseInput>(emptyForm);
  const [id, setId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              name: initialData.name,
              code: initialData.code,
              description: initialData.description ?? "",
              icon: initialData.icon ?? "",
              displayOrder: initialData.displayOrder,
              active: initialData.active,
            }
          : emptyForm
      );
      setId("");
      setErrors({});
    }
  }, [open, initialData]);

  function validate() {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) newErrors.name = "Name is required";
    if (!form.code.trim()) newErrors.code = "Code is required";
    if (form.displayOrder < 1) newErrors.displayOrder = "Order must be 1 or greater";
    if (!initialData && id && !ID_PATTERN.test(id)) {
      newErrors.id = "Use lowercase letters, numbers, - or _ only";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    try {
      setSaving(true);
      const payload: CourseInput = {
        ...form,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description?.trim() || undefined,
        icon: form.icon?.trim() || undefined,
      };
      await onSubmit(!initialData && id ? { ...payload, id } : payload);
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
      title={initialData ? "Edit Course" : "Create New Course"}
    >
      <Input
        label="Name"
        placeholder="e.g. BAMS"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        error={errors.name}
      />

      <Input
        label="Code (unique)"
        placeholder="e.g. BAMS"
        value={form.code}
        onChange={(e) => setForm({ ...form, code: e.target.value })}
        error={errors.code}
      />

      {!initialData && (
        <Input
          label="ID (optional)"
          placeholder="Leave blank to auto-generate, e.g. bams"
          value={id}
          onChange={(e) => setId(e.target.value)}
          error={errors.id}
        />
      )}

      <div className="mb-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          rows={2}
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        />
      </div>

      <Input
        label="Icon (emoji)"
        placeholder="🎓"
        value={form.icon ?? ""}
        onChange={(e) => setForm({ ...form, icon: e.target.value })}
      />

      <Input
        label="Display order"
        type="number"
        min={1}
        value={form.displayOrder}
        onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })}
        error={errors.displayOrder}
      />

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        Active (visible to students)
      </label>

      {errors.form && <p className="mb-3 text-sm text-red-500">{errors.form}</p>}

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
