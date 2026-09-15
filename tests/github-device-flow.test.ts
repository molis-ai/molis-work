import assert from "node:assert/strict";
import test from "node:test";
import { createGithubDeviceFlow } from "@molis-ai/molis-work-integration-github";

test("GitHub device authorization persists the selected client and binds only an authorized token", async () => {
  let storedClient = "old-client";
  const bound: string[] = [];
  const flow = createGithubDeviceFlow({
    clientId: () => storedClient,
    storeClientId: (value) => { storedClient = value; },
    bindToken: (value) => { bound.push(value); },
  });
  const started = await flow.startGithubDeviceFlow({
    clientId: " new-client ",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://github.com/login/device/code");
      assert.equal(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("client_id"), "new-client");
      assert.equal(body.get("scope"), "notifications read:user");
      return Response.json({ device_code: "device-1", user_code: "ABCD", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 8 });
    },
  });
  assert.equal(storedClient, "new-client");
  assert.deepEqual(started, { deviceCode: "device-1", userCode: "ABCD", verificationUri: "https://github.com/login/device", expiresIn: 900, interval: 8 });
  for (const [error, status] of [["authorization_pending", "pending"], ["slow_down", "slow_down"], ["expired_token", "expired"], ["access_denied", "denied"], ["unknown", "error"]]) {
    const result = await flow.pollGithubDeviceFlow({ deviceCode: started.deviceCode, fetchImpl: async () => Response.json({ error, error_description: "safe provider status" }) });
    assert.deepEqual(result, { status, message: "safe provider status" });
    assert.deepEqual(bound, []);
  }
  const authorized = await flow.pollGithubDeviceFlow({
    deviceCode: started.deviceCode,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://github.com/login/oauth/access_token");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("client_id"), "new-client", "poll consumes the client persisted at start");
      assert.equal(body.get("device_code"), "device-1");
      assert.equal(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:device_code");
      return Response.json({ access_token: "fixture-device-token" });
    },
  });
  assert.deepEqual(authorized, { status: "authorized", accessToken: "fixture-device-token" });
  assert.deepEqual(bound, ["fixture-device-token"]);
});

test("GitHub authorization without a configured client does not request or bind credentials", async () => {
  const flow = createGithubDeviceFlow({ clientId: () => null, storeClientId: () => assert.fail("unexpected client write"), bindToken: () => assert.fail("unexpected credential write") });
  const fetchImpl = async (): Promise<Response> => assert.fail("unexpected network request");
  await assert.rejects(flow.startGithubDeviceFlow({ fetchImpl }), /MOLIS_WORK_GITHUB_CLIENT_ID required/);
  assert.deepEqual(await flow.pollGithubDeviceFlow({ deviceCode: "device-1", fetchImpl }), { status: "error", message: "Missing GitHub client id" });
});
