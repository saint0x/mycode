import { MessageParam, Tool, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { get_encoding } from "tiktoken";

// Sub-agent headers
export const SUBAGENT_DEPTH_HEADER = 'x-ccr-subagent-depth';
export const SUBAGENT_ID_HEADER = 'x-ccr-subagent-id';

const enc = get_encoding("cl100k_base");

interface ContentPart {
  type: string;
  text?: string;
  input?: unknown;
  content?: string | unknown;
}

export const calculateTokenCount = (
  messages: MessageParam[],
  system: string | TextBlockParam[] | undefined,
  tools: Tool[]
) => {
  let tokenCount = 0;
  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      if (typeof message.content === "string") {
        tokenCount += enc.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        message.content.forEach((contentPart: unknown) => {
          const part = contentPart as ContentPart;
          if (part.type === "text" && typeof part.text === "string") {
            tokenCount += enc.encode(part.text).length;
          } else if (part.type === "tool_use") {
            tokenCount += enc.encode(JSON.stringify(part.input)).length;
          } else if (part.type === "tool_result") {
            tokenCount += enc.encode(
              typeof part.content === "string"
                ? part.content
                : JSON.stringify(part.content)
            ).length;
          }
        });
      }
    });
  }
  if (typeof system === "string") {
    tokenCount += enc.encode(system).length;
  } else if (Array.isArray(system)) {
    system.forEach((item: TextBlockParam) => {
      if (item.type !== "text") return;
      if (typeof item.text === "string") {
        tokenCount += enc.encode(item.text).length;
      }
    });
  }
  if (tools) {
    tools.forEach((tool: Tool) => {
      if (tool.description) {
        tokenCount += enc.encode(tool.name + tool.description).length;
      }
      if (tool.input_schema) {
        tokenCount += enc.encode(JSON.stringify(tool.input_schema)).length;
      }
    });
  }
  return tokenCount;
};
