import { getDefaultSession } from "@inrupt/solid-client-authn-browser";

export const session = getDefaultSession();

const OIDC_ISSUER = "https://solidcommunity.net";

const REDIRECT_URL = window.location.origin + "/redirect";

export async function initSession() {
  const currentUrl = new URL(window.location.href);
  const hasOAuthParams =
    currentUrl.searchParams.has("code") || currentUrl.searchParams.has("state");

  await session.handleIncomingRedirect({
    url: window.location.href,
    restorePreviousSession: !hasOAuthParams,
  });

  // solidcommunity.net often issues a Bearer token on the first callback;
  // a full reload restores a working DPoP session.
  if (hasOAuthParams && session.info.isLoggedIn) {
    window.location.replace(`${window.location.origin}/`);
    return;
  }

  if (currentUrl.pathname === "/redirect") {
    window.history.replaceState({}, "", "/");
  }
}

export async function login() {
  if (session.info.isLoggedIn) {
    await session.logout();
  }
  await session.login({
    oidcIssuer: OIDC_ISSUER,
    clientName: "Solid Emergency App",
    redirectUrl: REDIRECT_URL,
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
