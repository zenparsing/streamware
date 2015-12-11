import { Gate } from "./Primatives.js";
import { pump, prime, asyncIter } from "./Tools.js";


const DEFAULT_BUFFER_SIZE = 16 * 1024;


export function limitBytes(maxBytes) {

    let input = this::asyncIter();

    return async function*() {

        let chunk = yield null;

        while (maxBytes > 0) {

            if (!chunk)
                chunk = new Buffer(DEFAULT_BUFFER_SIZE);

            if (maxBytes < chunk.length)
                chunk = chunk.slice(0, maxBytes);

            let result = await input.next(chunk);

            if (result.done)
                return result.value;

            maxBytes -= chunk.length;
            chunk = yield result.value;

            // TODO: close input if yield throws
        }

    }::prime();
}


export function transformBytes(transformer) {

    let input = this;

    return async function*() {

        let output = yield null,
            emptyChunk = new Buffer(0),
            offset = 0;

        for await (let chunk of input) {

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

            if (!output)
                output = new Buffer(DEFAULT_BUFFER_SIZE);

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

    }::prime();
}


export function pumpBytes(options = {}) {

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

    return this::pump({ min, max, pool });
}
