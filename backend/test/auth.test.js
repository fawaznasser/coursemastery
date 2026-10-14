const test = require("node:test");
const assert = require("node:assert/strict");

const { user, admin } = require("../auth");
const { handler: coursesHandler } = require("../courses");

test("user accepts trusted API Gateway claims", () => {
    const claims = { sub: "student-1", "cognito:groups": ["student"] };
    assert.equal(user({ requestContext: { authorizer: { claims } } }), claims);
});

test("user rejects an unverified bearer token", () => {
    const payload = Buffer.from(JSON.stringify({
        sub: "attacker",
        "cognito:groups": ["admin"]
    })).toString("base64url");

    assert.throws(
        () => user({ headers: { Authorization: `Bearer x.${payload}.x` } }),
        (error) => error === "Unauthorized"
    );
});

test("course handler rejects forged tokens before database access", async () => {
    const payload = Buffer.from(JSON.stringify({ sub: "attacker" })).toString("base64url");
    const response = await coursesHandler({
        httpMethod: "GET",
        path: "/courses",
        headers: { Authorization: `Bearer x.${payload}.x` },
        requestContext: {}
    });

    assert.equal(response.statusCode, 401);
});

test("admin access requires the Cognito admin group", () => {
    assert.doesNotThrow(() => admin({ "cognito:groups": ["admin"] }));
    assert.throws(
        () => admin({ "cognito:groups": ["student"] }),
        (error) => error === "Forbidden"
    );
});

test("feedback deletion rejects non-admin users before database access", async () => {
    const response = await coursesHandler({
        httpMethod: "DELETE",
        path: "/feedback/__feedback__%23123%23example",
        pathParameters: { id: "__feedback__#123#example" },
        requestContext: {
            authorizer: { claims: { sub: "student-1", "cognito:groups": ["student"] } }
        }
    });

    assert.equal(response.statusCode, 403);
});

test("feedback deletion rejects invalid ids before database access", async () => {
    const response = await coursesHandler({
        httpMethod: "DELETE",
        path: "/feedback/course-1",
        pathParameters: { id: "course-1" },
        requestContext: {
            authorizer: { claims: { sub: "admin-1", "cognito:groups": ["admin"] } }
        }
    });

    assert.equal(response.statusCode, 400);
});
