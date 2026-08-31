import type { ReactNode } from "react";
import { Fragment } from "react";

/** Renders bold (**x**) and italic (*x* / _x_) spans inside a line of text. */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|_[^_]+_)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (
      (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) ||
      (part.startsWith("_") && part.endsWith("_"))
    ) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function isTableSeparator(line: string) {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line.trim());
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "p"; text: string };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", lines: quoteLines });
      continue;
    }

    // Paragraph: collect consecutive non-blank, non-special lines.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+[.)]\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith(">") &&
      !lines[i].trim().startsWith("|")
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "p", text: paraLines.join(" ") });
  }

  return blocks;
}

const HEADING_CLASSES: Record<number, string> = {
  1: "mt-6 mb-2 text-lg font-bold text-foreground first:mt-0",
  2: "mt-5 mb-2 text-base font-bold text-foreground first:mt-0",
  3: "mt-4 mb-1.5 text-sm font-bold uppercase tracking-wide text-primary first:mt-0",
  4: "mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0",
};

/** Lightweight, dependency-free renderer for the AI-generated note bodies:
 *  headings, bullet/numbered lists, blockquotes, pipe tables, bold/italic/code.
 *  Builds React elements directly (no HTML parsing) so there's no injection risk. */
export function NoteMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text ?? "");
  if (!blocks.length) return null;

  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const level = Math.min(block.level + 1, 4);
            return (
              <p key={i} className={HEADING_CLASSES[level] ?? HEADING_CLASSES[4]}>
                {renderInline(block.text)}
              </p>
            );
          }
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5 marker:text-primary/60">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-primary">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="rounded-r-lg border-l-[3px] border-accent bg-accent/5 py-2 pl-4 pr-3 italic text-foreground/80"
              >
                {block.lines.map((l, j) => (
                  <p key={j}>{renderInline(l)}</p>
                ))}
              </blockquote>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-muted">
                      {block.header.map((h, j) => (
                        <th key={j} className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j} className={j % 2 ? "bg-muted/30" : undefined}>
                        {row.map((cell, k) => (
                          <td key={k} className="border-b border-border/60 px-3 py-2 align-top">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "p":
          default:
            return <p key={i}>{renderInline((block as { text: string }).text)}</p>;
        }
      })}
    </div>
  );
}
