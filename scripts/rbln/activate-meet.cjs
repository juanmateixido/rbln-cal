const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const process = require("node:process");

async function activateMeet(mapping, api) {
  const online = mapping.event_types.filter((row) => row.modality === "online");
  if (
    online.length !== 5 ||
    new Set(online.map((row) => row.cal_event_type_id)).size !== 5 ||
    online.some((row) => !Number.isInteger(row.cal_event_type_id))
  )
    throw new Error("Expected five unique online event types");
  for (const row of online) {
    const event = await api(`/event-types/${row.cal_event_type_id}`);
    if (event.slug !== row.cal_slug || !event.hidden || !event.bookingRequiresAuthentication)
      throw new Error("Online event identity or access guards changed");
  }
  for (const row of online) {
    await api(`/event-types/${row.cal_event_type_id}`, "PATCH", {
      locations: [{ type: "integration", integration: "google-meet" }],
    });
  }
  for (const row of online) {
    const event = await api(`/event-types/${row.cal_event_type_id}`);
    const locations = event.locations;
    if (
      !event.hidden ||
      !event.bookingRequiresAuthentication ||
      !Array.isArray(locations) ||
      locations.length !== 1 ||
      locations[0].type !== "integration" ||
      locations[0].integration !== "google-meet"
    )
      throw new Error("Meet readback failed; wizard must not finish");
  }
  return {
    ...mapping,
    event_types: mapping.event_types.map((row) =>
      row.modality === "online" ? { ...row, meet_pending: false } : row
    ),
  };
}

async function main() {
  if (
    process.env.CAL_GO_APPROVED !== "yes" ||
    process.env.SMTP_MODE !== "mailgun" ||
    process.env.NEXT_PUBLIC_WEBAPP_URL !== "https://agenda.rebelion.training" ||
    process.env.CAL_API_URL !== "https://cal-api-production-902f.up.railway.app/v2"
  )
    throw new Error("GO, canonical domain and real SMTP required");
  const path = resolve(__dirname, "../../rbln/evidence/event-types.json");
  const mapping = JSON.parse(readFileSync(path, "utf8"));
  const updated = await activateMeet(mapping, async (endpoint, method = "GET", body) => {
    const response = await fetch(process.env.CAL_API_URL + endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.CAL_API_KEY}`,
        "cal-api-version": "2024-06-14",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("Meet configuration request failed");
    return (await response.json()).data;
  });
  writeFileSync(path, `${JSON.stringify(updated, null, 2)}\n`);
  require("./browser-session.cjs").audit({
    event: "online_meet_verified",
    verified: true,
    count: 5,
    purpose: "GO: five stable online IDs now have Google Meet as their only location",
  });
  console.log("Five online event types verified with Google Meet only; BOOKING_MODE remains off.");
}

module.exports = { activateMeet };
if (require.main === module)
  main().catch(() => {
    console.error("Meet activation failed; wizard must not finish. Details withheld.");
    process.exitCode = 1;
  });
