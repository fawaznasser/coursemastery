const test = require("node:test");
const assert = require("node:assert/strict");

const { _test } = require("../courses");

function fixtureCourses(questionCount = 125) {
    return [{
        id: "biology",
        name: "Biology",
        chapters: [{
            id: "chapter-1",
            name: "Chapter 1",
            mcqs: Array.from({ length: questionCount }, (_, index) => ({
                question: `Question ${index}`,
                options: ["A", "B"],
                answerIndex: index % 2,
                difficulty: "easy",
                explanation: `Explanation ${index}`
            }))
        }]
    }];
}

test("guest sample is stable and limited to 100 questions", () => {
    const courses = fixtureCourses();
    const first = _test.getGuestQuestionSample(courses);
    const second = _test.getGuestQuestionSample(courses);

    assert.equal(first.length, 100);
    assert.deepEqual(first.map((question) => question.id), second.map((question) => question.id));
    assert.equal(new Set(first.map((question) => question.id)).size, 100);
});

test("validates MCQ explanations and answer indexes", () => {
    assert.equal(_test.validateMcq({
        question: "Question",
        options: ["A", "B"],
        answerIndex: 0,
        difficulty: "easy",
        explanation: "Because A is correct."
    }), null);

    assert.match(_test.validateMcq({
        question: "Question",
        options: ["A", "B"],
        answerIndex: 4,
        difficulty: "easy"
    }), /out of range/);
});

test("normalizes feedback prompt settings", () => {
    assert.deepEqual(_test.normalizeFeedback({
        enabled: true,
        promptAfterAnswers: 0,
        remindAfterDays: 900,
        title: "Feedback",
        message: "Tell us what you think."
    }), {
        enabled: true,
        promptAfterAnswers: 1,
        remindAfterDays: 365,
        title: "Feedback",
        message: "Tell us what you think."
    });

});

test("validates and normalizes feedback submissions", () => {
    const submission = {
        fullName: "  Jane Student  ",
        email: " Jane@Example.com ",
        rating: 5,
        comment: "  Very useful.  "
    };
    assert.equal(_test.validateFeedbackSubmission(submission), null);
    assert.deepEqual(_test.normalizeFeedbackSubmission(submission), {
        fullName: "Jane Student",
        email: "jane@example.com",
        rating: 5,
        comment: "Very useful."
    });
    assert.match(_test.validateFeedbackSubmission({ ...submission, rating: 0 }), /between 1 and 5/);
    assert.match(_test.validateFeedbackSubmission({ ...submission, email: "invalid" }), /valid email/);
});
