import { transformBytes } from "./Binary.js";


var Z = process.binding("zlib");


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

        if (!this.zlib)
            throw new Error("zlib closed");

        this.zlib.close();
        this.zlib = null;
    }

    async transform(input, output, offset, ending) {

        if (this.request)
            throw new Error("zlib write in progress");

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
                this.request = this.zlib.write(
                    ending ? Z.Z_FINISH : Z.Z_NO_FLUSH,
                    input,
                    inOffset,
                    inLength,
                    output,
                    outOffset,
                    outLength);

                this.request.buffer = input;

                this.request.callback = (inLeft, outLeft) => accept([

                    inLength - inLeft,
                    outLength - outLeft,
                ]);

            });

        } finally {

            this.zlib.onerror = null;
            this.request = null;
        }

    }

}


async function *zStream(input, mode, options) {

    let zlib = new ZLib(mode, options);

    try {

        return yield * transformBytes(input, zlib);

    } finally {

        zlib.close();
    }
}


export function deflate(input, options) {

    return zStream(input, Z.DEFLATE, options);
}


export function deflateRaw(input, options) {

    return zStream(input, Z.DEFLATERAW, options);
}


export function inflate(input, options) {

    return zStream(input, Z.INFLATE, options);
}


export function inflateRaw(input, options) {

    return zStream(input, Z.INFLATERAW, options);
}


export function gzip(input, options) {

    return zStream(input, Z.GZIP, options);
}


export function gunzip(input, options) {

    return zStream(input, Z.GUNZIP, options);
}
