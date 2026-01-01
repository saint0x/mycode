/**
 * MyCode TUI Main Application Component
 * Root component that manages views and global state
 */

import { createSignal, Show } from "solid-js";
import { ThemeProvider, useTheme } from "./contexts/ThemeProvider";
import type { ThemeName } from "./themes";

// OpenTUI uses lowercase JSX tags like HTML
declare namespace JSX {
  interface IntrinsicElements {
    box: any;
    text: any;
  }
}

type View = "dashboard" | "models" | "logs" | "requests" | "config";

interface AppProps {
  initialView?: string;
}

/**
 * Main App component wrapped with theme provider
 */
export function App(props: AppProps) {
  return (
    <ThemeProvider initialTheme="dark">
      <AppContent initialView={props.initialView} />
    </ThemeProvider>
  );
}

/**
 * App content that uses theme context
 */
function AppContent(props: AppProps) {
  const { theme, themeName, setTheme, toggleTheme } = useTheme();
  const [currentView, setCurrentView] = createSignal<View>(
    (props.initialView as View) || "dashboard"
  );

  // TODO: Implement keyboard shortcuts properly with OpenTUI
  // For now, this is a placeholder structure

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      backgroundColor={theme().bg.primary}
    >
      {/* Header */}
      <box
        width="100%"
        height={3}
        borderStyle="single"
        borderColor={theme().border.normal}
        backgroundColor={theme().bg.secondary}
        padding={1}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <text
          color={theme().accent.primary}
          attributes="bold"
        >
          MyCode Router TUI
        </text>

        <text
          color={theme().fg.muted}
          fontSize="small"
        >
          Theme: {themeName()} | Press Ctrl+T to change | Ctrl+C to exit
        </text>
      </box>

      {/* Main content */}
      <box
        flexGrow={1}
        flexDirection="column"
        padding={2}
        justifyContent="center"
        alignItems="center"
      >
        <box
          width={80}
          height={20}
          borderStyle="double"
          borderColor={theme().accent.primary}
          backgroundColor={theme().bg.secondary}
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          padding={2}
        >
          <text
            color={theme().accent.primary}
            attributes="bold"
            fontSize="large"
            marginBottom={2}
          >
            🚀 Welcome to MyCode TUI!
          </text>

          <text
            color={theme().fg.primary}
            textAlign="center"
            marginBottom={1}
          >
            Phase 1: Foundation - Complete!
          </text>

          <text
            color={theme().fg.secondary}
            textAlign="center"
            marginBottom={2}
          >
            Current theme: {themeName()}
          </text>

          <box flexDirection="column" gap={1}>
            <text color={theme().fg.muted}>
              • Press Ctrl+T to cycle themes (Dark → Light → Ocean)
            </text>
            <text color={theme().fg.muted}>
              • Press Ctrl+C to exit
            </text>
            <text color={theme().fg.muted}>
              • More features coming in Phase 2-8!
            </text>
          </box>
        </box>
      </box>

      {/* Status bar */}
      <box
        width="100%"
        height={1}
        backgroundColor={theme().bg.tertiary}
        padding={0}
        justifyContent="center"
        alignItems="center"
      >
        <text
          color={theme().fg.secondary}
          fontSize="small"
        >
          MyCode v1.0.73 | OpenTUI v0.1.67 | SolidJS
        </text>
      </box>
    </box>
  );
}
