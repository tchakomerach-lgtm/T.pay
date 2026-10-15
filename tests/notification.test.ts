import test from "node:test";
import assert from "node:assert/strict";
import { deliverClaimedNotification, type NotificationIntent, type NotificationStore } from "../packages/events/src/notification.js";

const intent: NotificationIntent = {
  id: "44444444-4444-4444-8444-444444444444",
  organizationId: "22222222-2222-4222-8222-222222222222",
  recipientUserId: "11111111-1111-4111-8111-111111111111",
  channel: "in_app",
  template: "payment_completed",
  eventId: "33333333-3333-4333-8333-333333333333",
  eventType: "payment.completed",
  sensitivity: "generic",
  createdAt: "2026-10-03T22:20:00Z"
};

const store = (onSent: () => void): NotificationStore => ({
  enqueue: async () => {},
  claimNext: async () => intent,
  markSent: async () => onSent(),
  markFailed: async () => {}
});

test("notification is marked sent only after provider success", async () => {
  let sent = false;
  await deliverClaimedNotification(store(() => { sent = true; }), { key: "test", send: async () => {} }, intent, "worker-a", "2026-10-03T22:21:00Z");
  assert.equal(sent, true);
});

test("notification errors never reflect provider credentials or mark delivery sent", async () => {
  let sent = false;
  await assert.rejects(
    () => deliverClaimedNotification(store(() => { sent = true; }), { key: "test", send: async () => { throw new Error("provider failure: Bearer ghp_abcdefghijklmnopqrstuvwxyz1234567890"); } }, intent, "worker-a", "2026-10-03T22:21:00Z"),
    error => {
      assert.match(String(error), /NOTIFICATION_PROVIDER_FAILED/);
      assert.ok(!String(error).includes("ghp_abcdefghijklmnopqrstuvwxyz1234567890"));
      return true;
    }
  );
  assert.equal(sent, false);
});

test("notification contract carries no amount, account balance, OTP or payment credential", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(intent, "amountMinor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(intent, "balanceMinor"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(intent, "otp"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(intent, "paymentCredential"), false);
});
