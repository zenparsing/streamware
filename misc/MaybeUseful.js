export async function *fixedBytes(input, length) {

    let leftover = null;

    for async (let chunk of input) {

        if (leftover) {

            chunk = Buffer.concat(leftover, chunk);
            leftover = null;
        }

        while (chunk.length >= length) {

            yield chunk.slice(0, length);
            chunk = chunk.slice(length);
        }

        leftover = chunk.length > 0 ? chunk : null;
    }

    if (leftover)
        yield leftover;
}


export function mapInput(iter, fn) {

    return wrapIter(iter, {

        next(value) { return iter.next(fn(value)) }
    });
}


export function injectFirst(iter, value) {

    let first = true;

    return wrapIter(iter, {

        next(v) {

            if (first) {

                first = false;
                v = value;
            }

            return iter.next(v);
        }
    });
}


function wrapIter(iter, overrides) {

    let wrap = { [Symbol.asyncIterator]() { return this } };

    Object.keys(overrides).forEach(name => {

        if (name in iter)
            wrap[name] = overrides[name];
    });

    ["next", "throw", "return"].forEach(name => {

        if (!(name in wrap))
            wrap[name] = function() { return iter[name].apply(arguments) };
    });

    return wrap;
}
