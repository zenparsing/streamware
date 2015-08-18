import { Gate } from "../src/default.js";
import { delay, raceTime } from "./common.js";

export default {

    async "gate.release" (test) {

        let g = new Gate,
            done = g.wait("foo"),
            value = {};

        g.release("foo", value);
        test.assert((await done) === value);

        test.assert(await raceTime(g.wait("foo"), delay(50)) > 50);
    },

    async "gate.open" (test) {

        let g = new Gate,
            done = g.wait("foo"),
            value = {};

        g.open("foo", value);
        test.assert((await done) === value);

        test.assert(await raceTime(g.wait("foo"), delay(50)) < 20);
    }

};
