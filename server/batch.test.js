import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBatch, MAX_CELLS } from "./batch.js";

const HEX = "871e30d52ffffff";

test("accepts whole hexes and triangle paths", () => {
  assert.deepEqual(parseBatch(JSON.stringify({ visits: { [HEX]: 2, [`${HEX}-3`]: 1, [`${HEX}-312`]: 5 } })), {
    cells: [HEX, `${HEX}-3`, `${HEX}-312`],
    counts: [2, 1, 5],
  });
});

test("rejects malformed input", () => {
  for (const body of [
    "not json",
    "null",
    "[]",
    JSON.stringify({}),
    JSON.stringify({ visits: [] }),
    JSON.stringify({ visits: {} }),
    JSON.stringify({ visits: { [HEX]: 0 } }),
    JSON.stringify({ visits: { [HEX]: -1 } }),
    JSON.stringify({ visits: { [HEX]: 1.5 } }),
    JSON.stringify({ visits: { [HEX]: "1" } }),
    JSON.stringify({ visits: { [HEX]: 101 } }),
    JSON.stringify({ visits: { "abc": 1 } }),
    JSON.stringify({ visits: { [`${HEX}-3123`]: 1 } }),
    JSON.stringify({ visits: { [`${HEX}-34`]: 1 } }),
    JSON.stringify({ visits: { [`${HEX.toUpperCase()}`]: 1 } }),
    JSON.stringify({ visits: { "'; DROP TABLE hex_visits; --": 1 } }),
  ]) {
    assert.equal(parseBatch(body), null, body);
  }
});

test("rejects too many cells", () => {
  const visits = {};
  for (let i = 0; i <= MAX_CELLS; i++) visits[`87${i.toString(16).padStart(13, "0")}`] = 1;
  assert.equal(parseBatch(JSON.stringify({ visits })), null);
});
