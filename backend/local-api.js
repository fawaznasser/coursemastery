const fs = require("fs");
const path = require("path");
const http = require("http");
const { DynamoDBClient, ListTablesCommand } = require("@aws-sdk/client-dynamodb");

function loadDotEnv(envPath) {
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        const value = trimmed.slice(eq + 1).trim();
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

function guessTables(names) {
    const courses = names.find((n) => n.includes("CoursesTable"));
    const progress = names.find((n) => n.includes("ProgressTable"));
    return { courses, progress };
}

function loadHandler(moduleName, tableName) {
    process.env.TABLE = tableName;
    const fullPath = path.join(__dirname, moduleName);
    delete require.cache[require.resolve(fullPath)];
    return require(fullPath).handler;
}

function toEvent(req, body, routeMatch) {
    return {
        httpMethod: req.method,
        path: req.url,
        headers: req.headers || {},
        body: body.length ? body : null,
        pathParameters: routeMatch ? { courseId: decodeURIComponent(routeMatch[1]) } : null,
        requestContext: {}
    };
}

async function main() {
    loadDotEnv(path.join(__dirname, "..", ".env"));
    process.env.AWS_REGION = process.env.AWS_REGION || "eu-central-1";

    let guessed = {};
    if (!process.env.COURSES_TABLE || !process.env.PROGRESS_TABLE) {
        const db = new DynamoDBClient({ region: process.env.AWS_REGION });
        const listed = await db.send(new ListTablesCommand({}));
        guessed = guessTables(listed.TableNames || []);
    }

    const coursesTable = process.env.COURSES_TABLE || guessed.courses;
    const progressTable = process.env.PROGRESS_TABLE || guessed.progress;

    if (!coursesTable || !progressTable) {
        throw new Error("Could not resolve DynamoDB tables. Set COURSES_TABLE and PROGRESS_TABLE in .env");
    }

    const port = Number(process.env.LOCAL_API_PORT || 3001);

    const server = http.createServer(async (req, res) => {
        try {
            const body = await new Promise((resolve, reject) => {
                let data = "";
                req.on("data", (chunk) => {
                    data += chunk;
                });
                req.on("end", () => resolve(data));
                req.on("error", reject);
            });

            const pathname = new URL(req.url, "http://localhost").pathname;
            const progressMatch = pathname.match(/^\/progress\/([^/]+)$/);

            let handler;
            if (pathname === "/courses") {
                handler = loadHandler("courses.js", coursesTable);
            } else if (progressMatch) {
                handler = loadHandler("progress.js", progressTable);
            } else {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ message: "Not found" }));
                return;
            }

            const event = toEvent(req, body, progressMatch);
            const result = await handler(event);

            res.writeHead(result.statusCode || 200, result.headers || {});
            res.end(result.body || "");
        } catch (err) {
            console.error("LOCAL API ERROR:", err);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Internal server error" }));
        }
    });

    server.listen(port, "127.0.0.1", () => {
        console.log(`Local backend running: http://127.0.0.1:${port}`);
        console.log(`Courses table: ${coursesTable}`);
        console.log(`Progress table: ${progressTable}`);
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
