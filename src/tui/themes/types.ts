/**
 * Theme type definition for MyCode TUI
 * Supports gradients, shadows, and comprehensive color schemes
 */

export interface Theme {
  // Background colors
  bg: {
    primary: string;      // Main background
    secondary: string;    // Panel backgrounds
    tertiary: string;     // Nested elements
    overlay: string;      // Modal backgrounds (with alpha)
  };

  // Foreground colors
  fg: {
    primary: string;      // Main text
    secondary: string;    // Secondary text
    muted: string;        // Disabled/muted text
    disabled: string;     // Disabled elements
  };

  // Accent colors
  accent: {
    primary: string;      // Primary accent (focus, selection)
    success: string;      // Success states
    warning: string;      // Warning states
    error: string;        // Error states
    info: string;         // Informational states
  };

  // Borders
  border: {
    normal: string;       // Default borders
    focused: string;      // Focused element borders
    active: string;       // Active/selected borders
  };

  // Syntax highlighting (for code display)
  syntax: {
    keyword: string;
    string: string;
    number: string;
    comment: string;
    function: string;
  };

  // Gradient definitions
  gradients: {
    panelBackground: string;   // Main panel gradient
    buttonHover: string;       // Button hover gradient
    selection: string;         // Selection/highlight gradient
    statusBar: string;         // Status bar gradient
  };

  // Shadow definitions for depth
  shadows: {
    light: string;    // Subtle shadow
    medium: string;   // Standard shadow
    heavy: string;    // Deep shadow
    glow: string;     // Glow effect
  };
}

export type ThemeName = "dark" | "light" | "ocean";
