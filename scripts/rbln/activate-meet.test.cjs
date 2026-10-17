const assert = require("node:assert/strict");
const test = require("node:test");
const { activateMeet } = require("./activate-meet.cjs");

function fixture(stale = false) {
  const mapping = {
    event_types: Array.from({ length: 5 }, (_, index) => ({
      cal_event_type_id: index + 1,
      cal_slug: `online-${index}`,
      modality: "online",
      meet_pending: true,
    })),
  };
  const records = new Map(
    mapping.event_types.map((row) => [
      `/event-types/${row.cal_event_type_id}`,
      {
        slug: row.cal_slug,
        hidden: true,
        bookingRequiresAuthentication: true,
        locations: [{ type: "attendeeDefined" }],
      },
    ])
  );
  let patches = 0;
  async function api(path, method, body) {
    const record = records.get(path);
    assert.ok(record);
    if (method === "PATCH") {
      patches++;
      if (!stale) Object.assign(record, body);
    }
    return structuredClone(record);
  }
  return { mapping, records, api, patches: () => patches };
}

test("GO preserves IDs and clears meet_pending only after all five readbacks", async () => {
  const f = fixture();
  const result = await activateMeet(f.mapping, f.api);
  assert.equal(f.patches(), 5);
  assert.deepEqual(
    result.event_types.map((row) => row.cal_event_type_id),
    [1, 2, 3, 4, 5]
  );
  assert.ok(result.event_types.every((row) => row.meet_pending === false));
  assert.ok(f.mapping.event_types.every((row) => row.meet_pending === true));
});

test("a successful PATCH with attendeeDefined still present fails the wizard", async () => {
  const f = fixture(true);
  await assert.rejects(activateMeet(f.mapping, f.api), /Meet readback failed/);
  assert.ok(f.mapping.event_types.every((row) => row.meet_pending === true));
});

test("a public online event aborts before any PATCH", async () => {
  const f = fixture();
  f.records.get("/event-types/5").hidden = false;
  await assert.rejects(activateMeet(f.mapping, f.api), /access guards changed/);
  assert.equal(f.patches(), 0);
});
