# Production deployment

The supported production architecture is:

- Netlify (or CloudFront/S3) for the static frontend.
- Amazon API Gateway, Cognito, Lambda, and DynamoDB for the backend.
- Docker Compose only for local development. Ports `5500` and `3001` are intentionally bound to `127.0.0.1`.

## 1. Choose the public origin

Use one exact HTTPS origin, for example:

```text
https://learn.example.com
```

Do not include `/index.html` or a trailing slash when supplying `FrontendOrigin` to SAM.

## 2. Configure Cognito

In the Cognito user pool app client used by production, add both of these URLs:

```text
Allowed callback URL: https://learn.example.com/index.html
Allowed sign-out URL: https://learn.example.com/index.html
```

Keep Authorization Code grant and the `openid` and `email` scopes enabled. The frontend derives callback and logout URLs from its current HTTPS origin, so no source-code edit is required for each custom domain.

## 3. Validate and deploy the backend

Install AWS SAM CLI and authenticate to the AWS account, then run:

```powershell
cd backend
cmd /c npm ci
cmd /c npm run check
cmd /c npm test
sam validate --lint --template-file template.yaml
sam build
sam deploy --parameter-overrides "FrontendOrigin=https://learn.example.com CognitoUserPoolArn=arn:aws:cognito-idp:eu-central-1:672626785669:userpool/eu-central-1_fVi49DC6p"
```

Review and approve the CloudFormation change set. The deployment enables DynamoDB point-in-time recovery and deletion protection, retains both tables if the stack is removed, upgrades Lambda to Node.js 24, configures CORS for the supplied origin, and throttles the public guest route.

If this repository's ignored `.env` contains the AWS credentials, run the deployment helper from the repository root instead. It loads the credentials and invokes SAM in the same process without printing secret values:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy-production.ps1
```

## 4. Deploy the frontend with Netlify

Connect the repository to Netlify. `netlify.toml` already defines the publish folder, reproducible Tailwind build, Node.js version, and security headers.

Add the custom domain in Netlify, configure the DNS records it provides, and wait for the TLS certificate to become active before testing Cognito.

For a manual build:

```powershell
cd frontend
cmd /c npm ci
cmd /c npm run build
```

Upload the contents of `frontend/`, including the generated `styles.css`. Do not upload `node_modules`.

## 5. Configure learner feedback

Sign in as an administrator, open **Admin**, and find **Site Settings > Learner Feedback**. Choose when to show the prompt, customize its title and message, enable it, and save.

The native form asks for a required full name, required email address, required 1–5 star rating, and optional comment. The automatic prompt appears after the configured number of answered questions. **Maybe later** snoozes it for the configured number of days, while a successful submission suppresses another automatic prompt for 180 days. The header Feedback button remains available.

Responses are stored in a dedicated, retained Feedback DynamoDB table with point-in-time recovery and deletion protection. They are visible only to authenticated administrators under **Feedback Responses**; non-admin users cannot call the response-listing API. Treat names, email addresses, and comments as personal data and restrict administrator access appropriately.

## 6. Production smoke tests

Replace the example origins and API URL below:

```powershell
$appOrigin = "https://learn.example.com"
$apiBase = "https://YOUR_API_ID.execute-api.eu-central-1.amazonaws.com/Prod"

Invoke-WebRequest "$appOrigin/index.html" -UseBasicParsing
Invoke-RestMethod "$apiBase/guest/questions"
Invoke-WebRequest "$apiBase/courses" -Method Options -Headers @{
  Origin = $appOrigin
  "Access-Control-Request-Method" = "GET"
  "Access-Control-Request-Headers" = "authorization,content-type"
} -UseBasicParsing
```

Confirm that:

- The frontend and stylesheet return `200` over HTTPS.
- Guest mode returns exactly 100 stable questions.
- `/courses` rejects requests without a valid Cognito token.
- A normal user can study but cannot mutate course content.
- An admin can create, edit, and delete course content.
- CSP, HSTS, `X-Content-Type-Options`, and frame-protection headers are present.

## Secrets

Never commit `.env`. Use short-lived AWS credentials or an AWS profile for deployment. Rotate any credential that has been pasted into chat, logs, tickets, or a repository.
