/**
 * Client-side helpers to turn uploaded files into images for AI image questions.
 * PDFs are rendered page-by-page to PNG; image files are read directly.
 * Everything stays local — images come only from the user's own uploads.
 */

export type ExtractedImage = {
  /** full data URL, used both to display and (stripped) to send to the AI */
  dataUrl: string;
  mediaType: string;
};

const MAX_IMAGES = 20;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function pdfToImages(file: File): Promise<ExtractedImage[]> {
  const pdfjs = await import("pdfjs-dist");
  // point pdfjs at its bundled worker (Vite resolves this URL)
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: ExtractedImage[] = [];
  const pageCount = Math.min(doc.numPages, MAX_IMAGES);

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    out.push({ dataUrl: canvas.toDataURL("image/png"), mediaType: "image/png" });
  }
  return out;
}

/** Turn a list of uploaded files into images (PDF pages rendered, images kept). */
export async function extractImages(files: File[]): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  for (const file of files) {
    if (images.length >= MAX_IMAGES) break;
    if (file.type === "application/pdf") {
      images.push(...(await pdfToImages(file)));
    } else if (file.type.startsWith("image/")) {
      images.push({ dataUrl: await fileToDataUrl(file), mediaType: file.type });
    }
  }
  return images.slice(0, MAX_IMAGES);
}

/** Strip the "data:...;base64," prefix, returning raw base64. */
export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}
