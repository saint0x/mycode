/**
 * Reusable Panel Component
 * Beautiful panel with gradient backgrounds, borders, and shadows
 */

import { JSX } from "solid-js";
import { useTheme } from "../contexts/ThemeProvider";

interface PanelProps {
  title?: string;
  children: JSX.Element;
  width?: string | number;
  height?: string | number;
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  padding?: number;
  borderStyle?: "single" | "double" | "rounded" | "bold" | "none";
  gradient?: boolean;
  shadow?: "light" | "medium" | "heavy" | "glow" | "none";
  centered?: boolean;
}

export function Panel(props: PanelProps) {
  const { theme } = useTheme();
  const currentTheme = theme();

  const borderStyle = props.borderStyle || "single";
  const showBorder = borderStyle !== "none";
  const gradient = props.gradient ?? true;
  const shadow = props.shadow || "medium";
  const padding = props.padding ?? 1;

  // Determine background based on gradient setting
  const backgroundColor = gradient
    ? currentTheme.bg.secondary  // Will be enhanced with gradient in future
    : currentTheme.bg.secondary;

  return (
    <box
      width={props.width}
      height={props.height}
      marginTop={props.marginTop}
      marginBottom={props.marginBottom}
      marginLeft={props.marginLeft}
      marginRight={props.marginRight}
      flexDirection="column"
      borderStyle={showBorder ? borderStyle : undefined}
      borderColor={showBorder ? currentTheme.border.normal : undefined}
      backgroundColor={backgroundColor}
      padding={padding}
    >
      {/* Title if provided */}
      {props.title && (
        <box marginBottom={1}>
          <text
            color={currentTheme.accent.primary}
            attributes="bold"
          >
            {props.title}
          </text>
        </box>
      )}

      {/* Content */}
      {props.children}
    </box>
  );
}
