# Claude Code Update Compatibility System

## Overview

This document describes how the mycode router maintains compatibility with Claude Code CLI updates from Anthropic. The router acts as a man-in-the-middle proxy, so it's critical that new features from Claude Code updates continue to work without requiring immediate router code changes.

## Architecture: How the Router Works

### Request Flow
```
Claude Code CLI
  ↓ (spawned with ANTHROPIC_BASE_URL=http://127.0.0.1:3456)
Router Server (Hono + Node)
  ↓ (Request transformation: Anthropic → OpenAI format)
Target LLM Provider (OpenRouter/DeepSeek/Ollama/etc)
  ↓ (Response transformation: OpenAI → Anthropic format)
Back to Claude Code
```

### Critical Interception Points

1. **Environment Variables** (`src/utils/createEnvVariables.ts`)
   - Injects `ANTHROPIC_BASE_URL` to redirect to localhost
   - Sets auth token and other configuration

2. **Request Transformation** (`src/newserver.ts:163-272`)
   - `anthropicToOpenAI()` - Converts request format
   - Maps tools, messages, parameters between formats

3. **Response Transformation** (`src/newserver.ts:325-425`)
   - `openAIToAnthropic()` - Converts response format
   - Maps content, tool calls, finish reasons

4. **Streaming Transformation** (`src/newserver.ts:427-521`)
   - `openAIChunkToAnthropic()` - Converts SSE events
   - Handles real-time streaming events

5. **API Headers** (`src/newserver.ts:659-674`)
   - Sets `anthropic-version: "2023-06-01"`
   - Sets beta feature flags

## Vulnerability Points: Where New Features Could Break

### 1. Request Field Dropping
**Location**: `src/newserver.ts` - `anthropicToOpenAI()`

**Problem**: Only known fields are explicitly copied. New request parameters from Claude Code updates will be silently dropped.

**Current Known Fields**:
- `model`, `messages`, `system`, `tools`, `tool_choice`
- `max_tokens`, `temperature`, `top_p`, `stop_sequences`
- `stream`, `metadata`, `headers`

**Solution**: Pass through ALL unknown fields after known transformations.

### 2. Response Field Dropping
**Location**: `src/newserver.ts` - `openAIToAnthropic()`

**Problem**: Fixed response structure. New response fields from Anthropic API won't be forwarded to Claude Code.

**Current Known Fields**:
- `id`, `type`, `role`, `content`, `model`, `stop_reason`, `usage`

**Solution**: Preserve unknown fields from provider responses.

### 3. Streaming Event Dropping
**Location**: `src/newserver.ts` - `openAIChunkToAnthropic()`

**Problem**: Only handles known SSE event types. New streaming events will fail.

**Current Known Events**:
- `message_start`, `content_block_start`, `content_block_delta`
- `content_block_stop`, `message_delta`, `message_stop`, `ping`

**Solution**: Pass through unknown event types unchanged.

### 4. Environment Variable Gaps
**Location**: `src/utils/createEnvVariables.ts`

**Problem**: Only 11 specific env vars are set. New `ANTHROPIC_*` or `CLAUDE_*` env vars won't be detected.

**Current Known Env Vars**:
- `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`
- `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_USE_BEDROCK`
- `DISABLE_TELEMETRY`, `DISABLE_COST_WARNINGS`, `API_TIMEOUT_MS`

**Solution**: Detect and log unknown Claude/Anthropic env vars.

### 5. Hardcoded API Version & Beta Features
**Location**: `src/newserver.ts:659-674`

**Problem**: API version and beta features are hardcoded. Version updates or new beta flags won't be detected.

**Current Values**:
- API Version: `"2023-06-01"`
- Beta Features:
  - `advanced-tool-use-2025-11-20`
  - `fine-grained-tool-streaming-2025-05-14`
  - `code-execution-2025-08-25`
  - `interleaved-thinking-2025-05-14`

**Solution**: Detect and use requested API versions and beta features.

## Implementation Plan

### Phase 1: Pass-Through Infrastructure (CRITICAL)

#### 1.1 Update Request Transformation
**File**: `src/newserver.ts` (lines 163-272)

Add after all known field transformations in `anthropicToOpenAI()`:

```typescript
// Pass through unknown fields
const KNOWN_REQUEST_FIELDS = new Set([
  'model', 'messages', 'system', 'tools', 'tool_choice',
  'max_tokens', 'temperature', 'top_p', 'stop_sequences',
  'stream', 'metadata', 'headers'
]);

for (const [key, value] of Object.entries(body)) {
  if (!KNOWN_REQUEST_FIELDS.has(key)) {
    openAIBody[key] = value; // Pass through unknown fields
    console.warn(`[Claude Update] Unknown request field detected: ${key}`);
  }
}
```

