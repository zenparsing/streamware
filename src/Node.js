import { Gate } from "./Primatives.js";


async function *read(inner) {

    let gate = new Gate,
        ended = false,
        reading = false,
        error = null;

    async function onReadable() {

        if (reading)
            return;

        reading = true;

        while (true) {

            // Wait for an active read request
            await gate.wait("request");

            let chunk = null;

            try { chunk = inner.read() }
            catch (x) { onError(x) }

            if (!chunk)
                break;

            // Stop consuming until the next read request
            gate.close("request");

            // Release generator waiting for a read
            gate.release("read", chunk);
        }

        reading = false;
    }

    function onError(x) {

        error = x;
        gate.release("read", null);
    }

    function onEnd() {

        ended = true;
        gate.release("read", null);
    }

    inner.on("readable", onReadable);
    inner.on("end", onEnd);
    inner.on("error", onError);

    try {

        // Read data currently sitting in buffer
        onReadable();

        while (!ended) {

            // Throw error if we encountered one at any time
            if (error)
                throw error;

            // Unblock data pump
            gate.open("request");

            // Wait for a sucessfull read
            let chunk = await gate.wait("read");

            if (chunk)
                yield chunk;
        }

    } finally {

        inner.removeListener("readable", onReadable);
        inner.removeListener("end", onEnd);
        inner.removeListener("error", onError);
    }
}


async function *transform(input, inner) {

    let writeDone = write(input),
        value = yield * read(inner);

    await writeDone;
    return value;
}


async function write(input, inner) {

    async function wrap(fn) {

        let onError;

        try {

            await new Promise((accept, reject) => {

                inner.on("error", onError = reject);
                fn(accept);
            });

        } finally {

            inner.removeListener("error", onError);
        }
    }

    for async (let buffer of input)
        await wrap(done => inner.write(buffer, done));

    await wrap(done => inner.end(done));
}


export function wrapNode(input, inner) {

    return !inner ? read(input) :
        "read" in inner ? transform(input, inner) :
        write(input, inner);
}
