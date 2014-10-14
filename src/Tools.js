import { Gate } from "./Primatives.js";


function wrapIter(iter, overrides) {

    let wrap = { [Symbol.asyncIterator]() { return this } };

    Object.keys(overrides).forEach(name => {

        if (name in iter)
            wrap[name] = overrides[name];
    });

    ["next", "throw", "return"].forEach(name => {

        if (!(name in wrap))
            wrap[name] = function() { return iter[name].apply(arguments) };
    });

    return wrap;
}


// Skips over an iteration and returns the iterator
export function skipFirst(iter) {

    iter.next();
    return iter;
}


// Returns an iterator which maps values from the input iterator
export async function *map(iter, fn) {

    for async (let value of iter)
        yield await fn(value);
}


export function mapInput(iter, fn) {

    return wrapIter(iter, {

        next(value) { return iter.next(fn(value)) }
    });
}


export function injectFirst(iter, value) {

    let first = true;

    return wrapIter(iter, {

        next(v) {

            if (first) {

                first = false;
                v = value;
            }

            return iter.next(v);
        }
    });
}


// Returns an iterator which executes a callback for each value in the sequence
export async function forEach(iter, fn) {

    for async (let value of iter)
        await fn(val);
}


// Composes a stream with a list of filters
export function compose(input, list) {

    for (let fn of list)
        input = fn(input);

    return input;
}


// Returns an iterator which pumps and buffers the input iterator
export async function *buffer(input, options = {}) {

    const defaultPool = { allocate() {}, release() {} };

    let minBuffers = options.min >>> 0 || 1,
        maxBuffers = options.max >>> 0 || 16,
        bufferPool = options.pool || defaultPool,
        bufferCount = 0,
        freeList = [],
        readyList = [],
        activeBuffer = null,
        gate = new Gate;

    // Allocate initial buffers
    while (bufferCount < minBuffers)
        freeList[bufferCount++] = bufferPool.allocate();

    // Start pumping the input
    pump();

    while (true) {

        if (activeBuffer) {

            if (freeList.length < minBuffers) {

                freeList.push(activeBuffer);
                gate.release("free");

            } else {

                bufferPool.release(activeBuffer);
            }

            activeBuffer = null;
        }

        if (readyList.length === 0)
            await gate.wait("ready");

        let next = readyList.shift(),
            result = next.result;

        activeBuffer = next.buffer;

        if (result.error)
            throw result.error;

        if (result.done)
            return result.value;

        yield result.value;
    }

    async function pump() {

        while (true) {

            // If free list is empty...
            if (freeList.length === 0) {

                // If we can allocate a new buffer...
                if (bufferCount < maxBuffers) {

                    // Allocate a new buffer
                    bufferCount += 1;
                    freeList.push(bufferPool.allocate());

                } else {

                    // Wait for a free buffer
                    await gate.wait("free");
                }
            }

            // Get a buffer from the free list
            let buffer = freeList.shift(),
                result;

            try {

                // Read from the input stream
                result = await input.next(buffer);

            } catch (x) {

                // Store error for throwing from generator
                result = { done: true, error: x, value: void 0 };
            }

            // Add to ready list and release waiters
            readyList.push({ result, buffer });
            gate.release("ready");

            if (result.done)
                break;
        }
    }
}


export async function *slice(input, start = 0, stop = Infinity) {

    let current = 0;

    if (current >= stop)
        return;

    for async (let chunk of input) {

        if (current >= start)
            yield chunk;

        if (++current >= stop)
            break;
    }
}


export async function *noClose(iter) {

    var iter = iterBase();
    iter.next = val => input.next(val);
    iter.throw = val => input.throw(val);
    return iter;
}


export function sinkSource() {

    let gate = new Gate,
        closed = false;

    async function *producer() {

        try {

            while (!closed) {

                gate.open("ready", yield);
                await gate.wait("done");
                gate.close("done");
            }

        } finally {

            closed = true;
            gate.open("ready");
        }
    }

    async function *consumer() {

        try {

            while (true) {

                let value = await gate.wait("ready");

                if (closed)
                    break;

                gate.close("ready");
                gate.open("done");

                yield value;
            }

        } finally {

            closed = true;
            gate.open("done");
        }
    }

    let sink = skipFirst(producer()),
        source = consumer();

    return { sink, source };
}


export async function transfer(input, output) {

    try {

        for async (let value of input)
            output.next(value);

    } finally {

        output.return();
    }
}
