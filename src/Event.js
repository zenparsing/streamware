import { sinkSource } from "./Tools.js";


function firstProp(...names) {

    for (let name of names)
        if (name in this)
            return name;

    return names[0];
}


export async function *listen(eventName) {

    let add = this::firstProp("addEventListener", "addListener"),
        remove = this::firstProp("removeEventListener", "removeListener");

    let { sink, source } = sinkSource();

    function push(event) { sink.next(event) }

    this[add](push);

    try {

        for async (let event of source)
            yield event;

    } finally {

        this[remove](push);
    }
}

