import { useEffect, useState } from "react";

import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";
import SubjectPicker from "./SubjectPicker";

import type { QuizTest, QuizTestInput, QuizTestQuestion } from "../types/quiz";
import type { Year } from "../types/year";
import type { Subject } from "../types/subject";

type Props = {
  open: boolean;
  years: Year[];
  subjects: Subject[];
  initialData?: QuizTest | null;
  onClose: () => void;
  onSubmit: (data: QuizTestInput) => Promise<void>;
};

const REQUIRED_QUESTION_COUNT = 20;

function buildEmptyQuestion(): QuizTestQuestion {
  return { question: "", options: ["", "", "", ""], answer: "" };
}

function buildEmptyForm(): QuizTestInput {
  return {
    title: "",
    subjectId: "",
    subjectTitle: "",
    yearId: "",
    yearTitle: "",
    order: 1,
    active: true,
    questions: Array.from({ length: REQUIRED_QUESTION_COUNT }, buildEmptyQuestion),
  };
}

export default function QuizFormModal({
  open,
  years,
  subjects,
  initialData,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<QuizTestInput>(buildEmptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [questionErrors, setQuestionErrors] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        initialData
          ? {
              title: initialData.title,
              subjectId: initialData.subjectId,
              subjectTitle: initialData.subjectTitle,
              yearId: initialData.yearId,
              yearTitle: initialData.yearTitle,
              order: initialData.order,
              active: initialData.active,
              questions: initialData.questions.map((q) => ({
                question: q.question,
                options: [...q.options],
                answer: q.answer,
              })),
            }
          : buildEmptyForm()
      );
      setErrors({});
      setQuestionErrors({});
    }
  }, [open, initialData]);

  function updateQuestion(index: number, patch: Partial<QuizTestQuestion>) {
    const questions = [...form.questions];
    questions[index] = { ...questions[index], ...patch };
    setForm({ ...form, questions });
  }

  function handleOptionChange(qIndex: number, oIndex: number, value: string) {
    const question = form.questions[qIndex];
    const newOptions = [...question.options];
    const oldValue = newOptions[oIndex];
    newOptions[oIndex] = value;

    // keep answer pointing to the same option if it was selected as correct
    const answer = question.answer === oldValue ? value : question.answer;

    updateQuestion(qIndex, { options: newOptions, answer });
  }

  function addQuestion() {
    if (form.questions.length >= REQUIRED_QUESTION_COUNT) return;
    setForm({ ...form, questions: [...form.questions, buildEmptyQuestion()] });
  }

  function removeQuestion(index: number) {
    setForm({
      ...form,
      questions: form.questions.filter((_, i) => i !== index),
    });
  }

  function validate() {
    const newErrors: Record<string, string> = {};
    const newQuestionErrors: Record<number, string> = {};

    if (!form.title.trim()) newErrors.title = "Title is required";
    if (!form.subjectId) newErrors.subjectId = "Please select a Subject";
    if (form.order < 1) newErrors.order = "Order must be 1 or greater";

    if (form.questions.length !== REQUIRED_QUESTION_COUNT) {
      newErrors.questions = `This test needs exactly ${REQUIRED_QUESTION_COUNT} questions (currently ${form.questions.length})`;
    }

    form.questions.forEach((q, index) => {
      if (!q.question.trim()) {
        newQuestionErrors[index] = "Question text is required";
        return;
      }

      const filledOptions = q.options.filter((o) => o.trim());
      if (filledOptions.length < 2) {
        newQuestionErrors[index] = "Fill in at least 2 options";
        return;
      }

      if (!q.answer.trim() || !q.options.includes(q.answer)) {
        newQuestionErrors[index] = "Select the correct answer";
      }
    });

    setErrors(newErrors);
    setQuestionErrors(newQuestionErrors);
    return (
      Object.keys(newErrors).length === 0 &&
      Object.keys(newQuestionErrors).length === 0
    );
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
      title={initialData ? "Edit Quiz Test" : "Create New Quiz Test"}
    >
      {subjects.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Create at least one Subject first before adding a Quiz Test.
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
        label="Test Title"
        placeholder="e.g. Chapter 1-5 Revision Test"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        error={errors.title}
      />

      <Input
        label="Order"
        type="number"
        min={1}
        value={form.order}
        onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
        error={errors.order}
      />

      <label className="mb-5 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm({ ...form, active: e.target.checked })}
        />
        Active (visible to students)
      </label>

      <div className="mb-2 flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Questions ({form.questions.length} / {REQUIRED_QUESTION_COUNT})
        </label>
        {errors.questions && (
          <p className="text-xs text-red-500">{errors.questions}</p>
        )}
      </div>

      <div className="space-y-4">
        {form.questions.map((q, qIndex) => (
          <div
            key={qIndex}
            className="rounded-lg border border-gray-200 bg-gray-50 p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-600">
                Question {qIndex + 1}
              </span>
              {form.questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(qIndex)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            <textarea
              rows={2}
              placeholder="Question text"
              value={q.question}
              onChange={(e) =>
                updateQuestion(qIndex, { question: e.target.value })
              }
              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            />

            <div className="mb-2 space-y-2">
              {q.options.map((option, oIndex) => (
                <input
                  key={oIndex}
                  type="text"
                  placeholder={`Option ${oIndex + 1}`}
                  value={option}
                  onChange={(e) =>
                    handleOptionChange(qIndex, oIndex, e.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
                />
              ))}
            </div>

            <select
              value={q.answer}
              onChange={(e) =>
                updateQuestion(qIndex, { answer: e.target.value })
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
            >
              <option value="">-- Select the correct option --</option>
              {q.options
                .filter((o) => o.trim())
                .map((option, i) => (
                  <option key={i} value={option}>
                    {option}
                  </option>
                ))}
            </select>

            {questionErrors[qIndex] && (
              <p className="mt-1 text-xs text-red-500">
                {questionErrors[qIndex]}
              </p>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        disabled={form.questions.length >= REQUIRED_QUESTION_COUNT}
        className="mt-3 w-full rounded-lg border border-dashed border-green-600 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
      >
        {form.questions.length >= REQUIRED_QUESTION_COUNT
          ? "20 questions added"
          : `+ Add Question (${REQUIRED_QUESTION_COUNT - form.questions.length} more needed)`}
      </button>

      {errors.form && (
        <p className="mb-3 mt-3 text-sm text-red-500">{errors.form}</p>
      )}

      <div className="mt-5 flex justify-end gap-3">
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
