import { Condition, Mutex } from "./Mutex.js";

export class CopyStream {

    constructor() {

        this.output = null;
        this.outputOffset = 0;
        this.outputState = "";
        this.reading = new Mutex;
        this.writing = new Mutex;
        this.outputReady = new Condition;
        this.outputDone = new Condition;
        this.ended = false;
    }

    async read(buffer) {

        return this.reading.lock(async $=> {

            // Null signals end-of-stream
            if (this.ended)
                return null;

            this.output = buffer;
            this.outputOffset = 0;

            // Signal that a buffer is ready and wait until buffer is done
            this.outputState = "ready";
            this.outputReady.notify();
            await this.outputDone.wait();

            buffer = this.output;

            this.output = null;
            this.outputState = "";

            return buffer;

        });
    }

    async write(buffer) {

        return this.writing.lock(async $=> {

            if (this.ended)
                throw new Error("Stream closed");

            var offset = 0,
                outLength,
                needed,
                count,
                end;

            while (offset < buffer.length) {

                if (this.outputState !== "ready")
                    await this.outputReady.wait();

                outLength = this.output.length;
                needed = outLength - this.outputOffset;
                end = Math.min(offset + needed, buffer.length);
                count = end - offset;

                buffer.copy(this.output, this.outputOffset, offset, end);

                offset += count;
                this.outputOffset += count;

                if (this.outputOffset >= outLength) {

                    this.outputState = "done";
                    this.outputDone.notify();
                }
            }

            return buffer.length;

        });
    }

    async end() {

        return this.writing.lock($=> {

            this.ended = true;

            if (this.output) {

                this.output = this.output.slice(0, this.outputOffset);
                this.outputState = "done";
                this.outputDone.notify();
            }

        });
    }

}
