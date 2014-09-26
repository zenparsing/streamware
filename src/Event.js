function firstProp(obj, ...names) {

    for (let name of names)
        if (name in obj)
            return name;

    return names[0];
}


// TODO:  It would be useful to get a notification when the queue fills
// up, so that we can slow down or pause the data source, if it supports
// that kind of thing.


export function listen(obj, eventName) {

    let add = firstProp(obj, "addEventListener", "addListener"),
        remove = firstProp(obj, "removeEventListener", "removeListener");

    return readEvents(pushEvent => ({

        start() { obj[add](pushEvent) },
        stop() { obj[remove](pushEvent) },

    }));
}


export async function *readEvents(init) {

    const MAX_QUEUE_LENGTH = 32;

    let nextReady = x => null,
        queue = [];

    function pushEvent(evt) {

        // Maintain max queue length by discarding the oldest event
        if (queue.push(evt) > MAX_QUEUE_LENGTH)
            queue.shift();

        // Notify generator that event is ready
        nextReady();
    }

    let { start, stop } = init(pushEvent);

    start();

    while (true) {

        // Yield all queued events
        while (queue.length > 0)
            yield queue.shift();

        // Wait for a new event to arrive
        await new Promise(accept => nextReady = accept);
    }

    stop();
}