#### 1.2 Update Response Transformation
**File**: `src/newserver.ts` (lines 325-425)

Add after building anthropicResponse in `openAIToAnthropic()`:

```typescript
// Preserve unknown fields from provider response
const KNOWN_RESPONSE_FIELDS = new Set([
  'id', 'type', 'role', 'content', 'model', 'stop_reason', 'usage'
]);

for (const [key, value] of Object.entries(openAIResponse)) {
  if (!KNOWN_RESPONSE_FIELDS.has(key)) {
    anthropicResponse[key] = value;
    console.warn(`[Claude Update] Unknown response field detected: ${key}`);
  }
}
```

#### 1.3 Update Streaming Transformation
**File**: `src/newserver.ts` (lines 427-521)

Add event type detection in `openAIChunkToAnthropic()`:

```typescript
// Detect unknown streaming events
const KNOWN_EVENT_TYPES = new Set([
  'message_start', 'content_block_start', 'content_block_delta',
  'content_block_stop', 'message_delta', 'message_stop', 'ping'
]);

if (eventType && !KNOWN_EVENT_TYPES.has(eventType)) {
  console.warn(`[Claude Update] Unknown streaming event: ${eventType}`);
  // Pass through unchanged - let Claude Code handle it
}
```

### Phase 2: Environment Variable Detection

**File**: `src/utils/createEnvVariables.ts`

Add detection for new env vars:

```typescript
export const createEnvVariables = async (): Promise<EnvVariables> => {
  const config = await readConfigFile();
  const port = config.PORT || 3456;
  const apiKey = config.APIKEY || "test";

  const baseEnv: EnvVariables = {
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
    NO_PROXY: "127.0.0.1",
    DISABLE_TELEMETRY: "true",
    DISABLE_COST_WARNINGS: "true",
    API_TIMEOUT_MS: String(config.API_TIMEOUT_MS ?? 600000),
    CLAUDE_CODE_USE_BEDROCK: undefined,
  };

  // Detect unknown Claude/Anthropic env vars
  const KNOWN_ENV_VARS = new Set([
    'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL',
    'ANTHROPIC_SMALL_FAST_MODEL', 'CLAUDE_CODE_USE_BEDROCK',
    'DISABLE_TELEMETRY', 'DISABLE_COST_WARNINGS', 'API_TIMEOUT_MS',
    'NO_PROXY', 'CI', 'FORCE_COLOR', 'NODE_NO_READLINE', 'TERM'
  ]);

  for (const [key, value] of Object.entries(process.env)) {
    if ((key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_'))
        && !KNOWN_ENV_VARS.has(key)) {
      console.warn(`[Claude Update] New env var detected: ${key}`);
      console.warn(`  Consider adding support in createEnvVariables.ts`);
    }
  }

  return baseEnv;
};
```

### Phase 3: Header & API Version Detection

**File**: `src/newserver.ts` (lines 659-674)

Replace hardcoded header logic with detection:

```typescript
// Allow request to override API version
if (body.headers?.["anthropic-version"]) {
  const requestedVersion = body.headers["anthropic-version"];
  if (requestedVersion !== "2023-06-01") {
    console.warn(`[Claude Update] API version changed!`);
    console.warn(`  Requested: ${requestedVersion}, Router: 2023-06-01`);
    console.warn(`  Update ANTHROPIC_VERSION in src/newserver.ts`);
  }
  headers["anthropic-version"] = requestedVersion; // Use requested version
} else {
  headers["anthropic-version"] = "2023-06-01";
}

// Detect new beta features
const DEFAULT_BETAS = [
  "advanced-tool-use-2025-11-20",
  "fine-grained-tool-streaming-2025-05-14",
  "code-execution-2025-08-25",
  "interleaved-thinking-2025-05-14"
];

if (body.headers?.["anthropic-beta"]) {
  const requestedBetas = body.headers["anthropic-beta"].split(",");
  const newBetas = requestedBetas.filter(b => !DEFAULT_BETAS.includes(b.trim()));

  if (newBetas.length > 0) {
    console.warn(`[Claude Update] New beta features detected!`);
    console.warn(`  Features: ${newBetas.join(", ")}`);
    console.warn(`  Add to DEFAULT_BETAS in src/newserver.ts`);
  }

  headers["anthropic-beta"] = body.headers["anthropic-beta"]; // Use requested betas
} else {
  headers["anthropic-beta"] = DEFAULT_BETAS.join(",");
}
```

### Phase 4: Configuration Option

**File**: `src/config/schema.ts`

Add feature detection configuration:

