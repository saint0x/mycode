/**
 * Reads from source ReadableStream, returns a new ReadableStream where processor handles the source data
 * and pushes processed values to the new stream. If no value is returned, nothing is pushed.
 * @param stream - The source readable stream
 * @param processor - Function to process each chunk
 */
export const rewriteStream = (stream: ReadableStream, processor: (data: unknown, controller: ReadableStreamController<unknown>) => Promise<unknown>): ReadableStream => {
  const reader = stream.getReader()

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            break
          }

          const processed = await processor(value, controller)
          if (processed !== undefined) {
            controller.enqueue(processed)
          }
        }
      } catch (error) {
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    }
  })
}
