import type { ReactNode } from "react";

const URL_PATTERN = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function linkifyLine(line: string, lineIndex: number): ReactNode[] {
  const parts = line.split(URL_PATTERN);

  return parts.map((part, partIndex) => {
    const isUrl = /^(https?:\/\/|www\.)/i.test(part);

    if (!isUrl) {
      return <span key={`${lineIndex}-${partIndex}`}>{part}</span>;
    }

    const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;

    return (
      <a
        key={`${lineIndex}-${partIndex}`}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {part}
      </a>
    );
  });
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.split(/\r?\n/);

  return (
    <div className={`rich-text ${className}`.trim()}>
      {lines.map((line, lineIndex) => {
        const containsUrl = /(https?:\/\/[^\s]+|www\.[^\s]+)/i.test(line);
        const containsHebrew = /[\u0590-\u05FF]/.test(line);
        const alignLinkLeft = containsUrl && !containsHebrew;

        return (
          <span
            className={`rich-text-line${alignLinkLeft ? " rich-text-line-left-link" : ""}`}
            dir={alignLinkLeft ? "ltr" : undefined}
            key={`${lineIndex}-${line}`}
          >
            {line ? linkifyLine(line, lineIndex) : "\u00a0"}
          </span>
        );
      })}
    </div>
  );
}
