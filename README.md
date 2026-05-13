# CourseMastery

Static frontend plus AWS-backed serverless API for course content and user progress.

## Local Run

Prerequisites:

- Node.js
- Python 3
- AWS credentials in `.env`

Start both local services:

```powershell
.\start-dev.ps1
```

Open:

```text
http://127.0.0.1:5500/index.html
```

Stop local services:

```powershell
.\stop-dev.ps1
```

## Local URLs

- Frontend: `http://127.0.0.1:5500/index.html`
- Local API wrapper: `http://127.0.0.1:3001`
- Production app: `https://d14uzenahir9zo.cloudfront.net/index.html`

## Architecture

- `frontend/`: static HTML and browser JavaScript.
- `backend/`: Node.js Lambda handlers and AWS SAM template.
- Cognito Hosted UI handles login.
- API Gateway/Lambda read and write DynamoDB tables.
- `backend/local-api.js` runs the Lambda handlers locally against the AWS DynamoDB tables.
