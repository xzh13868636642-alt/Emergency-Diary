import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = dirname(fileURLToPath(import.meta.url));
const siteUrl = (
  process.env.URL ||
  process.env.DEPLOY_PRIME_URL ||
  "http://localhost:5173"
).replace(/\/$/, "");

writeFileSync(
  join(root, "public", "clientid.jsonld"),
  JSON.stringify(
    {
      "@context": "https://www.w3.org/ns/solid/oidc-context.jsonld",
      client_id: `${siteUrl}/clientid.jsonld`,
      redirect_uris: [
        `${siteUrl}/redirect`,
        `${siteUrl}/`,
        "http://localhost:5173/redirect",
        "http://127.0.0.1:5173/redirect",
      ],
      client_name: "Emergency Diary",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "openid webid offline_access",
      token_endpoint_auth_method: "none",
    },
    null,
    2,
  ),
);

export default defineConfig({
  plugins: [react()],
});

