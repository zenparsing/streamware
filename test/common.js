export async function raceTime(...args) {

    var t = +(new Date);
    await Promise.race(args);
    return +(new Date) - t;
}

export function delay(ms) {

    return new Promise(accept => setTimeout(accept, ms));
}

export async function *mockStream(list) {

    for (let element of list) {

        if (element !== void 0)
            yield element;

        await delay(250);
    }
}
