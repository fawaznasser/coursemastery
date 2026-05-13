module.exports.user = function (event) {
    const claims = event?.requestContext?.authorizer?.claims;
    if (claims && typeof claims === "object") {
        return claims;
    }

    const raw =
        event?.headers?.Authorization ||
        event?.headers?.authorization;

    if (!raw) throw "Unauthorized";

    const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw.trim();
    const parts = token.split(".");
    if (parts.length < 2) throw "Unauthorized";

    try {
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(Buffer.from(padded, "base64").toString());
    } catch {
        throw "Unauthorized";
    }
};

module.exports.admin = function (u) {
    if (!u["cognito:groups"]?.includes("admin")) {
        throw "Forbidden";
    }
};
