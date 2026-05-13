# Cognito Setup (Dev + Production)

## 1) Use two Cognito app clients

- `CourseMasteryFrontendProd` (production)
- `CourseMasteryFrontendDev` (development/local)

Both clients should be **public clients** (no client secret) and have:

- `Allowed OAuth Flows`: `Authorization code grant`
- `Allowed OAuth Scopes`: `openid`, `email`
- `Allowed OAuth Flows User Pool Client`: enabled

## 2) Production client URLs

- Callback URL(s):
  - `https://d14uzenahir9zo.cloudfront.net/index.html`
- Sign out URL(s):
  - `https://d14uzenahir9zo.cloudfront.net/index.html`

## 3) Development client URLs

- Callback URL(s):
  - `http://127.0.0.1:5500/index.html`
  - `http://localhost:5500/index.html`
- Sign out URL(s):
  - `http://127.0.0.1:5500/index.html`
  - `http://localhost:5500/index.html`

## 4) Update frontend config

Edit `frontend/auth-config.js` and set:

- `environments.production.clientId` to your production app client id
- `environments.development.clientId` to your development app client id

The app now uses Authorization Code + PKCE via `/oauth2/authorize` and `/oauth2/token`.

Current values configured:

- Production client id: `61f4japklud36vcei7vrmkg4n5`
- Development client id: `tt1s57jngkiiouukine269fo5`
