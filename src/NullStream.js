export class NullStream {

    constructor() {
    
        this.ended = false;
    }
    
    async read() {
    
        return null;
    }
    
    async write(buffer) {
    
        if (this.ended)
            throw new Error("Stream closed");
        
        return buffer.length;
    }
    
    async end() {
    
        this.ended = true;
    }
    
}
