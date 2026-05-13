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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    };
}

function validateProgress(body) {
    if (typeof body.completed !== "boolean") return "Invalid completed";
    if (typeof body.progressPct !== "number") return "Invalid progressPct";
    if (body.progressPct < 0 || body.progressPct > 100) {
        return "progressPct must be 0-100";
    }
    return null;
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

        const progress = {
            userId: u.sub,
            courseId,
            completed: body.completed,
            progressPct: body.progressPct,
            updatedAt: new Date().toISOString()
        };

        await db.send(new PutCommand({ TableName: TABLE, Item: progress }));

        return {
            statusCode: 200,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify(progress)
        };
    } catch (err) {
        console.error("PROGRESS ERROR:", err);

        const statusCode = err === "Unauthorized" ? 401 : 500;
        const message = err === "Unauthorized" ? "Unauthorized" : "Internal server error";

        return {
            statusCode,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        };
    }
};
