import { Mutex } from "./Mutex.js";

export class NodeStream {

    constructor(inner) {

        this.inner = inner;
        this.reading = new Mutex;
        this.writing = new Mutex;
        this.readBuffer = null;
        this.readEnded = false;

        if (typeof inner.read === "function")
            inner.on("end", $=> this.readEnded = true);
    }

    get ended() {

        return this.readEnded && this.readBuffer === null;
    }

    async read(buffer) {

        return this.reading.lock(async $=> {

            var inner = this.inner,
                offset = 0,
                resolve,
                reject,
                promise;

            if (this.ended)
                return null;

            if (buffer.length === 0)
                return buffer;

            promise = new Promise((s, j) => (resolve = s, reject = j));

            var onReadable = $=> {

                var data;

                while (offset < buffer.length) {

                    // Read the next available chunk of data from the underlying stream
                    data = this._innerRead();

                    // Exit if there is no currently buffered data
                    if (data === null)
                        break;

                    // Put some data back if we got too much
                    if (offset + data.length > buffer.length) {

                        this.readBuffer = data.slice(buffer.length - offset);
                        data = data.slice(0, buffer.length - offset);
                    }

                    // TODO:  Should we provide an option to copy the data
                    // to the supplied output buffer, instead of just returning
                    // the read data?  In general, users will want to avoid
                    // the overhead of copying, so forwarding should probably
                    // be the default.

                    // Copy data into output buffer
                    // data.copy(buffer, offset);

                    // Set output to receieved buffer
                    buffer = data;

                    // Advance the stream position
                    offset += data.length;
                }

                // If output buffer has been filled, then finish
                if (offset >= buffer.length || this.ended)
                    resolve();
            };

            var onEnd = $=> {

                if (this.readBuffer === null)
                    resolve();
            };

            // Register stream events
            inner.on("end", onEnd);
            inner.on("error", reject);
            inner.on("readable", onReadable);

            // Read any already buffered data
            onReadable();

            try {

                // Wait for filled buffer, or error, or end of stream
                await promise

            } finally {

                // Unregister events
                inner.removeListener("end", onEnd);
                inner.removeListener("error", reject);
                inner.removeListener("readable", onReadable);
            }

            if (offset === 0)
                buffer = null;
            else if (offset < buffer.length)
                buffer = buffer.slice(0, offset);

            return buffer;

        });
    }

    async write(buffer) {

        return this._writeOp(resolve => {

            this.inner.write(buffer, $=> resolve());
        });
    }

    async end() {

        return this._writeOp(resolve => {

            this.inner.end($=> resolve());
        });
    }

    _innerRead() {

        if (this.readBuffer) {

            var data = this.readBuffer;
            this.readBuffer = null;
            return data;
        }

        return this.inner.read();
    }

    async _writeOp(fn) {

        return this.writing.lock(async $=> {

            var resolve, reject, promise;

            promise = new Promise((s, j) => (resolve = s, reject = j));
            this.inner.on("error", reject);
            fn(resolve);

            try { await promise }
            finally { this.inner.removeListener("error", reject) }

        });
    }

}
