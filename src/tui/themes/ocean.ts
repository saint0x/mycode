import { Theme } from "./types";

/**
 * Ocean/Teal Theme
 * Steel blue, teal, and ocean blue palette with depth
 * Features gradients and shadows for elite UX
 */
export const oceanTheme: Theme = {
  bg: {
    primary: "#0a1628",        // Deep ocean blue
    secondary: "#0d1d35",      // Slightly lighter ocean
    tertiary: "#112a47",       // Teal-blue shade
    overlay: "rgba(0, 20, 40, 0.85)"  // Semi-transparent dark blue
  },

  fg: {
    primary: "#e0f2f7",        // Light cyan-white
    secondary: "#b8dce5",      // Soft teal-white
    muted: "#6b9cae",          // Muted teal
    disabled: "#4a6b7c"        // Darker muted teal
  },

  accent: {
    primary: "#00bcd4",        // Bright cyan (focus)
    success: "#26a69a",        // Teal green
    warning: "#ffa726",        // Warm orange (contrast)
    error: "#ef5350",          // Coral red
    info: "#29b6f6"            // Sky blue
  },

  border: {
    normal: "#1e3a5f",         // Deep steel blue
    focused: "#00acc1",        // Bright teal
    active: "#26c6da"          // Light cyan
  },

  syntax: {
    keyword: "#4dd0e1",        // Bright cyan
    string: "#80cbc4",         // Soft teal
    number: "#64b5f6",         // Sky blue
    comment: "#546e7a",        // Blue-grey
    function: "#4fc3f7"        // Light blue
  },

  gradients: {
    panelBackground: "linear-gradient(135deg, #0a1628 0%, #0d1d35 50%, #112a47 100%)",
    buttonHover: "linear-gradient(90deg, #00acc1 0%, #26c6da 100%)",
    selection: "linear-gradient(135deg, #00bcd4 0%, #4dd0e1 100%)",
    statusBar: "linear-gradient(90deg, #1e3a5f 0%, #2c5f8d 100%)"
  },

  shadows: {
    light: "0 2px 4px rgba(0, 188, 212, 0.1)",
    medium: "0 4px 8px rgba(0, 188, 212, 0.15)",
    heavy: "0 8px 16px rgba(0, 188, 212, 0.2)",
    glow: "0 0 20px rgba(0, 188, 212, 0.3)"
  }
};
