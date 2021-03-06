import { prime } from "./Tools.js";

const DEFAULT_BUFFER_SIZE = 16 * 1024;

class Decoder {

    constructor(encoding = "utf8") {

        encoding = encoding
            .toLowerCase()
            .replace(/[-_]/, "")
            .replace(/^usc2$/, "utf16le");

        this.encoding = encoding;
        this.charBuffer = new Buffer(6);
        this.charOffset = 0;
        this.charLength = 0;
        this.surrogateSize = 0;

        switch (encoding) {

            case "utf8": this.surrogateSize = 3; break;
            case "utf16le": this.surrogateSize = 2; break;
            case "base64": this.surrogateSize = 3; break;
        }
    }

    detectIncomplete(buffer) {

        switch (this.encoding) {

            case "utf8": return this.detectIncompleteUTF8(buffer);
            case "utf16le": return this.detectIncompleteUTF16(buffer);
            case "base64": return this.detectIncompleteBase64(buffer);
            default: throw new Error("Invalid encoding");
        }
    }

    detectIncompleteUTF8(buffer) {

        let c, i;

        for (i = Math.min(buffer.length, 3); i > 0; i--) {

            c = buffer[buffer.length - i];

            if (i == 1 && c >> 5 === 0x06) { // 110XXXXX

                this.charLength = 2;
                break;
            }

            if (i <= 2 && c >> 4 === 0x0E) { // 1110XXXX

                this.charLength = 3;
                break;
            }

            if (i <= 3 && c >> 3 === 0x1E) { // 11110XXX

                this.charLength = 4;
                break;
            }
        }

        return i;
    }

    detectIncompleteUTF16(buffer) {

        this.charOffset = buffer.length % 2;
        this.charLength = this.charOffset ? 2 : 0;
        return this.charOffset;
    }

    detectIncompleteBase64(buffer) {

        this.charOffset = buffer.length % 3;
        this.charLength = this.charOffset ? 3 : 0;
        return this.charOffset;
    }

    decodeBuffer(buffer) {

        if (this.surrogateSize === 0)
            return buffer.toString(this.encoding);

        let value = "",
            charCode = 0,
            offset = 0,
            size,
            len,
            end;

        // If the last write ended with an incomplete character...
        while (this.charLength) {

            // Attempt to fill the char buffer
            len = Math.min(this.charLength - this.charOffset, buffer.length);
            buffer.copy(this.charBuffer, this.charOffset, offset, len);

            this.charOffset += (len - offset);
            offset = len;

            // If the char buffer is still not filled, exit and wait for more data
            if (this.charOffset < this.charLength)
                return null;

            // Get the character that was split
            value = this.charBuffer.slice(0, this.charLength).toString(this.encoding);
            charCode = value.charCodeAt(value.length - 1);

            // If character is the first of a surrogate pair...
            if (charCode >= 0xD800 && charCode <= 0xDBFF) {

                // Extend the char buffer and attempt to fill it
                value = "";
                this.charLength += this.surrogateSize;
                continue;
            }

            // Reset the char buffer
            this.charOffset =
            this.charLength = 0;

            // If there are no more bytes in this buffer, exit
            if (len === buffer.length)
                return value;

            buffer = buffer.slice(len);
            break;
        }

        len = this.detectIncomplete(buffer);
        end = buffer.length;

        if (this.charLength) {

            // Put incomplete character data into the char buffer
            buffer.copy(this.charBuffer, 0, buffer.length - len, end);
            this.charOffset = len;
            end -= len;
        }

        value += buffer.toString(this.encoding, 0, end);
        end = value.length;

        // Get the last character in the string
        charCode = value.charCodeAt(value.length - 1);

        // If character is a lead surrogate...
        if (charCode >= 0xD800 && charCode <= 0xDBFF) {

            end = value.length - 1;
            size = this.surrogateSize;

            // Add surrogate data to the char buffer
            this.charLength += size;
            this.charOffset += size;
            this.charBuffer.copy(this.charBuffer, size, 0, size);
            this.charBuffer.write(value.charAt(end), this.encoding);
        }

        return value.slice(0, end);
    }

    finalize() {

        if (this.charOffset)
            return this.charBuffer.slice(0, this.charOffset).toString(this.encoding);

        return null;
    }
}


export function encodeText(encoding = "utf8") {

    let input = this;

    return async function*() {

        let buffer = yield null;

        for await (let text of input) {

            while (text) {

                if (!buffer)
                    buffer = new Buffer(DEFAULT_BUFFER_SIZE);

                let len = buffer.write(text, 0, void 0, encoding);

                buffer = buffer.slice(0, len);

                text = text.slice(buffer.toString().length);
                buffer = yield buffer;
            }
        }

    }::prime();
}


export async function *decodeText(encoding) {

    let decoder = new Decoder(encoding),
        text;

    for await (let buffer of this) {

        text = decoder.decodeBuffer(buffer);

        if (text !== null)
            yield text;
    }

    text = decoder.finalize();

    if (text !== null)
        yield text;
}


export async function concatText() {

    let out = "";

    for await (let text of this)
        out += text;

    return out;
}
