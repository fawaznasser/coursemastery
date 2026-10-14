module.exports.user = function (event) {
    const claims = event?.requestContext?.authorizer?.claims;
    if (claims && typeof claims === "object" && typeof claims.sub === "string" && claims.sub) {
        return claims;
    }
    throw "Unauthorized";
};

module.exports.admin = function (u) {
    if (!u["cognito:groups"]?.includes("admin")) {
        throw "Forbidden";
    }
};
