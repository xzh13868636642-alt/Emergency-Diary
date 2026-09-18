import { Session } from "@inrupt/solid-client-authn-browser";

export const session = new Session();

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

  if (session.info.isLoggedIn && session.info.webId) {
    try {
      const origin = `${new URL(session.info.webId).origin}/`;
      const probe = await session.fetch(origin, { method: "HEAD" });
      if (probe.status === 401) {
        await session.logout();
      }
    } catch {
      /* keep session if probe fails for network reasons */
    }
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
