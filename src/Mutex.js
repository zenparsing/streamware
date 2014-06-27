export class Condition {

    constructor() {
    
        this.queue = [];
    }
    
    wait() {
    
        // Add a waiter to the queue
        return new Promise(resolve => this.queue.push(resolve));
    }
    
    notify() {
    
        // Release first waiter
        if (this.queue.length > 0)
            this.queue.shift()();
    }
    
    notifyAll() {
    
        // Release all waiters
        for (var i = 0; i < this.queue.length; ++i)
            this.queue[i]();
        
        this.queue.length = 0;
    }
    
}

export class Mutex {

    constructor() {
        
        this.condition = new Condition;
        this.free = true;
    }
    
    async lock(fn) {

        if (!this.free)
            await this.condition.wait();

        this.free = false;
        
        var x;
        
        try { 
        
            x = await fn(); 
        
        } finally { 
        
            if (this.condition.queue.length > 0)
                this.condition.notify();
            else 
                this.free = true;
        }
        
        return x;
    }
}