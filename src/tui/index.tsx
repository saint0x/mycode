/**
 * MyCode TUI Entry Point
 * Initializes OpenTUI renderer and starts the TUI application
 */

import { render } from "@opentui/solid";
import { App } from "./App";

/**
 * Main TUI entry function
 * @param initialView - Optional initial view to display (dashboard, models, logs, etc.)
 */
export async function runTUI(initialView?: string) {
  try {
    // Render the TUI - render() handles creating the CLI renderer
    await render(
      () => <App initialView={initialView} />,
      {
        consoleOptions: {
          position: "bottom",
          sizePercent: 20,
          colorInfo: "#00ffff",
          colorWarn: "#ffff00",
          colorError: "#ff0000",
        },
        // Enable mouse support for clicks and hover
        mouse: true,
        // Enable focus management for tab navigation
        focusManagement: true
      }
    );
  } catch (error) {
    console.error("Failed to start TUI:", error);
    process.exit(1);
  }
}
