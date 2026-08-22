const net = require("node:net");

function validPort(value) {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function probePort(port, host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };
    probe.once("error", (error) => {
      if (error?.code === "EADDRINUSE") finish(resolve, false);
      else finish(reject, error);
    });
    probe.listen(port, host, () => {
      const address = probe.address();
      const actualPort = typeof address === "object" && address ? address.port : 0;
      probe.close((error) => {
        if (error) finish(reject, error);
        else finish(resolve, actualPort || false);
      });
    });
  });
}

async function resolveServerPort(requestedPort, host = "127.0.0.1") {
  const preferred = Number(requestedPort);
  if (validPort(preferred)) {
    const available = await probePort(preferred, host);
    if (available) return preferred;
  }

  const fallback = await probePort(0, host);
  if (!fallback) throw new Error("unable-to-select-server-port");
  return fallback;
}

module.exports = { resolveServerPort };
