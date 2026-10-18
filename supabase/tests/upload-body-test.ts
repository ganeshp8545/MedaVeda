import {
  boundedFormData,
  UploadBodyError,
} from "../functions/_shared/boundedFormData.ts";

Deno.test("valid multipart preserves request and file", async () => {
  const form = new FormData();
  form.append("request_id", "test");
  form.append(
    "file",
    new Blob(["sample"], { type: "application/pdf" }),
    "test.pdf",
  );
  const result = await boundedFormData(
    new Request("https://example.invalid", { method: "POST", body: form }),
    4096,
  );
  if (
    result.get("request_id") !== "test" ||
    await (result.get("file") as File).text() !== "sample"
  ) throw new Error("Payload changed");
});
for (
  const [name, headers, body, limit, status] of [
    [
      "declared oversized",
      {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": "1000",
      },
      "x",
      10,
      413,
    ],
    [
      "lying length bounded",
      {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": "1",
      },
      "x".repeat(100),
      10,
      413,
    ],
    [
      "missing length bounded",
      { "content-type": "multipart/form-data; boundary=x" },
      "x".repeat(100),
      10,
      413,
    ],
    [
      "malformed multipart",
      { "content-type": "multipart/form-data; boundary=x" },
      "broken",
      100,
      400,
    ],
    [
      "wrong content type",
      { "content-type": "application/json" },
      "{}",
      100,
      400,
    ],
  ] as const
) {
  Deno.test(name, async () => {
    try {
      await boundedFormData(
        new Request("https://example.invalid", {
          method: "POST",
          headers,
          body,
        }),
        limit,
      );
    } catch (error) {
      if (error instanceof UploadBodyError && error.status === status) return;
      throw error;
    }
    throw new Error("Invalid body accepted");
  });
}
