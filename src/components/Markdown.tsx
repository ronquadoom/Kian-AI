import type { ReactNode } from 'react';

/**
 * A tiny, safe Markdown renderer (no dangerouslySetInnerHTML) for model output.
 * Supports fenced code blocks, headings, lists, blockquotes, hr, links, and
 * inline code/bold/italic/strikethrough.
 */

const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(__[^_]+__)|(_[^_]+_)|(~~[^~]+~~)|(\[[^\]]*\]\([^)]*\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  const re = new RegExp(INLINE_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [full, code, bold, italic, ubold, uitalic, strike, link] = match;
    if (code) {
      nodes.push(<code key={`${keyPrefix}-${i++}`}>{code.slice(1, -1)}</code>);
    } else if (bold || ubold) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{renderInline((bold ?? ubold).slice(2, -2), `${keyPrefix}-b`)}</strong>);
    } else if (italic || uitalic) {
      nodes.push(<em key={`${keyPrefix}-${i++}`}>{renderInline((italic ?? uitalic).slice(1, -1), `${keyPrefix}-i`)}</em>);
    } else if (strike) {
      nodes.push(<s key={`${keyPrefix}-${i++}`}>{strike.slice(2, -2)}</s>);
    } else if (link) {
      const m = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(link);
      if (m) {
        const href = m[2];
        const safe = /^https?:\/\//i.test(href) ? href : undefined;
        nodes.push(
          safe ? (
            <a key={`${keyPrefix}-${i++}`} href={safe} target="_blank" rel="noopener noreferrer">
              {m[1] || safe}
            </a>
          ) : (
            <span key={`${keyPrefix}-${i++}`}>{m[1]}</span>
          ),
        );
      } else {
        nodes.push(link);
      }
    } else {
      nodes.push(full);
    }
    last = match.index + full.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderParagraph(text: string, key: string): ReactNode {
  return <p key={key}>{renderInline(text, key)}</p>;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];

  let i = 0;
  let key = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(renderParagraph(paragraph.join(' '), `p-${key++}`));
      paragraph = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line.trim())) {
      flushParagraph();
      const lang = line.trim().slice(3);
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(
        <pre key={`c-${key++}`}>
          <code className={lang ? `language-${lang}` : undefined}>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      const content = renderInline(heading[2], `h-${key}`);
      if (level === 1) blocks.push(<h1 key={`h-${key++}`}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h-${key++}`}>{content}</h2>);
      else if (level === 3) blocks.push(<h3 key={`h-${key++}`}>{content}</h3>);
      else blocks.push(<h4 key={`h-${key++}`}>{content}</h4>);
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushParagraph();
      blocks.push(<hr key={`hr-${key++}`} />);
      i += 1;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={`q-${key++}`}>{quote.map((q, qi) => renderParagraph(q, `q-${key}-${qi}`))}</blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${key++}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item, `ul-${key}-${ii}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${key++}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item, `ol-${key}-${ii}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Blank line — end paragraph
    if (line.trim() === '') {
      flushParagraph();
      i += 1;
      continue;
    }

    paragraph.push(line.trim());
    i += 1;
  }

  flushParagraph();

  return <div className="md">{blocks}</div>;
}
