const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

function run(mode, env) {
  return spawnSync(process.execPath, [path.join(__dirname, "check-log-policy.cjs"), mode], {
    env,
    encoding: "utf8",
  }).status;
}

test("API default/info levels are rejected before credentials are used", () => {
  assert.notEqual(run("api", {}), 0);
  assert.notEqual(run("api", { LOG_LEVEL: "info" }), 0);
});
test("API warn and web warn pass", () => {
  assert.equal(run("api", { LOG_LEVEL: "warn" }), 0);
  assert.equal(run("web", { NEXT_PUBLIC_LOGGER_LEVEL: "4", NEXTAUTH_DEBUG: "" }), 0);
});
test("web debug and informational output are rejected", () => {
  assert.notEqual(run("web", { NEXTAUTH_DEBUG: "true" }), 0);
  assert.notEqual(run("web", { NEXT_PUBLIC_LOGGER_LEVEL: "3" }), 0);
});
