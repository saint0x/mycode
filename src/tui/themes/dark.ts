import { Theme } from "./types";

/**
 * Dark Theme
 * Claude purple with gradients and glow effects
 * Inspired by Claude Code's superior UI feel
 */
export const darkTheme: Theme = {
  bg: {
    primary: "#1a1625",        // Deep purple-black
    secondary: "#221a2e",      // Darker purple
    tertiary: "#2a213a",       // Purple-grey
    overlay: "rgba(26, 22, 37, 0.9)"  // Semi-transparent purple-black
  },

  fg: {
    primary: "#e8e6f0",        // Light lavender-white
    secondary: "#c5c1d6",      // Soft purple-white
    muted: "#8b85a3",          // Muted purple
    disabled: "#5e5970"        // Darker muted purple
  },

  accent: {
    primary: "#8b5cf6",        // Claude purple (focus)
    success: "#10b981",        // Emerald green
    warning: "#f59e0b",        // Amber
    error: "#ef4444",          // Red
    info: "#3b82f6"            // Blue
  },

  border: {
    normal: "#3d3550",         // Deep purple-grey
    focused: "#a78bfa",        // Bright purple
    active: "#c4b5fd"          // Light purple
  },

  syntax: {
    keyword: "#c4b5fd",        // Light purple
    string: "#fde68a",         // Light yellow
    number: "#a7f3d0",         // Light emerald
    comment: "#78716c",        // Grey
    function: "#ddd6fe"        // Very light purple
  },

  gradients: {
    panelBackground: "linear-gradient(135deg, #1a1625 0%, #221a2e 50%, #2a213a 100%)",
    buttonHover: "linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)",
    selection: "linear-gradient(135deg, #8b5cf6 0%, #c4b5fd 100%)",
    statusBar: "linear-gradient(90deg, #3d3550 0%, #4c4564 100%)"
  },

  shadows: {
    light: "0 2px 4px rgba(139, 92, 246, 0.1)",
    medium: "0 4px 8px rgba(139, 92, 246, 0.15)",
    heavy: "0 8px 16px rgba(139, 92, 246, 0.2)",
    glow: "0 0 20px rgba(139, 92, 246, 0.4)"
  }
};
