import { memo } from 'react';
import Markdown, { type Components } from 'react-markdown';

import remarkGfm from 'remark-gfm';

import { CodeBlock } from './CodeBlock';

const markdownComponents: Components = {
  // GFM tables have no intrinsic overflow handling; without a scroll
  // container a wide table forces horizontal page scroll on mobile.
  table({ children }) {
    return (
      <div className="overflow-x-auto">
        <table>{children}</table>
      </div>
    );
  },
  // react-markdown v10 removed the `inline` prop; block code is detected by
  // the language-* class that only fenced blocks carry.
  code({ node: _node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');

    return match ? (
      <div className="not-prose note-code-block overflow-x-auto">
        <CodeBlock
          language={match[1]}
          codes={String(children).replace(/\n$/, '')}
        />
      </div>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export const NoteContent = memo(function NoteContent({
  content,
}: {
  content: string;
}) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {content}
    </Markdown>
  );
});
