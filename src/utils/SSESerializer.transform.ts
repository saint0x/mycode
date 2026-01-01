export class SSESerializerTransform extends TransformStream<Record<string, unknown>, string> {
    constructor() {
        super({
            transform: (event, controller) => {
                let output = '';

                if (event.event) {
                    output += `event: ${event.event}\n`;
                }
                if (event.id) {
                    output += `id: ${event.id}\n`;
                }
                if (event.retry) {
                    output += `retry: ${event.retry}\n`;
                }
                if (event.data) {
                    if (typeof event.data === 'object' && event.data !== null && 'type' in event.data && event.data.type === 'done') {
                        output += 'data: [DONE]\n';
                    } else {
                        output += `data: ${JSON.stringify(event.data)}\n`;
                    }
                }

                output += '\n';
                controller.enqueue(output);
            }
        });
    }
}
