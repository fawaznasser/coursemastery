const {
    CognitoIdentityProviderClient,
    DescribeUserPoolClientCommand,
    UpdateUserPoolClientCommand
} = require("@aws-sdk/client-cognito-identity-provider");

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.argv[2];
const appUrl = process.argv[3];

if (!userPoolId || !clientId || !appUrl) {
    console.error("Usage: node scripts/configure-cognito-redirect.js <client-id> <absolute-app-url>");
    process.exit(1);
}

let parsedUrl;
try {
    parsedUrl = new URL(appUrl);
} catch {
    console.error("The app URL must be an absolute URL.");
    process.exit(1);
}

if (parsedUrl.protocol !== "https:") {
    console.error("The production app URL must use HTTPS.");
    process.exit(1);
}

const redirectUrl = new URL("/index.html", parsedUrl.origin).toString();
const client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

// UpdateUserPoolClient resets omitted settings to defaults, so copy every
// writable setting from the current client before changing the URL lists.
const writableSettings = [
    "ClientName",
    "RefreshTokenValidity",
    "AccessTokenValidity",
    "IdTokenValidity",
    "TokenValidityUnits",
    "ReadAttributes",
    "WriteAttributes",
    "ExplicitAuthFlows",
    "SupportedIdentityProviders",
    "DefaultRedirectURI",
    "AllowedOAuthFlows",
    "AllowedOAuthScopes",
    "AllowedOAuthFlowsUserPoolClient",
    "AnalyticsConfiguration",
    "PreventUserExistenceErrors",
    "EnableTokenRevocation",
    "EnablePropagateAdditionalUserContextData",
    "AuthSessionValidity",
    "RefreshTokenRotation"
];

function appendUnique(values, value) {
    return [...new Set([...(values || []), value])];
}

async function describeClient() {
    const response = await client.send(new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId
    }));
    return response.UserPoolClient;
}

async function main() {
    const current = await describeClient();
    const update = {
        UserPoolId: userPoolId,
        ClientId: clientId,
        CallbackURLs: appendUnique(current.CallbackURLs, redirectUrl),
        LogoutURLs: appendUnique(current.LogoutURLs, redirectUrl)
    };

    for (const setting of writableSettings) {
        if (current[setting] !== undefined) {
            update[setting] = current[setting];
        }
    }

    await client.send(new UpdateUserPoolClientCommand(update));
    const verified = await describeClient();

    const callbackConfigured = verified.CallbackURLs?.includes(redirectUrl) === true;
    const logoutConfigured = verified.LogoutURLs?.includes(redirectUrl) === true;

    console.log(JSON.stringify({
        clientId,
        redirectUrl,
        callbackConfigured,
        logoutConfigured,
        allowedOAuthFlows: verified.AllowedOAuthFlows || [],
        allowedOAuthScopes: verified.AllowedOAuthScopes || []
    }, null, 2));

    if (!callbackConfigured || !logoutConfigured) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
});
