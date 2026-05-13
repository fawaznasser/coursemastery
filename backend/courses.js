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

function validateMcq(mcq) {
    if (!mcq || typeof mcq !== "object") return "Invalid MCQ";
    if (typeof mcq.question !== "string" || !mcq.question.trim()) return "MCQ question is required";
    if (!Array.isArray(mcq.options) || mcq.options.length < 2) return "MCQ needs at least 2 options";
    const badOption = mcq.options.some(o => typeof o !== "string" || !o.trim());
    if (badOption) return "MCQ options must be non-empty strings";
    if (!Number.isInteger(mcq.answerIndex)) return "MCQ answerIndex must be an integer";
    if (mcq.answerIndex < 0 || mcq.answerIndex >= mcq.options.length) return "MCQ answerIndex out of range";
    if (typeof mcq.difficulty !== "string") return "MCQ difficulty is required";
    const d = mcq.difficulty.trim().toLowerCase();
    if (d !== "easy" && d !== "medium" && d !== "hard") return "MCQ difficulty must be easy, medium, or hard";
    return null;
}

function validateFlip(flip) {
    if (!flip || typeof flip !== "object") return "Invalid flip card";
    if (typeof flip.front !== "string" || !flip.front.trim()) return "Flip card front is required";
    if (typeof flip.back !== "string" || !flip.back.trim()) return "Flip card back is required";
    return null;
}

function validateCourse(body) {
    if (!body || typeof body !== "object") return "Missing body";
    if (typeof body.id !== "string" || !body.id.trim()) return "Invalid id";
    if (typeof body.name !== "string" || !body.name.trim()) return "Invalid name";
    if (typeof body.description !== "string") return "Invalid description";

    if (!Array.isArray(body.chapters)) return "Invalid chapters";

    for (const chapter of body.chapters) {
        if (!chapter || typeof chapter !== "object") return "Invalid chapter";
        if (typeof chapter.name !== "string" || !chapter.name.trim()) return "Chapter name is required";

        if (chapter.mcqs !== undefined) {
            if (!Array.isArray(chapter.mcqs)) return "Invalid chapter MCQs";
            for (const mcq of chapter.mcqs) {
                const err = validateMcq(mcq);
                if (err) return err;
            }
        }

        if (chapter.flips !== undefined) {
            if (!Array.isArray(chapter.flips)) return "Invalid chapter flips";
            for (const flip of chapter.flips) {
                const err = validateFlip(flip);
                if (err) return err;
            }
        }
    }

    return null;
}

function normalizeCourse(body) {
    const chapters = (body.chapters || []).map((ch, idx) => ({
        id: ch.id || `ch-${idx + 1}`,
        name: ch.name.trim(),
        mcqs: (ch.mcqs || []).map(m => ({
            question: m.question.trim(),
            options: m.options.map(o => o.trim()),
            answerIndex: m.answerIndex,
            difficulty: String(m.difficulty || "easy").trim().toLowerCase()
        })),
        flips: (ch.flips || []).map(f => ({
            front: f.front.trim(),
            back: f.back.trim()
        }))
    }));

    return {
        id: body.id.trim(),
        name: body.name.trim(),
        description: body.description,
        chapters,
        updatedAt: new Date().toISOString()
    };
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") {
            return { statusCode: 200, headers: cors(), body: "" };
        }

        const u = user(event);

        if (event.httpMethod === "GET") {
            const items = [];
            let lastEvaluatedKey = undefined;
            do {
                const result = await db.send(new ScanCommand({
                    TableName: TABLE,
                    ExclusiveStartKey: lastEvaluatedKey
                }));
                items.push(...(result.Items || []));
                lastEvaluatedKey = result.LastEvaluatedKey;
            } while (lastEvaluatedKey);

            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(items)
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

        const course = normalizeCourse(body);
        await db.send(new PutCommand({ TableName: TABLE, Item: course }));

        return {
            statusCode: 200,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify(course)
        };
    } catch (err) {
        console.error("COURSES ERROR:", err);

        const statusCode = err === "Forbidden" ? 403 : err === "Unauthorized" ? 401 : 500;
        const message = err === "Forbidden" ? "Forbidden" : err === "Unauthorized" ? "Unauthorized" : "Internal server error";

        return {
            statusCode,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        };
    }
};
