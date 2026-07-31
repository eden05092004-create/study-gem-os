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

const MAX_IMAGES = 40;

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

/**
 * Rough count of top-level numbered questions, found by scanning each page's text
 * layer for lines that start with a number marker ("12.", "12)"). This is only a
 * sanity-check hint for the parser — never ground truth, since some exams number
 * differently — used to catch the AI silently dropping questions during extraction.
 */
export async function estimateQuestionCount(file: File): Promise<number> {
  if (file.type !== "application/pdf") return 0;
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
  ).default;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const marker = /^\s*(\d{1,3})[.)]\s+\S/;
  const seen = new Set<number>();
  const pageCount = Math.min(doc.numPages, MAX_IMAGES);

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lineText = "";
    let lastY: number | null = null;
    const flushLine = () => {
      const m = marker.exec(lineText);
      if (m) seen.add(Number(m[1]));
      lineText = "";
    };
    for (const item of content.items as { str?: string; transform?: number[] }[]) {
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) flushLine();
      lineText += item.str ?? "";
      if (y !== undefined) lastY = y;
    }
    flushLine();
  }
  return seen.size;
}
