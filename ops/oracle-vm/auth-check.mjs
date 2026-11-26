// Sign-in check on the VM: sudo node auth-check.mjs <email> [app-url].
// Run as root (reads /etc/cue-auth/keys.json). No email is sent: the admin API returns
// the one-time code directly. Prints no tokens.
import { readFileSync } from "node:fs";
const k = JSON.parse(readFileSync("/etc/cue-auth/keys.json", "utf8"));
const email = process.argv[2];
const app = process.argv[3] || "https://trycue.space"; // /etc/hosts points it at this VM
const A = "https://trycue.space/auth/v1";
const j = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });

const gen = await j(await fetch("http://127.0.0.1:9999/admin/generate_link", {
  method: "POST",
  headers: { Authorization: `Bearer ${k.service_role_key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email }),
}));
console.log("generate_link", gen.status, gen.body.email_otp ? "otp ok" : JSON.stringify(gen.body).slice(0, 200));
const ver = await j(await fetch(`${A}/verify`, {
  method: "POST",
  headers: { apikey: k.anon_key, Authorization: `Bearer ${k.anon_key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "email", email, token: gen.body.email_otp }),
}));
const s = ver.body;
console.log("verify", ver.status, s.access_token ? `session ok, user ${s.user?.id?.slice(0, 8)}…, alg ${JSON.parse(Buffer.from(s.access_token.split(".")[0], "base64url")).alg}` : JSON.stringify(s).slice(0, 200));
if (!s.access_token) process.exit(1);

// @supabase/ssr cookie: "base64-" + base64url(session JSON), split into 3180-char chunks.
const val = "base64-" + Buffer.from(JSON.stringify(s)).toString("base64url");
const name = "sb-trycue-auth-token";
const parts = val.length <= 3180 ? [[name, val]] : (val.match(/.{1,3180}/g) || []).map((c, i) => [`${name}.${i}`, c]);
const cookie = parts.map(([n, v]) => `${n}=${v}`).join("; ");

for (const path of ["/dashboard", "/calendar", "/settings"]) {
  const r = await fetch(app + path, { headers: { cookie }, redirect: "manual" });
  const html = r.status === 200 ? await r.text() : "";
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
  console.log(path, r.status, r.headers.get("location") || "", title, html.includes(email) ? "(shows the signed-in email)" : "");
}
const noCookie = await fetch(app + "/dashboard", { redirect: "manual" });
console.log("/dashboard without session", noCookie.status, noCookie.headers.get("location"));

const out = await fetch(`${A}/logout`, { method: "POST", headers: { apikey: k.anon_key, Authorization: `Bearer ${s.access_token}` } });
console.log("logout", out.status);
const after = await fetch(`${A}/user`, { headers: { apikey: k.anon_key, Authorization: `Bearer ${s.access_token}` } });
console.log("user after logout (session gone)", after.status);
