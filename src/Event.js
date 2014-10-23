import { sinkSource } from "./Tools.js";


function firstProp(obj, ...names) {

    for (let name of names)
        if (name in obj)
            return name;

    return names[0];
}


export async function *listen(obj, eventName) {

    let add = firstProp(obj, "addEventListener", "addListener"),
        remove = firstProp(obj, "removeEventListener", "removeListener");

    let { sink, source } = sinkSource();

    function push(event) { sink.next(event) }

    obj[add](push);

    try {

        for async (let event of source)
            yield event;

    } finally {

        obj[remove](push);
    }
}

