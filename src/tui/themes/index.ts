/**
 * Theme registry for MyCode TUI
 * Exports all available themes and theme utilities
 */

export { darkTheme } from "./dark";
export { lightTheme } from "./light";
export { oceanTheme } from "./ocean";
export type { Theme, ThemeName } from "./types";

import { darkTheme } from "./dark";
import { lightTheme } from "./light";
import { oceanTheme } from "./ocean";
import type { Theme, ThemeName } from "./types";

/**
 * Theme registry mapping theme names to theme objects
 */
export const themes: Record<ThemeName, Theme> = {
  dark: darkTheme,
  light: lightTheme,
  ocean: oceanTheme
};

/**
 * Get theme by name with fallback to dark theme
 */
export function getTheme(name: ThemeName): Theme {
  return themes[name] || themes.dark;
}
