const {
    DynamoDBClient
} = require("@aws-sdk/client-dynamodb");

const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand
} = require("@aws-sdk/lib-dynamodb");

const { user } = require("./auth");

const ddbClient = new DynamoDBClient({});
const db = DynamoDBDocumentClient.from(ddbClient);
const TABLE = process.env.TABLE;

function cors() {
    return {
        "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Vary": "Origin"
    };
}

function validateProgress(body) {
    const hasProgress = body.completed !== undefined || body.progressPct !== undefined;
    const hasActiveChapter = body.activeChapterId !== undefined;

    if (!hasProgress && !hasActiveChapter) return "No progress update provided";
    if (hasProgress) {
        if (typeof body.completed !== "boolean") return "Invalid completed";
        if (typeof body.progressPct !== "number") return "Invalid progressPct";
        if (body.progressPct < 0 || body.progressPct > 100) return "progressPct must be 0-100";
    }
    if (body.chapterId !== undefined && body.chapterId !== null && typeof body.chapterId !== "string") {
        return "Invalid chapterId";
    }
    if (body.activeChapterId !== undefined && body.activeChapterId !== null && typeof body.activeChapterId !== "string") {
        return "Invalid activeChapterId";
    }
    if (body.understandingPct !== undefined) {
        if (typeof body.understandingPct !== "number" || body.understandingPct < 0 || body.understandingPct > 100) {
            return "understandingPct must be 0-100";
        }
    }
    for (const field of ["answeredCount", "totalQuestions"]) {
        if (body[field] !== undefined && (!Number.isInteger(body[field]) || body[field] < 0)) {
            return `${field} must be a non-negative integer`;
        }
    }
    return null;
}

function progressDetails(body, updatedAt) {
    const details = {
        completed: body.completed,
        progressPct: body.progressPct,
        updatedAt
    };
    if (body.understandingPct !== undefined) details.understandingPct = body.understandingPct;
    if (body.answeredCount !== undefined) details.answeredCount = body.answeredCount;
    if (body.totalQuestions !== undefined) details.totalQuestions = body.totalQuestions;
    return details;
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") {
            return { statusCode: 200, headers: cors(), body: "" };
        }

        const u = user(event);
        const courseId = event.pathParameters?.courseId;

        if (!courseId) {
            return {
                statusCode: 400,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Missing courseId" })
            };
        }

        if (event.httpMethod === "GET") {
            const r = await db.send(new GetCommand({
                TableName: TABLE,
                Key: { userId: u.sub, courseId }
            }));

            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(r.Item || {})
            };
        }

        const body = JSON.parse(event.body || "{}");
        const error = validateProgress(body);
        if (error) {
            return {
                statusCode: 400,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify({ message: error })
            };
        }

        const currentResult = await db.send(new GetCommand({
            TableName: TABLE,
            Key: { userId: u.sub, courseId }
        }));
        const updatedAt = new Date().toISOString();
        const progress = {
            ...(currentResult.Item || {}),
            userId: u.sub,
            courseId,
            updatedAt
        };

        if (body.activeChapterId !== undefined) {
            progress.activeChapterId = body.activeChapterId && body.activeChapterId.trim()
                ? body.activeChapterId.trim()
                : null;
        }

        if (body.completed !== undefined) {
            const details = progressDetails(body, updatedAt);
            const chapterId = typeof body.chapterId === "string" ? body.chapterId.trim() : "";
            if (chapterId) {
                progress.chapterProgress = {
                    ...(progress.chapterProgress || {}),
                    [chapterId]: details
                };
            } else {
                Object.assign(progress, details);
            }
        }

        await db.send(new PutCommand({ TableName: TABLE, Item: progress }));

        return {
            statusCode: 200,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify(progress)
        };
    } catch (err) {
        const statusCode = err === "Unauthorized" ? 401 : 500;
        const message = err === "Unauthorized" ? "Unauthorized" : "Internal server error";
        if (err !== "Unauthorized") console.error("PROGRESS ERROR:", err);

        return {
            statusCode,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        };
    }
};

exports._test = { validateProgress, progressDetails };
