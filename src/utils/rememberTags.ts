/**
 * Remember Tag Utilities - Phase 9
 * Functions for parsing and stripping <remember> tags from content
 */

export interface ParsedRememberTag {
  scope: 'global' | 'project';
  category: string;
  content: string;
}

/**
 * Parse <remember> tags with flexible attribute parsing
 * Handles: attribute order variations, single/double quotes, extra whitespace
 */
export function parseRememberTags(content: string): ParsedRememberTag[] {
  const results: ParsedRememberTag[] = [];

  // Match opening tag with any attribute order
  const tagRegex = /<remember\s+([^>]*)>([\s\S]*?)<\/remember>/gi;
  let match;

  while ((match = tagRegex.exec(content)) !== null) {
    const attrs = match[1];
    const innerContent = match[2];

    // Extract attributes flexibly (handles order, quotes, whitespace)
    const scopeMatch = attrs.match(/scope\s*=\s*["'](global|project)["']/i);
    const categoryMatch = attrs.match(/category\s*=\s*["'](\w+)["']/i);

    if (scopeMatch && categoryMatch) {
      results.push({
        scope: scopeMatch[1].toLowerCase() as 'global' | 'project',
        category: categoryMatch[1].toLowerCase(),
        content: innerContent.trim(),
      });
    }
  }

  return results;
}

/**
 * Strip <remember> tags from content before sending to user
 * Removes all remember blocks to keep output clean
 */
export function stripRememberTags(content: string): string {
  // Remove all remember tags and their content
  const stripped = content.replace(/<remember\s+[^>]*>[\s\S]*?<\/remember>/gi, '');
  // Clean up extra whitespace/newlines left behind
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
}
