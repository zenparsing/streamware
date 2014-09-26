import { Gate } from "./Primatives.js";
import { buffer, skipFirst } from "./Tools.js";


const DEFAULT_BUFFER_SIZE = 16 * 1024;


export function readBytes(reader, maxBytes = Infinity) {

    return skipFirst(async function*() {

        let chunk = yield new Buffer(0);

        while (maxBytes > 0) {

            if (!chunk)
                chunk = new Buffer(DEFAULT_BUFFER_SIZE);

            if (maxBytes < chunk.length)
                chunk = chunk.slice(0, maxBytes);

            let output = await reader.read(chunk);

            if (!output)
                break;

            maxBytes -= chunk.length;
            chunk = yield output;
        }

    }());
}


export async function writeBytes(input, writer) {

    for async (let chunk of input)
        writer.write(chunk);
}


export function transformBytes(input, transformer) {

    return skipFirst(async function*() {

        let emptyChunk = new Buffer(0),
            output = yield emptyChunk,
            offset = 0;

        for async (let chunk of input) {

            // While there is still input to process...
            while (chunk.length > 0) {

                if (!output)
                    output = new Buffer(DEFAULT_BUFFER_SIZE);

                // Write to transformer
                let [ read, written ] = await transformer.transform(chunk, output, offset, false);

                chunk = chunk.slice(read);
                offset += written;

                // If output buffer was filled, return it to the client and wait for
                // another output buffer
                if (offset >= output.length) {

                    output = yield output;
                    offset = 0;
                }
            }
        }

        while (true) {

            // Flush the transform buffer
            let [ read, written ] = await transformer.transform(emptyChunk, output, offset, true);
            offset += written;

            // If buffer has been completely flushed...
            if (written === 0) {

                // Return remaining output to client and exit
                yield output.slice(0, offset);
                break;

            } else if (offset >= output.length) {

                // Return filled output buffer to client and wait for another buffer
                output = yield output;
                offset = 0;
            }
        }

    }());
}


export function bufferBytes(input, options = {}) {

    const defaultPool = {

        allocate(size) { return new Buffer(size) },
        release() { }
    };

    let min = options.min >>> 0 || 1,
        max = options.max >>> 0 || 2,
        size = options.size >>> 0 || DEFAULT_BUFFER_SIZE,
        innerPool = options.pool || defaultPool;

    let pool = {

        allocate() { return innerPool.allocate(size) },
        release: innerPool.release,
    };

    return buffer(input, { min, max, pool });
}


export async function *fixedBytes(input, length) {

    let leftover = null;

    for async (let chunk of input) {

        if (leftover)
            chunk = Buffer.concat(leftover, chunk);

        while (chunk.length >= length) {

            yield chunk.slice(0, length);
            chunk = chunk.slice(length);
        }

        leftover = chunk.length > 0 ? chunk : null;
    }

    if (leftover)
        yield leftover;
}


export async function *limitBytes(input, limit) {

    if (typeof input.push !== "function")
        throw new TypeError("Not a push back iterator");

    if (limit <= 0)
        return;

    for async (let chunk of input) {

        if (chunk.length > limit) {

            input.push(chunk.slice(limit));
            chunk = chunk.slice(0, limit);
        }

        limit -= chunk.length;
        yield chunk;

        if (limit === 0)
            break;
    }

}
