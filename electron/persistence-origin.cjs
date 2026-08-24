"use strict";

const crypto = require("node:crypto");

function stablePersistenceOriginId(saveId, branchId) {
  const save = typeof saveId === "string" ? saveId.trim() : "";
  const branch = typeof branchId === "string" ? branchId.trim() : "";
  if (!save || !branch) throw new Error("durable-turn-origin-missing");
  return `origin:v2:${crypto.createHash("sha256").update(JSON.stringify([save, branch]), "utf8").digest("hex")}`;
}

module.exports = { stablePersistenceOriginId };
