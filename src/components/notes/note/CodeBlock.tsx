import { memo } from 'react';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import makefile from 'react-syntax-highlighter/dist/esm/languages/prism/makefile';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// PrismLight + explicit registrations: the default Prism build bundles every
// grammar (~1.2 MB) into whichever client chunk imports this component.
// Unregistered languages render unhighlighted — an acceptable fallback.
const LANGUAGES = {
  bash,
  c,
  cpp,
  diff,
  javascript,
  json,
  jsx,
  makefile,
  python,
  sql,
  tsx,
  typescript,
  yaml,
} as const;

for (const [name, language] of Object.entries(LANGUAGES)) {
  SyntaxHighlighter.registerLanguage(name, language);
}

export const CodeBlock = memo(function CodeBlock({
  codes,
  language,
}: {
  codes: string | string[];
  language: string;
}) {
  return (
    <SyntaxHighlighter
      showLineNumbers
      wrapLines
      style={oneDark}
      customStyle={{ margin: 0 }}
      language={language}
      PreTag="div"
    >
      {codes}
    </SyntaxHighlighter>
  );
});
