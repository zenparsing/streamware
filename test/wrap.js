module FS from "node:fs";

import { NodeStream } from "../src/NodeStream.js";

export async function main() {

    var stream = FS.createWriteStream(__dirname + "/_temp.txt");
    var wrapped = new NodeStream(stream);
    
    await wrapped.write(new Buffer("hello world"));
    await wrapped.end();
    
    stream = FS.createReadStream(__dirname + "/_temp.txt");
    wrapped = new NodeStream(stream);
    
    console.log((await wrapped.read(new Buffer(1024))).toString("utf8"));
}