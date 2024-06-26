'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { SunIcon, MoonIcon } from '@heroicons/react/24/solid';

export default function ThemeSwitch() {
  const [isMounted, setIsMounted] = useState(false);
  const { theme, resolvedTheme, setTheme } = useTheme();

  const size = '24';

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <span className="loading loading-ball loading-xl"></span>;
  }
  return (
    <label className="swap swap-rotate" aria-label="dark mode switch">
      {/* this hidden checkbox controls the state */}
      <input
        onClick={toggleTheme}
        type="checkbox"
        defaultChecked={resolvedTheme === 'dark'}
      />

      {/* sun icon */}
      <SunIcon
        width={size}
        height={size}
        className="fill-yellow-400 swap-off"
      />

      {/* moon icon */}
      <MoonIcon width={size} height={size} className="fill-blue-700 swap-on" />
    </label>
  );
}
