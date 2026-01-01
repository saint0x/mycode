/**
 * Theme Provider Context for MyCode TUI
 * Manages theme state and provides theme switching functionality
 */

import { createContext, useContext, createSignal, JSX } from "solid-js";
import type { Theme, ThemeName } from "../themes";
import { getTheme, themes } from "../themes";

interface ThemeContextValue {
  theme: () => Theme;
  themeName: () => ThemeName;
  setTheme: (name: ThemeName) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>();

interface ThemeProviderProps {
  children: JSX.Element;
  initialTheme?: ThemeName;
}

/**
 * ThemeProvider component
 * Wraps the application and provides theme context to all children
 */
export function ThemeProvider(props: ThemeProviderProps) {
  const [themeName, setThemeName] = createSignal<ThemeName>(
    props.initialTheme || "dark"
  );

  const theme = () => getTheme(themeName());

  const setTheme = (name: ThemeName) => {
    setThemeName(name);
    // TODO: Persist theme preference to config
  };

  const toggleTheme = () => {
    const themeNames: ThemeName[] = ["dark", "light", "ocean"];
    const currentIndex = themeNames.indexOf(themeName());
    const nextIndex = (currentIndex + 1) % themeNames.length;
    setTheme(themeNames[nextIndex]);
  };

  const value: ThemeContextValue = {
    theme,
    themeName,
    setTheme,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 * Must be used within a ThemeProvider
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
