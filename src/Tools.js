import { Gate } from "./Primatives.js";


function iterBase() {

    return { [Symbol.asyncIterator]() { return this } };
}


// Skips over an iteration and returns the iterator
export function skipFirst(iter) {

    iter.next();
    return iter;
}


// Returns an async iterator from the specified iterator
export function asyncIter(iter) {

    let queue = [], state = "paused";

    function enqueue(type, value) {

        let accept,
            reject,
            promise = new Promise((a, r) => (accept = a, reject = r));

        queue.push({ type, value, accept, reject });

        if (state === "paused")
            flush();

        return promise;
    }

    async function flush() {

        state = "running";

        while (queue.length > 0) {

            let next = queue.shift();

            try { next.accept(await iter[next.type](next.value)) }
            catch (x) { next.reject(x) }
        }

        state = "paused";
    }

    let aIter = iterBase();

    if ("next" in iter) aIter.next = val => enqueue("next", val);
    if ("throw" in iter) aIter.throw = val => enqueue("throw", val);
    if ("return" in iter) aIter.return = val => enqueue("return", val);

    return aIter;
}


// Returns an iterator which intercepts method calls to the input iterator
export function intercept(iter, interceptor) {

    let obj = iterBase();

    for (let name of ["next", "throw", "return"]) {

        if (!(name in iter))
            continue;

        obj[name] = name in interceptor ?
            x => interceptor[name](x) :
            x => iter[name](x);
    }

    return asyncIter(obj);
}


// Returns an iterator which maps values from the input iterator
export async function *map(iter, fn) {

    for async (let value of iter)
        yield await fn(value);
}


// Returns an iterator which executes a callback for each value in the sequence
export function forEach(iter, fn) {

    return map(iter, async val => (await fn(val), val));
}


// Composes a list of streams
export function compose(list) {

    return function(input) {

        for (let fn of list)
            input = fn(input);

        return input;
    };
}


// Composes a list of streams and executes the composition
export function pipe(list) {

    return compose(list)();
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


// Wraps an iterator with push-back capabilities
export function pushBack(input) {

    if (typeof input.push === "function")
        return input;

    let stack = [], done = false;

    let iter = intercept(input, {

        async next(val) {

            if (!done && stack.length > 0)
                return { value: stack.pop(), done: false };

            let result = await input.next(val);

            if (result.done)
                done = true;

            return result;
        }
    });

    iter.push = value => void stack.push(value);

    return iter;
}


// Wraps an iterator with an iterator that only has a "next" method
export function nextOnly(iter) {

    return { next(value) { return iter.next(value) } };
}


export function mutexMethods(obj, ...names) {

    const QUEUE = Symbol();

    function wrap(fn) {

        return function(...args) {

            let queue = this[QUEUE];

            if (!queue) {

                queue = this[QUEUE] = [];
                queue.state = "paused";
            }

            let accept,
                reject,
                promise = new Promise((a, r) => (accept = a, reject = r));

            queue.push({ fn, args, accept, reject });

            if (queue.state === "paused")
                flush(this, queue);

            return promise;
        };
    }

    async function flush(obj, queue) {

        queue.state = "running";

        while (queue.length > 0) {

            let next = queue.shift();

            try { next.accept(await next.fn.apply(obj, next.args)) }
            catch (x) { next.reject(x) }
        }

        queue.state = "paused";
    }

    for (let name of names)
        obj[name] = wrap(obj[name]);

    return obj;
}


export function asyncClass(F, ...methods) {

    const QUEUE = Symbol();

    function wrap(fn) {

        return function(...args) {

            let queue = this[QUEUE];

            if (!queue) {

                queue = this[QUEUE] = [];
                queue.state = "paused";
            }

            let accept,
                reject,
                promise = new Promise((a, r) => (accept = a, reject = r));

            queue.push({ fn, args, accept, reject });

            if (queue.state === "paused")
                flush(this, queue);

            return promise;
        };
    }

    async function flush(obj, queue) {

        queue.state = "running";

        while (queue.length > 0) {

            let next = queue.shift();

            try { next.accept(await next.fn.apply(obj, next.args)) }
            catch (x) { next.reject(x) }
        }

        queue.state = "paused";
    }

    for (let name of methods)
        F.prototype[name] = wrap(F.prototype[name]);
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


// TODO:  As the queue approaches its maximum size, we should notify the
// controller.  This will give the controller an opportunity to throttle the
// output rate.  Will the controller have enough information to determine
// the ideal rate?  It should be able to calculate the current consumption
// rate, in principle


export function pushSource(init) {

    let nextReady = x => null,
        queue = [],
        closed = false;

    async function *produce() {

        try {



        } finally {

            closed = true;
        }
    }

    async function *consume() {

        while (true) {

            // Yield all queued events
            while (queue.length > 0) {

                let item = queue.shift();
                item.resolve();
                yield item.value;
            }

            if (closed)
                break;

            // Wait for a new event to arrive
            await new Promise(accept => nextReady = accept);
        }
    }

    init(produce());
    return consume();
}


export function sinkSource() {

    let gate = new Gate,
        done = false;

    async function *producer() {

        try {

            while (!done) {

                gate.open("ready", yield);
                await gate.wait("done");
                gate.close("done");
            }

        } finally {

            gate.open("ready");
            done = true;
        }
    }

    async function *consumer() {

        try {

            while (true) {

                let value = await gate.wait("ready");

                if (done)
                    break;

                gate.close("ready");
                gate.open("done");

                yield value;
            }

        } finally {

            gate.open("done");
            done = true;
        }
    }

    let sink = skipFirst(producer()),
        source = consumer();

    return { sink, source };
}
