import { pushSource } from "./Tools.js";


function firstProp(obj, ...names) {

    for (let name of names)
        if (name in obj)
            return name;

    return names[0];
}


export function listen(obj, eventName) {

    let add = firstProp(obj, "addEventListener", "addListener"),
        remove = firstProp(obj, "removeEventListener", "removeListener");

    return pushSource(push => ({

        start() { obj[add](push) },
        stop() { obj[remove](push) },

    }));
}

