import test from "node:test";
import assert from "node:assert/strict";
import { frame, RichPresence, presenceActivity } from "../src/rich-presence.js";

test("presence uses the seep artwork without exposing server names or fake join secrets", () => {
  const activity = presenceActivity(
    { status: "online", server: "Private server", token: "secret" },
    {
      RICH_PRESENCE_LARGE_IMAGE: "seep_background",
      RICH_PRESENCE_SMALL_IMAGE: "seep_logo",
    },
    123000,
  );
  assert.equal(activity.assets.large_image, "seep_background");
  assert.equal(activity.assets.small_image, "seep_logo");
  assert.equal(activity.timestamps.start, 123);
  assert.equal(activity.party, undefined);
  assert.equal(activity.secrets, undefined);
  assert.ok(!JSON.stringify(activity).includes("Private server"));
  assert.throws(
    () =>
      presenceActivity(
        {},
        { RICH_PRESENCE_LARGE_IMAGE: "http://example.com/image.png" },
      ),
    /HTTPS/,
  );
});
test("IPC frames handle partial reads, activity acknowledgment, and clear on stop", () => {
  const sent = [],
    rpc = new RichPresence({
      env: () => ({}),
      state: () => ({ status: "online" }),
    });
  rpc.socket = { write: (x) => sent.push(x), end: () => {} };
  rpc.buffer = Buffer.alloc(0);
  const ready = frame(1, { evt: "READY" });
  rpc.receive(ready.subarray(0, 5));
  assert.equal(sent.length, 0);
  rpc.receive(ready.subarray(5));
  assert.equal(sent[0].readUInt32LE(0), 1);
  const request = JSON.parse(sent[0].subarray(8));
  assert.equal(request.cmd, "SET_ACTIVITY");
  assert.equal(request.args.pid, process.pid);
  rpc.receive(frame(1, { cmd: "SET_ACTIVITY", nonce: request.nonce }));
  assert.equal(rpc.status, "Rich Presence connected");
  rpc.publish();
  assert.equal(sent.length, 1);
  rpc.receive(frame(3, Buffer.from("ping")));
  assert.equal(sent[1].readUInt32LE(0), 4);
  assert.equal(sent[1].subarray(8).toString(), "ping");
  rpc.stop();
  assert.equal(JSON.parse(sent.at(-1).subarray(8)).args.activity, null);
});
