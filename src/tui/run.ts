/**
 * TUI Runner Script
 * Loads the OpenTUI SolidJS plugin and runs the TUI
 */

import plugin from "@opentui/solid/bun-plugin";

// Load the SolidJS transform plugin
Bun.plugin(plugin);

// Now import and run the TUI
const { runTUI } = await import("./index.tsx");

// Get initial view from command line args
const initialView = process.argv[2];

// Run the TUI
await runTUI(initialView);
