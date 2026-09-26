/* tests/mail.test.js — letter outbox: save-first, deliver-after */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
for (const f of ["js/storage.js", "js/mail.js"]) {
  (0, eval)(fs.readFileSync(path.join(root, f), "utf8"));
}
const TGL = globalThis.TGL;
const Mail = TGL.Mail;

test("mail: queue saves to outbox before any network call", () => {
  TGL.Storage.reset();
  let fetchCalled = false;
  globalThis.fetch = () => { fetchCalled = true; return Promise.reject(new Error("offline")); };

  const id = Mail.queue("  honest feelings here  ", "Emma");
  assert.ok(id, "queue returns an id");
  assert.strictEqual(Mail.outbox().length, 1);
  const item = Mail.outbox()[0];
  assert.strictEqual(item.text, "honest feelings here", "trimmed on save");
  assert.strictEqual(item.status, "pending");
  assert.strictEqual(item.from, "Emma");
  assert.strictEqual(fetchCalled, false, "queue must never touch the network");

  assert.strictEqual(Mail.queue("   ", ""), null, "empty text is rejected");
  assert.strictEqual(Mail.pending(), 1);
  globalThis.fetch = undefined;
});

test("mail: flush marks sent only on success, keeps pending on failure", async () => {
  TGL.Storage.reset();
  Mail.queue("hello daddy", "");

  // success path
  globalThis.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: "true" })
  });
  let r = await Mail.flush();
  assert.deepStrictEqual(r, { sent: 1, left: 0 });
  assert.strictEqual(Mail.outbox()[0].status, "sent");
  assert.strictEqual(Mail.pending(), 0);

  // failure path — offline
  Mail.queue("second letter", "");
  globalThis.fetch = () => Promise.reject(new Error("net down"));
  r = await Mail.flush();
  assert.strictEqual(r.sent, 0);
  assert.strictEqual(r.left, 1);
  assert.strictEqual(Mail.outbox()[1].status, "pending", "stays queued for retry");
  assert.strictEqual(Mail.pending(), 1);

  // explicit service refusal (success: "false") also stays pending
  Mail.queue("third letter", "");
  globalThis.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: "false" })
  });
  r = await Mail.flush();
  assert.strictEqual(r.sent, 0);
  assert.strictEqual(Mail.outbox()[2].status, "pending");

  globalThis.fetch = undefined;
});
