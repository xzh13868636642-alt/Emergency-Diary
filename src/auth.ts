import { getDefaultSession } from "@inrupt/solid-client-authn-browser";

export const session = getDefaultSession();

const OIDC_ISSUER = "https://solidcommunity.net";

export async function initSession() {
  await session.handleIncomingRedirect({
    url: window.location.href,
    restorePreviousSession: true,
  });

  if (new URL(window.location.href).pathname === "/redirect") {
    window.history.replaceState({}, "", "/");
  }
}

export async function login() {
  const origin = window.location.origin;
  await session.login({
    oidcIssuer: OIDC_ISSUER,
    clientId: `${origin}/clientid.jsonld`,
    clientName: "Emergency Diary",
    redirectUrl: `${origin}/redirect`,
    tokenType: "DPoP",
  });
}

export function logout() {
  return session.logout();
}

export function isLoggedIn() {
  return session.info.isLoggedIn === true;
}

export function getWebId() {
  return session.info.webId ?? null;
}

export const solidFetch: typeof fetch = (input, init) =>
  session.fetch(input, init);
