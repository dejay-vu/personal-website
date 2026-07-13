import { useCallback, useEffect } from 'react';

import { useSearchParams } from 'next/navigation';

type Operation =
  | 'set'
  | 'append'
  | 'delete'
  | 'has'
  | 'get'
  | 'getAll'
  | 'remove';

// Define the function overloads
export function useQueryString(operation: 'has'): (name: string) => boolean;
export function useQueryString(
  operation: 'get',
): (name: string) => string | null;
export function useQueryString(operation: 'getAll'): (name: string) => string[];
export function useQueryString(
  operation: 'set' | 'append' | 'remove',
): (name: string, value: string | number) => string;
export function useQueryString(operation: 'delete'): (name: string) => string;

// Implement the function
export function useQueryString(operation: Operation) {
  const searchParams = useSearchParams();

  return useCallback(
    (name: string, value: string | number) => {
      const params = new URLSearchParams(searchParams.toString());

      switch (operation) {
        case 'has':
          return params.has(name);
        case 'get':
          return params.get(name);
        case 'getAll':
          return params.getAll(name);
        case 'set':
          if (value !== undefined) {
            params.set(name, value.toString());
            return params.toString();
          }
          throw new Error(`'set' operation requires a 'slug' value.`);
        case 'append':
          if (value !== undefined) {
            params.append(name, value.toString());
            return params.toString();
          }
          throw new Error(`'append' operation requires a 'slug' value.`);
        case 'delete':
          params.delete(name);
          return params.toString();
        case 'remove': {
          // Drop a single value from a repeated param, keeping the rest.
          // (Manual filter instead of the two-arg params.delete(name, value),
          // which is only baseline since 2023.)
          if (value === undefined) {
            throw new Error(`'remove' operation requires a value.`);
          }
          const remaining = params
            .getAll(name)
            .filter((entry) => entry !== value.toString());
          params.delete(name);
          remaining.forEach((entry) => params.append(name, entry));
          return params.toString();
        }
        default:
          throw new Error(`Unsupported operation: ${operation}`);
      }
    },
    [searchParams, operation],
  );
}

export function useResetScrollOnReload() {
  useEffect(() => {
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);
}