```typescript
export interface CCRConfig {
  // ... existing fields ...

  // Feature detection settings
  FeatureDetection?: {
    logNewFields?: boolean;      // Log unknown fields (default: true)
    logNewEnvVars?: boolean;     // Log unknown env vars (default: true)
    logNewBetaFeatures?: boolean; // Log new beta features (default: true)
  };
}
```

**Default Configuration** (`config.example.json`):

```json
{
  "FeatureDetection": {
    "logNewFields": true,
    "logNewEnvVars": true,
    "logNewBetaFeatures": true
  }
}
```

## Testing Strategy

After implementing the changes, test with:

### Test 1: Unknown Request Field
Add experimental field to request body:
```json
{
  "model": "claude-sonnet-4-5",
  "messages": [...],
  "experimental_new_feature": true
}
```
**Expected**: Field is passed through to provider, warning logged.

### Test 2: Unknown Environment Variable
```bash
export ANTHROPIC_NEW_FEATURE=1
mycode code "test"
```
**Expected**: Warning logged about new env var.

### Test 3: New API Version
Mock request with newer API version:
```json
{
  "headers": {
    "anthropic-version": "2024-01-01"
  }
}
```
**Expected**: Warning logged, requested version used.

### Test 4: New Beta Feature
Request with new beta feature:
```json
{
  "headers": {
    "anthropic-beta": "new-feature-2026,advanced-tool-use-2025-11-20"
  }
}
```
**Expected**: Warning logged about `new-feature-2026`, all features passed through.

### Test 5: Unknown Streaming Event
Mock SSE response with new event:
```
event: new_experimental_event
data: {"type": "test"}
```
**Expected**: Warning logged, event passed through unchanged.

## Monitoring for Claude Code Updates

### When Anthropic Releases Claude Code Updates

1. **Check router logs** for warnings:
   ```
   [Claude Update] Unknown request field detected: ...
   [Claude Update] API version changed!
   [Claude Update] New beta features detected!
   ```

2. **Review warnings** to understand new features

3. **Update router code** if needed:
   - Add new fields to KNOWN_FIELDS sets if transformations needed
   - Update API version constant if required
   - Add new beta features to DEFAULT_BETAS

### What Requires Code Updates?

**No code changes needed**:
- New request/response fields that work with OpenAI-compatible APIs
- New streaming events that don't require transformation
- New beta features (just add to DEFAULT_BETAS list)

**Code changes required**:
- New fields that need format transformation (e.g., new tool format)
- API version changes with breaking protocol changes
- New endpoints beyond `/v1/messages`

## Risk Mitigation

### Risk 1: Unknown Fields Break Non-Anthropic Providers

**Mitigation**: Only pass through unknown fields when targeting Anthropic provider. For OpenAI/OpenRouter, log but don't forward Anthropic-specific fields.

Implementation:
```typescript
const providerType = detectProviderType(providerConfig.api_base_url);

if (providerType === 'anthropic') {
  // Pass through all unknown fields
} else {
  // Only log, don't forward
}
```

### Risk 2: Too Many Warnings Create Noise

**Mitigation**:
- Add config option to disable warnings
- Only warn once per unique field name (use Set to track)
- Support log levels: ERROR, WARN, INFO, DEBUG

### Risk 3: Breaking Changes in Anthropic API

**Mitigation**:
- Keep router API version configurable
- Support multiple API versions simultaneously
- Add compatibility mode for older API versions

## Success Criteria

After implementation, the router should:
- ✅ Pass through new Claude Code request fields automatically
- ✅ Preserve new response fields from Anthropic
- ✅ Handle new streaming event types without errors
- ✅ Detect and log API version changes
- ✅ Detect and log new beta features
- ✅ Detect and log unknown environment variables
- ✅ Require zero code changes for non-breaking Claude Code updates

## Files Modified

1. **`src/newserver.ts`** - Request/response/streaming transformations
2. **`src/utils/createEnvVariables.ts`** - Environment variable detection
3. **`src/config/schema.ts`** - FeatureDetection config interface
4. **`config.example.json`** - Default configuration values

## Maintenance Checklist

When Anthropic releases Claude Code updates:

- [ ] Run router with updated Claude Code CLI
- [ ] Check logs for `[Claude Update]` warnings
- [ ] Review new fields/events detected
- [ ] Test new features work through router
- [ ] Update KNOWN_FIELDS sets if needed
- [ ] Update API version constant if needed
- [ ] Update DEFAULT_BETAS list with new features
- [ ] Update this document with new findings

## Additional Resources

- **Anthropic API Changelog**: https://docs.anthropic.com/en/api/changelog
- **Claude Code Releases**: https://github.com/anthropics/claude-code/releases
- **Router Configuration**: `~/.claude-code-router/config.json`
- **Implementation Plan**: `/Users/deepsaint/.claude/plans/snoopy-conjuring-shannon.md`
