module FS from "node:fs";
module Path from "node:path";

import { File } from "afs";
import { NodeStream, StringDecoder, Pipe } from "../src/main.js";

export async function main() {

    var stream = new NodeStream(FS.createReadStream(Path.resolve(__dirname, "../../es6now/build/es6now.js")));
    var decoder = new StringDecoder("utf8");

    await Pipe.start(stream, decoder, { end: true });

    console.log("hello");
    console.log(await decoder.read());
}
