import { Gate } from "./Primatives.js";


export function asyncIter() {

    if (this[Symbol.asyncIterator] !== void 0)
        return this[Symbol.asyncIterator]();

    // TODO: replace _esdown reference

    var iter = { [Symbol.asyncIterator]() { return this } },
        inner = _esdown.iter(this);

    ["next", "throw", "return"].forEach(name => {

        if (name in inner)
            iter[name] = value => Promise.resolve(inner[name](value));
    });

    return iter;
}


// Skips over an iteration and returns the iterator
export function skipFirst() {

    this.next();
    return this;
}


// Returns an iterator which maps values from the input iterator
export async function *map(fn) {

    for async (let value of this)
        yield await fn(value);
}


// Returns an iterator which executes a callback for each value in the sequence
export async function forEach(fn) {

    for async (let value of this)
        await fn(val);
}


// Returns an iterator which pumps and buffers the input iterator
export async function *pump(options = {}) {

    const defaultPool = { allocate() {}, release() {} };

    let input = this,
        minBuffers = options.min >>> 0 || 1,
        maxBuffers = options.max >>> 0 || 16,
        bufferPool = options.pool || defaultPool,
        bufferCount = 0,
        freeList = [],
        readyList = [],
        activeBuffer = null,
        finished = false,
        gate = new Gate;

    // Allocate initial buffers
    while (bufferCount < minBuffers)
        freeList[bufferCount++] = bufferPool.allocate();

    // Start pumping the input
    consume();

    while (true) {

        if (activeBuffer) {

            if (freeList.length < minBuffers) {

                freeList.push(activeBuffer);
                gate.release("free");

            } else {

                bufferCount -= 1;
                bufferPool.release(activeBuffer);
            }

            activeBuffer = null;
        }

        if (readyList.length === 0)
            await gate.wait("ready");

        let next = readyList.shift(),
            result = next.result;

        activeBuffer = next.buffer;

        if (result.error) {

            finished = true;
            throw result.error;
        }

        if (result.done) {

            finished = true;
            return result.value;
        }

        yield result.value;

        // TODO:  Close input if yield throws?
    }

    async function consume() {

        while (!finished) {

            // If free list is empty...
            if (freeList.length === 0) {

                // If we have unused headroom...
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
                finished = true;
        }
    }
}


export async function *slice(start = 0, stop = Infinity) {

    let current = 0;

    if (current >= stop)
        return;

    for async (let chunk of this) {

        if (current >= start)
            yield chunk;

        if (++current >= stop)
            break;
    }
}


export async function *noClose() {

    let iter = iterBase();
    iter.next = val => this.next(val);
    iter.throw = val => this.throw(val);
    return iter;
}


export function sinkSource() {

    let gate = new Gate,
        finished = false;

    async function *producer() {

        try {

            while (!finished) {

                gate.open("ready", yield);
                await gate.wait("done");
                gate.close("done");
            }

        } finally {

            finished = true;
            gate.open("ready");
        }
    }

    async function *consumer() {

        try {

            while (true) {

                let value = await gate.wait("ready");
                gate.close("ready");

                if (finished)
                    break;

                yield value;
                gate.open("done");
            }

        } finally {

            finished = true;
            gate.open("done");
        }
    }

    let sink = producer()::skipFirst(),
        source = consumer();

    return { sink, source };
}


export async function transfer(output) {

    try {

        for async (let value of this)
            await output.next(value);

    } finally {

        await output.return();
    }
}
