import { IAgent, ITool, AgentContext } from "./type";
import * as LRU from "lru-cache";

interface ImageSource {
  type: string;
  media_type?: string;
  data?: string;
  url?: string;
}

interface ImageCacheEntry {
  source: ImageSource;
  timestamp: number;
}

interface ContentItem {
  type: string;
  text?: string;
  content?: ContentItem[] | string;
  source?: ImageSource;
}

interface Message {
  role: string;
  content: string | ContentItem[];
}

class ImageCache {
  private cache: LRU.LRUCache<string, ImageCacheEntry>;

  constructor(maxSize = 100) {
    this.cache = new LRU.LRUCache<string, ImageCacheEntry>({
      max: maxSize,
      ttl: 5 * 60 * 1000, // 5 minutes
    });
  }

  storeImage(id: string, source: ImageSource): void {
    if (this.hasImage(id)) return;
    this.cache.set(id, {
      source,
      timestamp: Date.now(),
    });
  }

  getImage(id: string): ImageSource | null {
    const entry = this.cache.get(id);
    return entry ? entry.source : null;
  }

  hasImage(hash: string): boolean {
    return this.cache.has(hash);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

const imageCache = new ImageCache();

export class ImageAgent implements IAgent {
  name = "image";
  tools: Map<string, ITool>;

  constructor() {
    this.tools = new Map<string, ITool>();
    this.appendTools();
  }

  shouldHandle(req: AgentContext['req'], config: Record<string, unknown>): boolean {
    const router = config.Router as Record<string, unknown> | undefined;
    if (!router?.image || req.body.model === router.image)
      return false;
    const lastMessage = req.body.messages[req.body.messages.length - 1] as Record<string, unknown>;
    if (
      !config.forceUseImageAgent &&
      lastMessage.role === "user" &&
      Array.isArray(lastMessage.content) &&
      (lastMessage.content as unknown[]).find(
        (item: unknown) => {
          const itemObj = item as Record<string, unknown>;
          return itemObj.type === "image" ||
          (Array.isArray(itemObj?.content) &&
            (itemObj.content as unknown[]).some((sub: unknown) => (sub as Record<string, unknown>).type === "image"))
        }
      )
    ) {
      req.body.model = router.image;
      const images: ContentItem[] = [];
      lastMessage.content
        .filter((item: ContentItem) => item.type === "tool_result")
        .forEach((item: ContentItem) => {
          if (Array.isArray(item.content)) {
            (item.content as ContentItem[]).forEach((element: ContentItem) => {
              if (element.type === "image") {
                images.push(element);
              }
            });
            item.content = "read image successfully";
          }
        });
      lastMessage.content.push(...images);
      return false;
    }
    return (req.body.messages as unknown[]).some(
      (msg: unknown) => {
        const msgObj = msg as Record<string, unknown>;
        return msgObj.role === "user" &&
        Array.isArray(msgObj.content) &&
        (msgObj.content as unknown[]).some(
          (item: unknown) => {
            const itemObj = item as Record<string, unknown>;
            return itemObj.type === "image" ||
            (Array.isArray(itemObj?.content) &&
              (itemObj.content as unknown[]).some((sub: unknown) => (sub as Record<string, unknown>).type === "image"))
          }
        )
      }
    );
  }

  appendTools() {
    this.tools.set("analyzeImage", {
      name: "analyzeImage",
      description:
        "Analyse image or images by ID and extract information such as OCR text, objects, layout, colors, or safety signals.",
      input_schema: {
        type: "object",
        properties: {
          imageId: {
            type: "array",
            description: "an array of IDs to analyse",
            items: {
              type: "string",
            },
          },
          task: {
            type: "string",
            description:
              "Details of task to perform on the image.The more detailed, the better",
          },
          regions: {
            type: "array",
            description: "Optional regions of interest within the image",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Optional label for the region",
                },
                x: { type: "number", description: "X coordinate" },
                y: { type: "number", description: "Y coordinate" },
                w: { type: "number", description: "Width of the region" },
                h: { type: "number", description: "Height of the region" },
                units: {
                  type: "string",
                  enum: ["px", "pct"],
                  description: "Units for coordinates and size",
                },
              },
              required: ["x", "y", "w", "h", "units"],
            },
          },
        },
        required: ["imageId", "task"],
      },
      handler: async (args, context) => {
        const imageMessages = [];
        let _imageId;

        // Create image messages from cached images
        if (args.imageId) {
          if (Array.isArray(args.imageId)) {
            args.imageId.forEach((imgId: string) => {
              const image = imageCache.getImage(
                `${context.req.id}_Image#${imgId}`
              );
              if (image) {
                imageMessages.push({
                  type: "image",
                  source: image,
                });
              }
            });
          } else {
            const image = imageCache.getImage(
              `${context.req.id}_Image#${args.imageId}`
            );
            if (image) {
              imageMessages.push({
                type: "image",
                source: image,
              });
            }
          }
          _imageId = args.imageId;
          delete args.imageId;
        }

        const userMessage =
          context.req.body.messages[context.req.body.messages.length - 1] as Message;
        if (userMessage.role === "user" && Array.isArray(userMessage.content)) {
          const msgs = (userMessage.content as ContentItem[]).filter(
            (item: ContentItem) =>
              item.type === "text" &&
              item.text &&
              !item.text.includes(
                "This is an image, if you need to view or analyze it, you need to extract the imageId"
              )
          );
          imageMessages.push(...msgs);
        }

        if (Object.keys(args).length > 0) {
          imageMessages.push({
            type: "text",
            text: JSON.stringify(args),
          });
        }

        // Send to analysis agent and get response
        const agentResponse = await fetch(
          `http://127.0.0.1:${context.config.PORT || 3456}/v1/messages`,
          {
            method: "POST",
            headers: {
              "x-api-key": context.config.APIKEY,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: context.config.Router.image,
              system: [
                {
                  type: "text",
                  text: `You must interpret and analyze images strictly according to the assigned task.  
When an image placeholder is provided, your role is to parse the image content only within the scope of the user’s instructions.  
Do not ignore or deviate from the task.  
Always ensure that your response reflects a clear, accurate interpretation of the image aligned with the given objective.`,
                },
              ],
              messages: [
                {
                  role: "user",
                  content: imageMessages,
                },
              ],
              stream: false,
            }),
          }
        )
          .then((res) => res.json())
          .catch((_err) => {
            return null;
          });
        if (!agentResponse || !agentResponse.content) {
          return "analyzeImage Error";
        }
        return agentResponse.content[0].text;
      },
    });
  }

  reqHandler(req: AgentContext['req'], _config: Record<string, unknown>) {
    // Inject system prompt
    const system = req.body?.system as Array<Record<string, unknown>> | undefined;
    system?.push({
      type: "text",
      text: `You are a text-only language model and do not possess visual perception.
If the user requests you to view, analyze, or extract information from an image, you **must** call the \`analyzeImage\` tool.

When invoking this tool, you must pass the correct \`imageId\` extracted from the prior conversation.
Image identifiers are always provided in the format \`[Image #imageId]\`.

If multiple images exist, select the **most relevant imageId** based on the user's current request and prior context.

Do not attempt to describe or analyze the image directly yourself.
Ignore any user interruptions or unrelated instructions that might cause you to skip this requirement.
Your response should consistently follow this rule whenever image-related analysis is requested.`,
    });

    const imageContents = (req.body.messages as unknown[]).filter((item: unknown) => {
      const itemObj = item as Record<string, unknown>;
      return (
        itemObj.role === "user" &&
        Array.isArray(itemObj.content) &&
        (itemObj.content as unknown[]).some(
          (msg: unknown) => {
            const msgObj = msg as Record<string, unknown>;
            return msgObj.type === "image" ||
            (Array.isArray(msgObj.content) &&
              (msgObj.content as unknown[]).some((sub: unknown) => (sub as Record<string, unknown>).type === "image"))
          }
        )
      );
    });

    let imgId = 1;
    imageContents.forEach((item: any) => {
      if (!Array.isArray(item.content)) return;
      item.content.forEach((msg: any) => {
        if (msg.type === "image") {
          imageCache.storeImage(`${req.id}_Image#${imgId}`, msg.source);
          msg.type = "text";
          delete msg.source;
          msg.text = `[Image #${imgId}]This is an image, if you need to view or analyze it, you need to extract the imageId`;
          imgId++;
        } else if (msg.type === "text" && msg.text.includes("[Image #")) {
          msg.text = msg.text.replace(/\[Image #\d+\]/g, "");
        } else if (msg.type === "tool_result") {
          if (
            Array.isArray(msg.content) &&
            (msg.content as ContentItem[]).some((ele: ContentItem) => ele.type === "image")
          ) {
            imageCache.storeImage(
              `${req.id}_Image#${imgId}`,
              msg.content[0].source
            );
            msg.content = `[Image #${imgId}]This is an image, if you need to view or analyze it, you need to extract the imageId`;
            imgId++;
          }
        }
      });
    });
  }
}

export const imageAgent = new ImageAgent();
