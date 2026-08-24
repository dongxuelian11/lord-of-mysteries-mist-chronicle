const crypto = require("node:crypto");

const NONCE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function contentSecurityPolicyForNonce(nonce) {
  if (typeof nonce !== "string" || !NONCE_PATTERN.test(nonce)) {
    throw new Error("INVALID_CSP_NONCE");
  }
  const nonceSource = `'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self' ${nonceSource}`,
    `style-src 'self' ${nonceSource}`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function createContentSecurityPolicy() {
  const nonce = crypto.randomBytes(16).toString("base64");
  return Object.freeze({
    nonce,
    value: contentSecurityPolicyForNonce(nonce),
  });
}

module.exports = {
  contentSecurityPolicyForNonce,
  createContentSecurityPolicy,
};
