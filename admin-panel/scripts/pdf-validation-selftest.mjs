import assert from "node:assert/strict";
import { validatePdf } from "../src/utils/pdfValidation.ts";
import { isSupportedYouTubeUrl } from "../src/utils/videoUrl.ts";
import { validateQuizQuestion } from "../src/utils/quizValidation.ts";

await validatePdf(new File(["%PDF-1.4\n%%EOF"], "sample.pdf", { type: "application/pdf" }));
await assert.rejects(
  validatePdf(new File(["<html>fake</html>"], "fake.pdf", { type: "application/pdf" })),
  /not a valid PDF/
);
await assert.rejects(
  validatePdf(new File(["%PDF-1.4"], "sample.txt", { type: "text/plain" })),
  /Choose a PDF/
);
await assert.rejects(
  validatePdf(new File([], "empty.pdf", { type: "application/pdf" })),
  /Choose a PDF/
);
console.log("PDF validation checks passed.");
assert.equal(isSupportedYouTubeUrl("https://www.youtube.com/watch?v=abc123"), true);
assert.equal(isSupportedYouTubeUrl("https://youtu.be/abc123"), true);
assert.equal(isSupportedYouTubeUrl("https://youtube.com.evil.example/watch?v=abc123"), false);
assert.equal(isSupportedYouTubeUrl("http://youtube.com/watch?v=abc123"), false);
assert.equal(isSupportedYouTubeUrl("javascript:alert(1)"), false);
console.log("Video URL validation checks passed.");
const question = { question: "Question?", options: ["Yes", "No", "", ""], answer: "Yes" };
assert.equal(validateQuizQuestion(question), null);
assert.equal(validateQuizQuestion({ ...question, options: ["Yes", " yes ", "", ""] }), "Options must be unique");
assert.equal(validateQuizQuestion({ ...question, answer: "Missing" }), "Select the correct answer");
console.log("Quiz option validation checks passed.");
