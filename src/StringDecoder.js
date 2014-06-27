import { Condition, Mutex } from "Mutex.js";

export class StringDecoder {

    constructor(encoding = "utf8") {
    
        encoding = encoding
            .toLowerCase()
            .replace(/[-_]/, "")
            .replace(/^usc2$/, "utf16le");
        
        this.reading = new Mutex;
        this.writing = new Mutex;
        this.textReady = new Condition;
        this.ended = false;
        
        this.encoding = encoding;
        this.charBuffer = new Buffer(6);
        this.charOffset = 0;
        this.charLength = 0;
        this.surrogateSize = 0;
        this.value = "";
        
        switch (encoding) {
        
            case "utf8": this.surrogateSize = 3; break;
            case "utf16le": this.surrogateSize = 2; break;
            case "base64": this.surrogateSize = 3; break;
        };
    }
    
    async read() {
    
        return this.reading.lock(async $=> {
        
            if (this.value.length === 0 && !this.ended)
                await this.textReady.wait();
            
            var val = this.value;
            this.value = "";
            return val;
        });
    }
    
    async write(buffer) {
    
        return this.writing.lock($=> {
        
            if (this.ended)
                throw new Error("Stream closed");
            
            if (buffer.length === 0)
                return;
            
            if (this.surrogateSize === 0)
                return this._addText(buffer.toString(this.encoding));
            
            var value = "",
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
                    return;

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
                    return this._addText(charStr);

                buffer = buffer.slice(len);
                break;
            }

            len = this._detectIncomplete(buffer);
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
            
            return this._addText(value.slice(0, end));
            
        });
    }
    
    async end() {
    
        return this.writing.lock($=> {
        
            this.ended = true;
            
            if (this.charOffset)
                this._addText(this.charBuffer.slice(0, this.charOffset).toString(this.encoding));
        });
    }
    
    _addText(text) {
    
        this.value += text;
        
        if (this.value.length > 0)
            this.textReady.notify();
    }
    
    _detectIncomplete(buffer) {
    
        switch (this.encoding) {
        
            case "utf8": return this._detectIncompleteUTF8(buffer);
            case "utf16le": return this._detectIncompleteUTF16(buffer);
            case "base64": return this._detectIncompleteBase64(buffer);
            default: throw new Error("Invalid encoding");
        }
    }
    
    _detectIncompleteUTF8(buffer) {

        var c, i;
        
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
    
    _detectIncompleteUTF16(buffer) {
    
        this.charOffset = buffer.length % 2;
        this.charLength = this.charOffset ? 2 : 0;
        return this.charOffset;
    }
    
    _detectIncompleteBase64(buffer) {
    
        this.charOffset = buffer.length % 3;
        this.charLength = this.charOffset ? 3 : 0;
        return this.charOffset;
    }
    
}
