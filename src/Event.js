function firstProp(obj, ...names) {

    for (let name of names)
        if (name in obj)
            return name;

    return names[0];
}


export function listen(obj, eventName) {

    let add = firstProp(obj, "addEventListener", "addListener"),
        remove = firstProp(obj, "removeEventListener", "removeListener");

    return readEvents(pushEvent => ({

        start() { obj[add](pushEvent) },
        stop() { obj[remove](pushEvent) },

    }));
}


// TODO:  As the queue approaches its maximum size, we should notify the
// controller.  This will give the controller an opportunity to throttle the
// output rate.  Will the controller have enough information to determine
// the ideal rate?  It should be able to calculate the current consumption
// rate, in principle


export async function *readEvents(init) {

    let nextReady = x => null,
        queue = [];

    function pushEvent(evt) {

        // Maintain max queue length by discarding the oldest event
        if (queue.push(evt) > maxQueueLength)
            queue.shift();

        // Notify generator that event is ready
        nextReady();

        return queue.length;
    }

    let { start, stop, maxQueueLength = 32 } = init(pushEvent);

    start();

    try {

        while (true) {

            // Yield all queued events
            while (queue.length > 0)
                yield queue.shift();

            // Wait for a new event to arrive
            await new Promise(accept => nextReady = accept);
        }

    } finally {

        stop();
    }
}
