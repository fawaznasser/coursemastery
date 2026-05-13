// AWS SDK v3
const {
    DynamoDBClient
} = require("@aws-sdk/client-dynamodb");

const {
    DynamoDBDocumentClient,
    ScanCommand,
    PutCommand
} = require("@aws-sdk/lib-dynamodb");

const { user, admin } = require("./auth");

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

function validateCourse(body) {
    if (!body || typeof body !== "object") return "Missing body";
    if (typeof body.id !== "string" || !body.id.trim()) return "Invalid id";
    if (typeof body.name !== "string" || !body.name.trim()) return "Invalid name";
    if (typeof body.description !== "string") return "Invalid description";

    if (body.questions !== undefined) {
        if (!Array.isArray(body.questions)) return "Invalid questions";
        const bad = body.questions.some(q => typeof q !== "string" || !q.trim());
        if (bad) return "Each question must be a non-empty string";
    }

    return null;
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") {
            return { statusCode: 200, headers: cors(), body: "" };
        }

        const u = user(event);

        if (event.httpMethod === "GET") {
            const result = await db.send(new ScanCommand({ TableName: TABLE }));
            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(result.Items || [])
            };
        }

        admin(u);

        const body = JSON.parse(event.body || "{}");
        const error = validateCourse(body);
        if (error) {
            return {
                statusCode: 400,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify({ message: error })
            };
        }

        // Upsert allows admin to both create and edit courses by id.
        const course = {
            id: body.id.trim(),
            name: body.name.trim(),
            description: body.description,
            questions: Array.isArray(body.questions)
                ? body.questions.map(q => q.trim()).filter(Boolean)
                : [],
            updatedAt: new Date().toISOString()
        };

        await db.send(new PutCommand({ TableName: TABLE, Item: course }));

        return {
            statusCode: 200,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify(course)
        };
    } catch (err) {
        console.error("COURSES ERROR:", err);

        let statusCode = 500;
        let message = "Internal server error";

        if (err === "Forbidden") {
            statusCode = 403;
            message = "Forbidden";
        } else if (err === "Unauthorized") {
            statusCode = 401;
            message = "Unauthorized";
        }

        return {
            statusCode,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        };
    }
};
