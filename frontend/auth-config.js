export const AUTH_CONFIG = {
    cognitoDomain: "https://eu-central-1fvi49dc6p.auth.eu-central-1.amazoncognito.com",
    environments: {
        production: {
            origins: ["https://d14uzenahir9zo.cloudfront.net"],
            clientId: "61f4japklud36vcei7vrmkg4n5",
            redirectUri: "https://d14uzenahir9zo.cloudfront.net/index.html",
            logoutUri: "https://d14uzenahir9zo.cloudfront.net/index.html",
            scopes: ["openid", "email"]
        },
        development: {
            origins: ["http://127.0.0.1:5500", "http://localhost:5500"],
            clientId: "tt1s57jngkiiouukine269fo5",
            redirectUri: "http://127.0.0.1:5500/index.html",
            logoutUri: "http://127.0.0.1:5500/index.html",
            scopes: ["openid", "email"]
        }
    },
    defaultEnvironment: "production"
};

export function resolveAuthEnvironment(origin = window.location.origin) {
    const envEntries = Object.entries(AUTH_CONFIG.environments);
    const match = envEntries.find(([, cfg]) => cfg.origins.includes(origin));
    if (match) {
        return { name: match[0], ...match[1] };
    }

    const fallback = AUTH_CONFIG.environments[AUTH_CONFIG.defaultEnvironment];
    return { name: AUTH_CONFIG.defaultEnvironment, ...fallback };
}
