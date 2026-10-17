const mode = process.argv[2];
if (mode !== "web" && mode !== "api") throw new Error("Expected web or api");
if (mode === "api" && !["warn", "error"].includes(process.env.LOG_LEVEL ?? "info")) {
  throw new Error("API informational logging must be disabled");
}
if (process.env.NEXTAUTH_DEBUG) throw new Error("NEXTAUTH_DEBUG must be absent or empty");
const webLevel = Number(process.env.NEXT_PUBLIC_LOGGER_LEVEL ?? "4");
if (!Number.isInteger(webLevel) || webLevel < 4 || webLevel > 6) {
  throw new Error("Web logging must be warn, error or fatal");
}
console.log(`${mode} log policy PASS`);
