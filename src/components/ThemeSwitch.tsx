'use client';

import { useEffect, useRef } from 'react';

import { useTheme } from 'next-themes';

import { Button } from '@heroui/react';

import { MoonIcon, SunIcon } from '@/components/ui/Icons';

const THEME_TRANSITION_TIMEOUT_MS = 420;

type ViewTransition = {
  finished: Promise<void>;
  ready: Promise<void>;
  skipTransition: () => void;
  updateCallbackDone: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition;
};

export default function ThemeSwitch() {
  const pendingThemeRef = useRef<'dark' | 'light' | null>(null);
  const themeTransitionRef = useRef<ViewTransition | null>(null);
  const themeTransitionTokenRef = useRef<symbol | null>(null);
  const themeTransitionTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const { resolvedTheme, setTheme } = useTheme();

  const getCurrentTheme = () => {
    if (pendingThemeRef.current) {
      return pendingThemeRef.current;
    }

    const root = document.documentElement;

    return root.classList.contains('dark') || root.dataset.theme === 'dark'
      ? 'dark'
      : 'light';
  };

  const applyTheme = (nextTheme: 'dark' | 'light') => {
    const root = document.documentElement;

    root.dataset.theme = nextTheme;
    root.classList.toggle('dark', nextTheme === 'dark');
    root.classList.toggle('light', nextTheme === 'light');
    setTheme(nextTheme);
  };

  const skipActiveThemeTransition = () => {
    try {
      themeTransitionRef.current?.skipTransition();
    } catch {
      // The browser may already have finished or aborted this transition.
    }
  };

  const finishThemeTransition = (token: symbol) => {
    if (themeTransitionTokenRef.current !== token) return;

    delete document.documentElement.dataset.themeTransition;
    delete document.documentElement.dataset.themeFallbackTransition;
    delete document.documentElement.dataset.themeInstant;
    pendingThemeRef.current = null;
    themeTransitionRef.current = null;
    themeTransitionTokenRef.current = null;
    themeTransitionTimeoutRef.current = null;
  };

  const toggleTheme = () => {
    const root = document.documentElement;
    const documentWithViewTransition = document as ViewTransitionDocument;
    const currentTheme = getCurrentTheme();
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    const token = Symbol('theme-transition');

    pendingThemeRef.current = nextTheme;
    themeTransitionTokenRef.current = token;
    root.dataset.themeTransition = 'true';

    if (themeTransitionTimeoutRef.current) {
      clearTimeout(themeTransitionTimeoutRef.current);
    }

    skipActiveThemeTransition();

    if (
      typeof documentWithViewTransition.startViewTransition === 'function' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const transition = documentWithViewTransition.startViewTransition(() => {
        root.dataset.themeInstant = 'true';
        applyTheme(nextTheme);
      });

      themeTransitionRef.current = transition;
      transition.ready
        .catch(() => undefined)
        .finally(() => {
          if (themeTransitionTokenRef.current === token) {
            delete document.documentElement.dataset.themeInstant;
          }
        });
      transition.finished
        .catch(() => undefined)
        .finally(() => finishThemeTransition(token));
      return;
    }

    root.dataset.themeFallbackTransition = 'true';
    applyTheme(nextTheme);
    themeTransitionTimeoutRef.current = setTimeout(() => {
      finishThemeTransition(token);
    }, THEME_TRANSITION_TIMEOUT_MS);
  };

  useEffect(() => {
    return () => {
      if (themeTransitionTimeoutRef.current) {
        clearTimeout(themeTransitionTimeoutRef.current);
      }

      delete document.documentElement.dataset.themeTransition;
      delete document.documentElement.dataset.themeFallbackTransition;
      delete document.documentElement.dataset.themeInstant;
      skipActiveThemeTransition();
    };
  }, []);

  useEffect(() => {
    if (resolvedTheme === 'dark' || resolvedTheme === 'light') {
      pendingThemeRef.current = resolvedTheme;

      // The static <meta name="theme-color"> pair keys on the OS scheme;
      // when the user toggles the site theme manually, sync browser chrome
      // to the theme actually applied.
      const color = resolvedTheme === 'dark' ? '#242629' : '#f7f7f7';

      document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((meta) => meta.setAttribute('content', color));
    }
  }, [resolvedTheme]);

  return (
    <Button
      isIconOnly
      aria-label="Toggle light/dark theme"
      variant="tertiary"
      onPress={toggleTheme}
      className="relative size-10 min-h-10 min-w-10 overflow-hidden rounded-full bg-transparent p-0 text-foreground/80 shadow-none transition-[background-color,color,opacity] duration-300 ease-out hover:bg-foreground/5 hover:text-foreground"
    >
      <span
        data-theme-switch-icon
        className="absolute inset-0 flex items-center justify-center rotate-0 scale-100 opacity-100 transition-all duration-300 ease-in-out dark:-rotate-90 dark:scale-0 dark:opacity-0 [&>svg]:size-6"
      >
        <SunIcon />
      </span>
      <span
        data-theme-switch-icon
        className="absolute inset-0 flex items-center justify-center rotate-90 scale-0 opacity-0 transition-all duration-300 ease-in-out dark:rotate-0 dark:scale-100 dark:opacity-100 [&>svg]:size-6"
      >
        <MoonIcon />
      </span>
    </Button>
  );
}
