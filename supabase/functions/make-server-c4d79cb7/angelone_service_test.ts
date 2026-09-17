import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { angeloneLogin, angeloneTotp } from "./angelone_service.tsx";

Deno.test("Angel One accepts a current six-digit TOTP code", async () => {
  let sentBody: Record<string, unknown> = {};
  const session = await angeloneLogin({
    apiKey: "trading-api-key",
    clientCode: "a123456",
    password: "1234",
    totp: " 123 456 ",
    proxy: async ({ body }) => {
      sentBody = JSON.parse(body || "{}");
      return {
        status: 200,
        text: JSON.stringify({ status: true, data: { jwtToken: "jwt-token" } }),
        json: { status: true, data: { jwtToken: "jwt-token" } },
      };
    },
  });

  assertEquals(sentBody.clientcode, "A123456");
  assertEquals(sentBody.totp, "123456");
  assertEquals(session.jwtToken, "jwt-token");
});

Deno.test("Angel One generates a six-digit TOTP from a Base32 secret", async () => {
  let sentTotp = "";
  await angeloneLogin({
    apiKey: "trading-api-key",
    clientCode: "A123456",
    password: "1234",
    totpSecret: "JBSW Y3DP-EHPK3PXP",
    proxy: async ({ body }) => {
      sentTotp = String(JSON.parse(body || "{}").totp || "");
      return {
        status: 200,
        text: JSON.stringify({ status: true, data: { jwtToken: "jwt-token" } }),
        json: { status: true, data: { jwtToken: "jwt-token" } },
      };
    },
  });

  assertEquals(/^\d{6}$/.test(sentTotp), true);
  assertEquals((await angeloneTotp("JBSWY3DPEHPK3PXP", 59_000)).length, 6);
});

Deno.test("Angel One rejects malformed TOTP input before calling SmartAPI", async () => {
  await assertRejects(
    () => angeloneLogin({
      apiKey: "trading-api-key",
      clientCode: "A123456",
      password: "1234",
      totp: "12345",
    }),
    Error,
    "6-digit",
  );
});