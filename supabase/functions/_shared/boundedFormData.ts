// Bound bytes before multipart parsing, including chunked requests. Avoid
// retaining a chunk list plus a second contiguous copy of the entire request.
export class UploadBodyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function boundedFormData(
  req: Request,
  limit: number,
): Promise<FormData> {
  if (!req.body) throw new UploadBodyError("Request body required", 400);
  const contentType = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new UploadBodyError("Multipart form data required", 400);
  }
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) {
    throw new UploadBodyError("PDF is too large", 413);
  }
  let received = 0;
  let exceeded = false;
  const bounded = req.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > limit) {
          exceeded = true;
          throw new UploadBodyError("PDF is too large", 413);
        }
        controller.enqueue(chunk);
      },
    }),
  );
  try {
    return await new Response(bounded, {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new UploadBodyError(
      exceeded ? "PDF is too large" : "Invalid multipart body",
      exceeded ? 413 : 400,
    );
  }
}
