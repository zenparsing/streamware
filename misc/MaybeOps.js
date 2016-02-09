
async function* sizer() {

    let input = this;

    return async function*() {

        function getSize(n) {

            if (typeof n !== "number")
                throw new Error("Invalid chunk size");

            size = n;
        }

        let carry = null,
            size;

        getSize(yield null);

        while (true) {

            let result = await input.next(),
                chunk = result.value;

            if (result.done) {

                if (carry)
                    yield carry;

                return;
            }

            if (carry) {

                let needed = size - carry.length;
                carry = Buffer.concat(carry, chunk.slice(0, needed));

                if (chunk.length < needed)
                    continue;

                chunk = chunk.slice(needed);
                getSize(yield carry);
            }

            carry = null;

            while (chunk.length > size) {

                let out = chunk.slice(0, size);
                chunk = chunk.slice(size);
                getSize(yield out);
            }

            if (chunk.size > 0)
                carry = chunk;
        }

    }::prime();
}

async function* chunker(blockSize) {

    let carry = null;

    for await (let chunk of this) {

        if (carry) {

            let needed = blockSize - carry.length;
            carry = Buffer.concat([carry, chunk.slice(0, needed)]);

            if (chunk.length < needed)
                continue;

            chunk = chunk.slice(needed);
            yield carry;
        }

        carry = null;

        while (chunk.length > blockSize) {

            let block = chunk.slice(0, blockSize);
            chunk = chunk.slice(blockSize);
            yield block;
        }

        if (chunk.length > 0)
            carry = chunk;
    }

    if (carry)
        yield carry;
}

function noClose() {

    let iter = this;

    return {
        next(v) { return iter.next(v) },
        [Symbol.asyncIterator]() { return this },
    };
}
