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
      {lines.map((line, lineIndex) => (
        <span className="rich-text-line" key={`${lineIndex}-${line}`}>
          {line ? linkifyLine(line, lineIndex) : "\u00a0"}
        </span>
      ))}
    </div>
  );
}
