import { Theme } from "./types";

/**
 * Light Theme
 * Clean professional theme with subtle gradients
 * High readability and minimal eye strain
 */
export const lightTheme: Theme = {
  bg: {
    primary: "#ffffff",        // Pure white
    secondary: "#f5f5f7",      // Very light grey
    tertiary: "#e8e8eb",       // Light grey
    overlay: "rgba(0, 0, 0, 0.3)"  // Semi-transparent black
  },

  fg: {
    primary: "#1d1d1f",        // Near black
    secondary: "#515154",      // Dark grey
    muted: "#86868b",          // Medium grey
    disabled: "#c7c7cc"        // Light grey
  },

  accent: {
    primary: "#007aff",        // Bright blue (focus)
    success: "#34c759",        // Green
    warning: "#ff9500",        // Orange
    error: "#ff3b30",          // Red
    info: "#5ac8fa"            // Light blue
  },

  border: {
    normal: "#d2d2d7",         // Light grey
    focused: "#007aff",        // Bright blue
    active: "#5ac8fa"          // Light blue
  },

  syntax: {
    keyword: "#ad3da4",        // Purple
    string: "#d12f1b",         // Red
    number: "#272ad8",         // Blue
    comment: "#8e8e93",        // Grey
    function: "#4b21b0"        // Dark purple
  },

  gradients: {
    panelBackground: "linear-gradient(135deg, #ffffff 0%, #f5f5f7 50%, #e8e8eb 100%)",
    buttonHover: "linear-gradient(90deg, #007aff 0%, #5ac8fa 100%)",
    selection: "linear-gradient(135deg, #007aff 0%, #5ac8fa 100%)",
    statusBar: "linear-gradient(90deg, #d2d2d7 0%, #e8e8eb 100%)"
  },

  shadows: {
    light: "0 2px 4px rgba(0, 0, 0, 0.08)",
    medium: "0 4px 8px rgba(0, 0, 0, 0.12)",
    heavy: "0 8px 16px rgba(0, 0, 0, 0.16)",
    glow: "0 0 20px rgba(0, 122, 255, 0.2)"
  }
};
