import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";

import { resolveServerPort } from "../electron/server-port.cjs";

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("server port keeps a free preferred port", async () => {
  const probe = net.createServer();
  const preferredPort = await listen(probe);
  await close(probe);
  assert.equal(await resolveServerPort(preferredPort), preferredPort);
});

test("server port falls back when the preferred port is occupied", async () => {
  const blocker = net.createServer();
  const occupiedPort = await listen(blocker);
  try {
    const fallbackPort = await resolveServerPort(occupiedPort);
    assert.notEqual(fallbackPort, occupiedPort);
    assert.ok(fallbackPort > 0 && fallbackPort <= 65535);
  } finally {
    await close(blocker);
  }
});
