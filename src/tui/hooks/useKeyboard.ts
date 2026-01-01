/**
 * Keyboard shortcut hook for MyCode TUI
 * Provides global keyboard event handling
 */

import { onMount, onCleanup } from "solid-js";

export interface KeyEvent {
  name: string;
  sequence: string;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
}

export type KeyHandler = (event: KeyEvent) => void;
export type KeyMap = Record<string, KeyHandler>;

/**
 * Hook to register global keyboard shortcuts
 * @param keyMap - Object mapping key combinations to handlers
 *
 * @example
 * useKeyboard({
 *   "ctrl+k": () => openCommandPalette(),
 *   "ctrl+t": () => toggleTheme(),
 *   "escape": () => closeModal()
 * });
 */
export function useKeyboard(keyMap: KeyMap) {
  // This will be implemented with actual OpenTUI keyboard event handling
  // For now, this is a placeholder that shows the API we'll use

  onMount(() => {
    // TODO: Attach keyboard event listeners via OpenTUI renderer
    // renderer.keyInput.on("keypress", handleKeyPress);
  });

  onCleanup(() => {
    // TODO: Remove keyboard event listeners
  });
}

/**
 * Normalize key combination string to standard format
 * @param key - Key combination like "Ctrl+K" or "ctrl+k"
 * @returns Normalized key string like "ctrl+k"
 */
export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/\s+/g, "")
    .split("+")
    .sort()
    .join("+");
}

/**
 * Check if a key event matches a key combination string
 * @param event - KeyEvent from OpenTUI
 * @param combination - Key combination like "ctrl+k"
 * @returns True if event matches the combination
 */
export function matchesKeyCombination(event: KeyEvent, combination: string): boolean {
  const normalized = normalizeKey(combination);
  const parts = normalized.split("+");

  const hasCtrl = parts.includes("ctrl");
  const hasShift = parts.includes("shift");
  const hasMeta = parts.includes("meta");
  const key = parts.find(p => !["ctrl", "shift", "meta"].includes(p)) || "";

  return (
    event.ctrl === hasCtrl &&
    event.shift === hasShift &&
    event.meta === hasMeta &&
    event.name.toLowerCase() === key
  );
}
