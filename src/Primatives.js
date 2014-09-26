function gateEntry(map, name) {

    let gate = map.get(name);

    if (!gate) {

        let accept, promise = new Promise(a => accept = a);
        map.set(name, gate = { accept, promise });
    }

    return gate;
}

export class Gate {

    constructor() {

        this.map = new Map;
    }

    wait(name) {

        return gateEntry(this.map, name).promise;
    }

    open(name, value) {

        gateEntry(this.map, name).accept(value);
    }

    close(name) {

        this.map.delete(name);
    }

    release(name, value) {

        let gate = this.map.get(name);

        if (gate) {

            gate.accept(value);
            this.map.delete(name);
        }
    }
}

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
        for (let i = 0; i < this.queue.length; ++i)
            this.queue[i]();

        this.queue.length = 0;
    }

}

export function mutex() {

    let condition = new Condition,
        free = true;

    return async function(fn) {

        if (!free)
            await condition.wait();

        free = false;

        let x;

        try {

            x = await fn();

        } finally {

            if (condition.queue.length > 0)
                condition.notify();
            else
                free = true;
        }

        return x;
    };
}
