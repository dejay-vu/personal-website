import nextVitals from 'eslint-config-next/core-web-vitals';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  ...nextVitals,
  prettier,
  {
    // Scoped to TS files: eslint-config-next only registers the
    // @typescript-eslint plugin for these globs.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'build/**',
    'out/**',
    'next-env.d.ts',
    'src/generated/prisma/**',
  ]),
]);
