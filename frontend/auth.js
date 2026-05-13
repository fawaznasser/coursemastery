import { AUTH_CONFIG, resolveAuthEnvironment } from "./auth-config.js";

const STORAGE = {
    idToken: "idToken",
    accessToken: "accessToken",
    refreshToken: "refreshToken",
    expiresAt: "authExpiresAt",
    codeVerifier: "pkceCodeVerifier",
    oauthState: "oauthState"
};

function getAuthSettings() {
    const env = resolveAuthEnvironment(window.location.origin);
    return {
        cognitoDomain: AUTH_CONFIG.cognitoDomain,
        clientId: env.clientId,
        redirectUri: env.redirectUri,
        logoutUri: env.logoutUri,
        scopes: env.scopes
    };
}

async function createLoginRequestUrl() {
    const cfg = getAuthSettings();
    const verifier = randomBase64Url(64);
    const challenge = await toCodeChallenge(verifier);
    const state = randomBase64Url(24);

    sessionStorage.setItem(STORAGE.codeVerifier, verifier);
    sessionStorage.setItem(STORAGE.oauthState, state);

    const url = new URL(`${cfg.cognitoDomain}/oauth2/authorize`);
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", cfg.scopes.join(" "));
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("state", state);
    return url;
}

function clearAuthStorage() {
    localStorage.removeItem(STORAGE.idToken);
    localStorage.removeItem(STORAGE.accessToken);
    localStorage.removeItem(STORAGE.refreshToken);
    localStorage.removeItem(STORAGE.expiresAt);
    sessionStorage.removeItem(STORAGE.codeVerifier);
    sessionStorage.removeItem(STORAGE.oauthState);
}

function base64Url(bytes) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i];
        const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
        const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
        const triple = (a << 16) | (b << 8) | c;

        out += chars[(triple >> 18) & 63];
        out += chars[(triple >> 12) & 63];
        out += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : "";
        out += i + 2 < bytes.length ? chars[triple & 63] : "";
    }
    return out;
}

function randomBase64Url(byteLen = 64) {
    const bytes = new Uint8Array(byteLen);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
}

async function toCodeChallenge(codeVerifier) {
    const input = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", input);
    return base64Url(new Uint8Array(digest));
}

function decodeTokenPayload(token) {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;

    const base = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base + "=".repeat((4 - (base.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json);
}

function cleanAuthParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    window.history.replaceState({}, document.title, url.toString());
}

function tokenExpired() {
    const expiresAt = Number(localStorage.getItem(STORAGE.expiresAt) || 0);
    if (expiresAt) {
        return Date.now() >= expiresAt;
    }

    const token = localStorage.getItem(STORAGE.idToken);
    if (!token) return true;

    try {
        const payload = decodeTokenPayload(token);
        if (payload?.exp) {
            return Date.now() >= (payload.exp * 1000);
        }
    } catch {
        return true;
    }

    return false;
}

/**
 * Redirect user to Cognito login if not authenticated
 */
export async function requireAuth() {
    const token = localStorage.getItem(STORAGE.idToken);
    if (!token || tokenExpired()) {
        await login();
    }
}

/**
 * Send user to Cognito /oauth2/authorize using Authorization Code + PKCE
 */
export async function login() {
    const url = await createLoginRequestUrl();
    window.location.assign(url.toString());
}

/**
 * Parse and exchange auth code for tokens
 */
export async function parseAuth() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
        clearAuthStorage();
        cleanAuthParams();
        throw new Error(`Cognito auth error: ${error}`);
    }

    // Backward compatibility if implicit grant token exists in hash.
    if (!code && window.location.hash) {
        const hash = new URLSearchParams(window.location.hash.substring(1));
        const idToken = hash.get("id_token");
        if (idToken) {
            localStorage.setItem(STORAGE.idToken, idToken);
            localStorage.removeItem(STORAGE.expiresAt);
        }
        window.location.hash = "";
        return;
    }

    if (!code) return;

    const expectedState = sessionStorage.getItem(STORAGE.oauthState);
    const verifier = sessionStorage.getItem(STORAGE.codeVerifier);

    if (!state || !expectedState || state !== expectedState || !verifier) {
        clearAuthStorage();
        cleanAuthParams();
        throw new Error("Invalid auth state");
    }

    const cfg = getAuthSettings();
    const tokenEndpoint = `${cfg.cognitoDomain}/oauth2/token`;
    const body = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: cfg.clientId,
        code,
        code_verifier: verifier,
        redirect_uri: cfg.redirectUri
    });

    const res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
    });

    if (!res.ok) {
        clearAuthStorage();
        cleanAuthParams();
        throw new Error(`Token exchange failed: ${res.status}`);
    }

    const tokens = await res.json();
    if (!tokens.id_token) {
        clearAuthStorage();
        cleanAuthParams();
        throw new Error("Token exchange returned no id_token");
    }

    localStorage.setItem(STORAGE.idToken, tokens.id_token);
    localStorage.setItem(STORAGE.accessToken, tokens.access_token || "");
    if (tokens.refresh_token) {
        localStorage.setItem(STORAGE.refreshToken, tokens.refresh_token);
    }
    if (typeof tokens.expires_in === "number") {
        localStorage.setItem(STORAGE.expiresAt, String(Date.now() + (tokens.expires_in * 1000)));
    }

    sessionStorage.removeItem(STORAGE.codeVerifier);
    sessionStorage.removeItem(STORAGE.oauthState);
    cleanAuthParams();
}

/**
 * Logout (local + Cognito)
 */
export function logout() {
    const cfg = getAuthSettings();
    clearAuthStorage();

    const url =
        `${cfg.cognitoDomain}/logout` +
        `?client_id=${cfg.clientId}` +
        `&logout_uri=${encodeURIComponent(cfg.logoutUri)}`;

    window.location.replace(url);
}

/**
 * Decode user info from token (optional helper)
 */
export function getUser() {
    const token = localStorage.getItem(STORAGE.idToken);
    if (!token) return null;
    if (tokenExpired()) return null;

    try {
        return decodeTokenPayload(token);
    } catch {
        return null;
    }
}

export function isAdmin() {
    const payload = getUser();
    if (!payload) return false;
    return payload["cognito:groups"]?.includes("admin");
}

export function getAuthDebugInfo() {
    const cfg = getAuthSettings();
    const token = localStorage.getItem(STORAGE.idToken);
    const payload = token ? decodeTokenPayload(token) : null;
    return {
        origin: window.location.origin,
        cognitoDomain: cfg.cognitoDomain,
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        logoutUri: cfg.logoutUri,
        scopes: cfg.scopes,
        hasToken: Boolean(token),
        tokenExpired: token ? tokenExpired() : true,
        tokenSub: payload?.sub || null
    };
}

export async function getLoginDebugUrl() {
    const url = await createLoginRequestUrl();
    return url.toString();
}
