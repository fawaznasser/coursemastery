const test = require("node:test");
const assert = require("node:assert/strict");

const { _test } = require("../progress");

test("accepts a complete bounded progress update", () => {
    assert.equal(_test.validateProgress({
        completed: false,
        progressPct: 35,
        chapterId: "chapter-1",
        understandingPct: 70,
        answeredCount: 35,
        totalQuestions: 100
    }), null);
});

test("rejects out-of-range progress values", () => {
    assert.match(_test.validateProgress({ completed: false, progressPct: 101 }), /0-100/);
    assert.match(_test.validateProgress({ completed: false, progressPct: 10, answeredCount: -1 }), /non-negative/);
});
