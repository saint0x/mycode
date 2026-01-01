/**
 * Tool Parameter Validation and Sanitization Utilities - PRODUCTION VERSION
 *
 * CRITICAL: Zero tolerance validation - tools must match Claude Code conventions EXACTLY
 * No backwards compatibility, no fallbacks, no sanitization.
 * Invalid tools/arguments are REJECTED with detailed error messages.
 *
 * Prevents "Invalid tool parameters" errors by:
 * - Strictly validating tool schema structure (REJECT invalid)
 * - Preserving argument format during parsing (NO empty object fallbacks)
 * - Validating arguments against tool schemas
 * - Comprehensive debug logging for troubleshooting
 */

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

export interface ValidatedTool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ToolValidationResult {
  isValid: boolean;
  errors: string[];
  tool?: ValidatedTool;
}

export interface ArgumentValidationResult {
  isValid: boolean;
  errors: string[];
  arguments?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════
// SAFE JSON PARSING
// ═══════════════════════════════════════════════════════════════════

/**
 * Safely parse JSON string with error handling
 * NO FALLBACK - returns null on parse failure
 *
 * @param jsonString - String to parse as JSON
 * @param context - Optional context for error logging
 * @returns Parsed JSON or null on failure
 */
export function safeJSONParse<T>(
  jsonString: string,
  context?: string
): T | null {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const contextMsg = context ? `[${context}] ` : '';

    console.error(`${contextMsg}Failed to parse JSON:`, {
      error: errorMessage,
      preview: jsonString.slice(0, 100),
    });

    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// JSON SCHEMA VALIDATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate JSON Schema structure - PERMISSIVE MODE
 *
 * Claude Code's built-in tools use MANY JSON Schema fields:
 * - Required: 'type' field
 * - Optional: $schema, additionalProperties, minLength, maxLength, minItems,
 *   maxItems, description, enum, required, properties, items, and more
 *
 * We ONLY validate that 'type' exists - everything else is accepted.
 * This ensures compatibility with Claude Code's full JSON Schema draft-07 usage.
 *
 * @param schema - Object to validate as JSON Schema
 * @param debugMode - Enable debug logging
 * @returns true if valid JSON Schema structure
 */
export function isValidJSONSchema(schema: unknown, debugMode = false): boolean {
  if (!schema || typeof schema !== 'object') {
    if (debugMode) {
      console.error('[ToolValidation] Schema is not an object:', typeof schema);
    }
    return false;
  }

  const schemaObj = schema as Record<string, unknown>;

  // ONLY hard requirement: Must have a 'type' field
  if (!schemaObj.type || typeof schemaObj.type !== 'string') {
    if (debugMode) {
      console.error('[ToolValidation] Schema missing or invalid type field:', {
        type: schemaObj.type,
        typeOf: typeof schemaObj.type,
      });
    }
    return false;
  }

  // Accept ALL other JSON Schema fields without validation
  // Claude Code uses: $schema, additionalProperties, minLength, maxLength,
  // minItems, maxItems, description (on properties), enum, required,
  // properties, items, and many more JSON Schema draft-07 fields

  if (debugMode) {
    console.log('[ToolValidation] Schema validation passed:', {
      type: schemaObj.type,
      hasProperties: !!schemaObj.properties,
      hasRequired: !!schemaObj.required,
      additionalFields: Object.keys(schemaObj).filter(k => k !== 'type').length,
    });
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════
// TOOL SCHEMA VALIDATION - STRICT MODE
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate Anthropic tool schema structure - PRODUCTION MODE
 *
 * STRICT VALIDATION - NO FALLBACKS:
 * - Tool MUST have a non-empty name
 * - Tool MUST have a description (Claude Code convention)
 * - Tool MUST have input_schema with valid JSON Schema
 * - NO sanitization, NO fallbacks
 *
 * @param tool - Tool object to validate
 * @param debugMode - Enable debug logging
 * @returns Validation result with errors and validated tool
 */
export function validateToolSchema(
  tool: unknown,
  debugMode = false
): ToolValidationResult {
  const errors: string[] = [];

  // Check if tool is an object
  if (!tool || typeof tool !== 'object') {
    errors.push('Tool must be an object');
    if (debugMode) {
      console.error('[ToolValidation] Tool is not an object:', typeof tool);
    }
    return { isValid: false, errors };
  }

  const toolObj = tool as Record<string, unknown>;

  // Validate name (REQUIRED, non-empty)
  if (!toolObj.name) {
    errors.push('Tool must have a name');
    if (debugMode) {
      console.error('[ToolValidation] Tool missing name field');
    }
  } else if (typeof toolObj.name !== 'string') {
    errors.push('Tool name must be a string');
    if (debugMode) {
      console.error('[ToolValidation] Tool name is not a string:', typeof toolObj.name);
    }
  } else if (toolObj.name.trim().length === 0) {
    errors.push('Tool name cannot be empty');
    if (debugMode) {
      console.error('[ToolValidation] Tool name is empty string');
    }
  }

  // Validate description (REQUIRED for Claude Code compatibility)
  if (!toolObj.description) {
    errors.push('Tool must have a description (Claude Code convention)');
    if (debugMode) {
      console.error('[ToolValidation] Tool missing description field');
    }
  } else if (typeof toolObj.description !== 'string') {
    errors.push('Tool description must be a string');
    if (debugMode) {
      console.error('[ToolValidation] Tool description is not a string:', typeof toolObj.description);
    }
  }

  // Validate input_schema (REQUIRED)
  if (!toolObj.input_schema) {
    errors.push('Tool must have input_schema');
    if (debugMode) {
      console.error('[ToolValidation] Tool missing input_schema field');
    }
  } else if (!isValidJSONSchema(toolObj.input_schema, debugMode)) {
    errors.push('Tool input_schema is not a valid JSON Schema');
    if (debugMode) {
      console.error('[ToolValidation] Tool input_schema failed JSON Schema validation');
    }
  }

  // If validation failed, return early - NO SANITIZATION
  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  // Return validated tool (no modifications)
  const validatedTool: ValidatedTool = {
    name: (toolObj.name as string).trim(),
    description: toolObj.description as string,
    input_schema: toolObj.input_schema as Record<string, unknown>,
  };

  if (debugMode) {
    console.log('[ToolValidation] Tool validation passed:', {
      name: validatedTool.name,
      hasDescription: !!validatedTool.description,
      schemaType: (validatedTool.input_schema as { type?: string }).type,
    });
  }

  return {
    isValid: true,
    errors: [],
    tool: validatedTool,
  };
}

// ═══════════════════════════════════════════════════════════════════
// TOOL ARGUMENTS PARSING - STRICT MODE
// ═══════════════════════════════════════════════════════════════════

/**
 * Parse and validate tool arguments - PRODUCTION MODE
 *
 * STRICT PARSING - NO EMPTY OBJECT FALLBACKS:
 * - If arguments is null/undefined, return null (not {})
 * - If arguments is already an object, pass through unchanged
 * - If arguments is a string, parse JSON - REJECT on parse failure
 * - Validate parsed result is an object (not primitive)
 *
 * @param args - Tool arguments (string, object, null, or undefined)
 * @param debugMode - Enable debug logging
 * @returns Parsed arguments object or null on failure
 */
export function parseToolArguments(
  args: string | Record<string, unknown> | null | undefined,
  debugMode = false
): ArgumentValidationResult {
  // Handle null/undefined - return null NOT empty object
  if (args === null || args === undefined) {
    if (debugMode) {
      console.log('[ToolValidation] Arguments are null/undefined');
    }
    return { isValid: true, errors: [], arguments: undefined };
  }

  // Handle object arguments - pass through unchanged
  if (typeof args === 'object' && args !== null) {
    if (debugMode) {
      console.log('[ToolValidation] Arguments already an object, passing through');
    }
    return { isValid: true, errors: [], arguments: args };
  }

  // Handle string arguments (need JSON parsing)
  if (typeof args === 'string') {
    // Empty string is invalid
    if (args.trim().length === 0) {
      const error = 'Tool arguments string is empty';
      if (debugMode) {
        console.error('[ToolValidation]', error);
      }
      return { isValid: false, errors: [error] };
    }

    try {
      const parsed = JSON.parse(args);

      // Ensure parsed result is an object (not primitive)
      if (typeof parsed !== 'object' || parsed === null) {
        const error = `Parsed tool arguments is not an object: ${typeof parsed}`;
        if (debugMode) {
          console.error('[ToolValidation]', error, {
            type: typeof parsed,
            value: String(parsed).slice(0, 50),
          });
        }
        return { isValid: false, errors: [error] };
      }

      if (debugMode) {
        console.log('[ToolValidation] Successfully parsed arguments:', {
          keys: Object.keys(parsed),
        });
      }

      return {
        isValid: true,
        errors: [],
        arguments: parsed as Record<string, unknown>,
      };
    } catch (error) {
      const errorMsg = `Failed to parse tool arguments: ${error instanceof Error ? error.message : String(error)}`;
      if (debugMode) {
        console.error('[ToolValidation]', errorMsg, {
          argsPreview: args.slice(0, 100),
        });
      }
      return { isValid: false, errors: [errorMsg] };
    }
  }

  // Unexpected type
  const error = `Unexpected tool arguments type: ${typeof args}`;
  if (debugMode) {
    console.error('[ToolValidation]', error);
  }
  return { isValid: false, errors: [error] };
}

// ═══════════════════════════════════════════════════════════════════
// TOOL ARGUMENTS VALIDATION AGAINST SCHEMA
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate tool arguments against tool schema - NEW FUNCTION
 *
 * Validates that tool call arguments conform to the tool's input_schema:
 * - All required fields are present
 * - Field types match schema definitions (basic validation)
 * - No extra validation beyond required/type checking
 *
 * @param args - Parsed tool arguments
 * @param schema - Tool input_schema (JSON Schema)
 * @param debugMode - Enable debug logging
 * @returns Validation result
 */
export function validateToolArguments(
  args: Record<string, unknown> | undefined,
  schema: Record<string, unknown>,
  debugMode = false
): ArgumentValidationResult {
  const errors: string[] = [];

  // If schema doesn't define requirements, arguments are valid
  if (!schema || typeof schema !== 'object') {
    if (debugMode) {
      console.warn('[ToolValidation] Schema is not an object, skipping validation');
    }
    return { isValid: true, errors: [], arguments: args };
  }

  const required = schema.required as string[] | undefined;
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;

  // Validate required fields are present
  if (required && Array.isArray(required)) {
    for (const field of required) {
      if (!args || !(field in args)) {
        const error = `Missing required field: ${field}`;
        errors.push(error);
        if (debugMode) {
          console.error('[ToolValidation]', error);
        }
      }
    }
  }

  // Basic type validation for provided arguments
  if (args && properties) {
    for (const [field, value] of Object.entries(args)) {
      const fieldSchema = properties[field];
      if (fieldSchema && fieldSchema.type) {
        const expectedType = fieldSchema.type as string;
        const actualType = Array.isArray(value) ? 'array' : typeof value;

        // Map JavaScript types to JSON Schema types
        const typeMatches =
          (expectedType === 'object' && actualType === 'object' && !Array.isArray(value)) ||
          (expectedType === 'array' && Array.isArray(value)) ||
          (expectedType === 'string' && actualType === 'string') ||
          (expectedType === 'number' && actualType === 'number') ||
          (expectedType === 'boolean' && actualType === 'boolean') ||
          (expectedType === 'null' && value === null);

        if (!typeMatches) {
          const error = `Field '${field}' has wrong type: expected ${expectedType}, got ${actualType}`;
          errors.push(error);
          if (debugMode) {
            console.error('[ToolValidation]', error);
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    return { isValid: false, errors, arguments: args };
  }

  if (debugMode) {
    console.log('[ToolValidation] Arguments validation passed');
  }

  return { isValid: true, errors: [], arguments: args };
}

// ═══════════════════════════════════════════════════════════════════
// OPENAI TOOL CALL VALIDATION
// ═══════════════════════════════════════════════════════════════════

/**
 * Validate OpenAI tool call structure
 *
 * @param toolCall - Tool call object to validate
 * @param debugMode - Enable debug logging
 * @returns true if valid OpenAI tool call structure
 */
export function validateOpenAIToolCall(toolCall: unknown, debugMode = false): boolean {
  if (!toolCall || typeof toolCall !== 'object') {
    if (debugMode) {
      console.error('[ToolValidation] Tool call is not an object:', typeof toolCall);
    }
    return false;
  }

  const tc = toolCall as Record<string, unknown>;

  // Must have type field
  if (!tc.type || typeof tc.type !== 'string') {
    if (debugMode) {
      console.error('[ToolValidation] Tool call missing or invalid type field');
    }
    return false;
  }

  // Must have function field for function type
  if (tc.type === 'function') {
    if (!tc.function || typeof tc.function !== 'object') {
      if (debugMode) {
        console.error('[ToolValidation] Function tool call missing function field');
      }
      return false;
    }

    const func = tc.function as Record<string, unknown>;

    // Function must have name
    if (!func.name || typeof func.name !== 'string') {
      if (debugMode) {
        console.error('[ToolValidation] Function tool call missing or invalid name');
      }
      return false;
    }
  }

  if (debugMode) {
    console.log('[ToolValidation] OpenAI tool call validation passed');
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════════
// TOOL ARGUMENT FILTERING
// ═══════════════════════════════════════════════════════════════════

/**
 * Filter tool arguments to remove fields not defined in the schema
 *
 * This addresses the issue where LLMs (especially when using OpenRouter/OpenAI format)
 * add extra metadata fields that aren't in the tool schema, causing validation errors.
 *
 * Strategy:
 * 1. If schema is provided, recursively filter to only keep schema-defined fields
 * 2. If no schema, apply heuristic filtering to remove common LLM-added metadata
 *
 * @param args - The tool arguments to filter
 * @param schema - Optional tool schema (input_schema from tool definition)
 * @param debugMode - Enable debug logging
 * @returns Filtered arguments with only schema-defined fields
 */
export function filterToolArguments(
  args: Record<string, unknown>,
  schema?: Record<string, unknown>,
  debugMode = false
): Record<string, unknown> {
  if (!args || typeof args !== 'object') {
    return args;
  }

  // If schema is provided, use schema-based filtering
  if (schema && schema.properties && typeof schema.properties === 'object') {
    return filterBySchema(args, schema, debugMode);
  }

  // Otherwise, use heuristic filtering to remove common LLM metadata
  return filterHeuristicMetadata(args, debugMode);
}

/**
 * Filter arguments based on schema properties (recursive)
 */
function filterBySchema(
  args: Record<string, unknown>,
  schema: Record<string, unknown>,
  debugMode = false
): Record<string, unknown> {
  const properties = schema.properties as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  const removedFields: string[] = [];

  for (const [key, value] of Object.entries(args)) {
    if (key in properties) {
      const propSchema = properties[key];

      // Recursively filter nested objects
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        propSchema &&
        typeof propSchema === 'object' &&
        'properties' in propSchema
      ) {
        filtered[key] = filterBySchema(
          value as Record<string, unknown>,
          propSchema as Record<string, unknown>,
          debugMode
        );
      }
      // Recursively filter arrays of objects
      else if (
        Array.isArray(value) &&
        propSchema &&
        typeof propSchema === 'object' &&
        'items' in propSchema &&
        propSchema.items &&
        typeof propSchema.items === 'object' &&
        'properties' in propSchema.items
      ) {
        filtered[key] = value.map(item => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            return filterBySchema(
              item as Record<string, unknown>,
              propSchema.items as Record<string, unknown>,
              debugMode
            );
          }
          return item;
        });
      }
      // Keep the value as-is for primitives and other types
      else {
        filtered[key] = value;
      }
    } else {
      removedFields.push(key);
    }
  }

  if (debugMode && removedFields.length > 0) {
    console.log('[ToolValidation] Schema-based filtering removed fields:', removedFields);
  }

  return filtered;
}

/**
 * Filter common LLM-added metadata fields heuristically
 *
 * IMPORTANT: Only filters fields INSIDE arrays and nested objects, NOT at the root level.
 * This prevents removing valid root-level tool parameters.
 *
 * Common fields that LLMs add to nested structures:
 * - id, uuid, guid (identifiers)
 * - priority, importance, weight (ranking)
 * - index, order, position (ordering)
 * - step, phase, stage (sequencing)
 * - timestamp, created, updated (timing)
 */
function filterHeuristicMetadata(
  args: Record<string, unknown>,
  debugMode = false,
  isRoot = true
): Record<string, unknown> {
  // Only filter these fields in nested structures (array items, nested objects)
  // NOT at the root level to avoid removing valid tool parameters
  const NESTED_METADATA_FIELDS = new Set([
    'id', 'uuid', 'guid',
    'priority', 'importance', 'weight', 'rank',
    'index', 'order', 'position', 'sequence',
    'step', 'phase', 'stage', 'level',
    'timestamp', 'created', 'updated', 'modified',
    '_id', '_key', '_index', '_meta',
  ]);

  const filtered: Record<string, unknown> = {};
  const removedFields: string[] = [];

  for (const [key, value] of Object.entries(args)) {
    // Only filter metadata fields if we're NOT at the root level
    if (!isRoot && NESTED_METADATA_FIELDS.has(key)) {
      removedFields.push(key);
      continue;
    }

    // Recursively filter nested objects (not at root anymore)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      filtered[key] = filterHeuristicMetadata(value as Record<string, unknown>, debugMode, false);
    }
    // Recursively filter arrays of objects (items are not at root)
    else if (Array.isArray(value)) {
      filtered[key] = value.map(item => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return filterHeuristicMetadata(item as Record<string, unknown>, debugMode, false);
        }
        return item;
      });
    }
    // Keep primitives as-is
    else {
      filtered[key] = value;
    }
  }

  if (debugMode && removedFields.length > 0) {
    console.log('[ToolValidation] Heuristic filtering removed nested fields:', removedFields);
  }

  return filtered;
}

// For backwards compatibility - will be removed
export { parseToolArguments as sanitizeToolArguments };
