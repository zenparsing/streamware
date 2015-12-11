import { transformBytes } from "./Binary.js";
import { prime } from "./Tools.js";
import { mutex } from "./Primatives.js";


var Z = typeof process === "object" && process.binding("zlib");


class ZLib {

    constructor(mode, options = {}) {

        this.zlib = new Z.Zlib(mode);

        this.zlib.init(
            opt("windowBits", 15),
            opt("compression", Z.Z_DEFAULT_COMPRESSION),
            opt("memoryLevel", 8),
            opt("strategy", Z.Z_DEFAULT_STRATEGY),
            opt("dictionary"));

        function opt(name, val) { return name in options ? options[name] : val }
    }

    close() {

        if (this.zlib) {

            this.zlib.close();
            this.zlib = null;
        }
    }

    async transform(input, output, offset, ending) {

        if (!this.zlib)
            throw new Error("zlib closed");

        try {

            return await new Promise((accept, reject) => {

                this.zlib.onerror = (msg, errno) => {

                    // End the stream ungracefully
                    this.zlib = null;
                    reject(new Error(msg));
                };

                let inOffset = 0,
                    inLength = input.length,
                    outOffset = offset || 0,
                    outLength = output.length - outOffset,
                    req;

                // Send a write command to zlib
                req = this.zlib.write(
                    ending ? Z.Z_FINISH : Z.Z_NO_FLUSH,
                    input,
                    inOffset,
                    inLength,
                    output,
                    outOffset,
                    outLength);

                req.buffer = input;

                req.callback = (inLeft, outLeft) => accept([

                    inLength - inLeft,
                    outLength - outLeft,
                ]);

            });

        } finally {

            if (this.zlib)
                this.zlib.onerror = null;
        }
    }

}


function zStream(mode, options) {

    let input = this;

    return async function*() {

        let value = yield void 0,
            zlib = new ZLib(mode, options),
            inner = input::transformBytes(zlib);

        try {

            while (true) {

                let next = await inner.next(value);

                value = next.value;

                if (next.done)
                    return value;

                value = yield value;
            }

        } finally { zlib.close() }

    }::prime();
}


export function deflate(options) {

    return this::zStream(Z.DEFLATE, options);
}


export function deflateRaw(options) {

    return this::zStream(Z.DEFLATERAW, options);
}


export function inflate(options) {

    return this::zStream(Z.INFLATE, options);
}


export function inflateRaw(options) {

    return this::zStream(Z.INFLATERAW, options);
}


export function gzip(options) {

    return this::zStream(Z.GZIP, options);
}


export function gunzip(options) {

    return this::zStream(Z.GUNZIP, options);
}
