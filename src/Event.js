function promiseCapability() {

    x = {};

    x.promise = new Promise((a, b) => {
        x.resolve = a;
        x.reject = b;
    });

    return x;
}

export async function *observe(start) {

    let next = promiseCapability(),
        done = false;

    let stop = start(
        x => { next.resolve(x); next = promiseCapability(); },
        x => { next.reject(x); },
        x => { next.resolve(x); done = true; });

    if (stop != null && typeof stop !== "function")
        throw new TypeError(stop + " is not a function");

    try {

        while (true) {

            let value = await next.promise;

            if (done) return value;
            else yield value;
        }

    } finally {

        if (stop)
            stop();
    }
}

export function listen(name, options = false) {

    return observe(next => {

        let add = this.addEventListener || this.addListener,
            remove = this.removeEventListener || this.removeListener;

        this::add(name, next, options);
        return _=> this::remove(name, next, options);
    });

}
