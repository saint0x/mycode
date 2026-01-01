/**
 * Header Component
 * Top bar with title, navigation hints, and theme indicator
 */

import { useTheme } from "../contexts/ThemeProvider";

interface HeaderProps {
  title?: string;
  showHelp?: boolean;
}

export function Header(props: HeaderProps) {
  const { theme, themeName } = useTheme();
  const currentTheme = theme();

  const title = props.title || "MyCode Router TUI";
  const showHelp = props.showHelp ?? true;

  return (
    <box
      width="100%"
      flexDirection="column"
    >
      {/* Top border */}
      <box
        width="100%"
        borderStyle="single"
        borderColor={currentTheme.border.normal}
        backgroundColor={currentTheme.bg.secondary}
        padding={1}
      >
        <box
          width="100%"
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
        >
          {/* Title */}
          <text
            color={currentTheme.accent.primary}
            attributes="bold"
          >
            {title}
          </text>

          {/* Right side info */}
          <box flexDirection="row" gap={2}>
            {/* Theme indicator */}
            <text color={currentTheme.fg.secondary}>
              Theme: {themeName()}
            </text>

            {/* Help hint */}
            {showHelp && (
              <text color={currentTheme.fg.muted}>
                Press Ctrl+T to change | Ctrl+C to exit
              </text>
            )}
          </box>
        </box>
      </box>
    </box>
  );
}
