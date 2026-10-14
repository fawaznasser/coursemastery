// AWS SDK v3
const {
    DynamoDBClient
} = require("@aws-sdk/client-dynamodb");

const {
    DynamoDBDocumentClient,
    ScanCommand,
    PutCommand,
    GetCommand,
    BatchWriteCommand
} = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("node:crypto");

const { user, admin } = require("./auth");

const ddbClient = new DynamoDBClient({});
const db = DynamoDBDocumentClient.from(ddbClient);
const TABLE = process.env.TABLE;
const FEEDBACK_TABLE = process.env.FEEDBACK_TABLE || TABLE;

function cors() {
    return {
        "Access-Control-Allow-Origin": process.env.ALLOWED_ORIGIN || "*",
        "Access-Control-Allow-Headers": "Authorization,Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Vary": "Origin"
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
    if (mcq.explanation !== undefined && typeof mcq.explanation !== "string") return "MCQ explanation must be text";
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
        if (chapter.reference !== undefined && typeof chapter.reference !== "string") return "Chapter reference must be text";

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

function validateChapter(chapter) {
    if (!chapter || typeof chapter !== "object") return "Invalid chapter";
    if (typeof chapter.name !== "string" || !chapter.name.trim()) return "Chapter name is required";
    if (chapter.reference !== undefined && typeof chapter.reference !== "string") return "Chapter reference must be text";

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

    return null;
}

function normalizeCourse(body) {
    const chapters = (body.chapters || []).map((ch, idx) => ({
        id: ch.id || `ch-${idx + 1}`,
        name: ch.name.trim(),
        reference: typeof ch.reference === "string" ? ch.reference.trim() : "",
        mcqs: (ch.mcqs || []).map(m => ({
            question: m.question.trim(),
            options: m.options.map(o => o.trim()),
            answerIndex: m.answerIndex,
            difficulty: String(m.difficulty || "easy").trim().toLowerCase(),
            explanation: typeof m.explanation === "string" ? m.explanation.trim() : ""
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

const SETTINGS_ID = "__site_settings__";

function defaultSettings() {
    return {
        id: SETTINGS_ID,
        type: "settings",
        ads: {
            hero: {
                enabled: true,
                eyebrow: "Admin Only Ad Placement",
                title: "Hero Banner Slot",
                description: "Use this area for featured promotions without disrupting the learning flow.",
                cta: "Campaign Preview",
                meta: "1200 x 240 recommended"
            },
            sidebar: {
                enabled: true,
                eyebrow: "Admin Only",
                title: "Sidebar Ad Slot",
                description: "Reserved for admin-managed campaigns, announcements, or partner banners.",
                cta: "Preview",
                meta: "Sponsored Placement"
            }
        },
        feedback: {
            enabled: true,
            promptAfterAnswers: 5,
            remindAfterDays: 14,
            title: "Help us improve CourseMastery",
            message: "Would you take a minute to tell us about your experience?"
        },
        updatedAt: null
    };
}

function normalizeAdBlock(block, fallback) {
    return {
        enabled: block?.enabled !== false,
        eyebrow: String(block?.eyebrow || fallback.eyebrow || "").trim(),
        title: String(block?.title || fallback.title || "").trim(),
        description: String(block?.description || fallback.description || "").trim(),
        cta: String(block?.cta || fallback.cta || "").trim(),
        meta: String(block?.meta || fallback.meta || "").trim(),
        imageUrl: typeof block?.imageUrl === "string" ? block.imageUrl.trim() : (fallback.imageUrl || "")
    };
}

function boundedInteger(value, fallback, minimum, maximum) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function normalizeFeedback(feedback, fallback = defaultSettings().feedback) {
    return {
        enabled: feedback?.enabled !== false,
        promptAfterAnswers: boundedInteger(feedback?.promptAfterAnswers, fallback.promptAfterAnswers, 1, 100),
        remindAfterDays: boundedInteger(feedback?.remindAfterDays, fallback.remindAfterDays, 1, 365),
        title: String(feedback?.title || fallback.title).trim().slice(0, 120),
        message: String(feedback?.message || fallback.message).trim().slice(0, 500)
    };
}

function validateFeedbackSubmission(body) {
    if (!body || typeof body !== "object") return "Invalid feedback";
    if (typeof body.fullName !== "string" || !body.fullName.trim()) return "Full name is required";
    if (body.fullName.trim().length > 120) return "Full name is too long";
    if (typeof body.email !== "string" || !body.email.trim()) return "Email is required";
    const email = body.email.trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) return "Rating must be between 1 and 5 stars";
    if (body.comment !== undefined && typeof body.comment !== "string") return "Comment must be text";
    if (String(body.comment || "").trim().length > 2000) return "Comment is too long";
    return null;
}

function normalizeFeedbackSubmission(body) {
    return {
        fullName: body.fullName.trim(),
        email: body.email.trim().toLowerCase(),
        rating: body.rating,
        comment: String(body.comment || "").trim()
    };
}

function normalizeSettings(body) {
    const defaults = defaultSettings();
    return {
        id: SETTINGS_ID,
        type: "settings",
        ads: {
            hero: normalizeAdBlock(body?.ads?.hero, defaults.ads.hero),
            sidebar: normalizeAdBlock(body?.ads?.sidebar, defaults.ads.sidebar)
        },
        feedback: normalizeFeedback(body?.feedback, defaults.feedback),
        updatedAt: new Date().toISOString()
    };
}

function normalizeChapter(chapter, fallbackId) {
    return {
        id: String(chapter.id || fallbackId || "").trim() || `ch-${Date.now()}`,
        name: String(chapter.name || "").trim(),
        reference: typeof chapter.reference === "string" ? chapter.reference.trim() : "",
        mcqs: Array.isArray(chapter.mcqs)
            ? chapter.mcqs.map(m => ({
                question: m.question.trim(),
                options: m.options.map(o => o.trim()),
                answerIndex: m.answerIndex,
                difficulty: String(m.difficulty || "easy").trim().toLowerCase(),
                explanation: typeof m.explanation === "string" ? m.explanation.trim() : ""
            }))
            : [],
        flips: Array.isArray(chapter.flips)
            ? chapter.flips.map(f => ({
                front: f.front.trim(),
                back: f.back.trim()
            }))
            : []
    };
}

async function getCourseById(courseId) {
    const result = await db.send(new GetCommand({
        TableName: TABLE,
        Key: { id: courseId }
    }));
    return result.Item || null;
}

function courseContentId(courseId, kind, childId) {
    return `__course_content__#${encodeURIComponent(courseId)}#${kind}#${encodeURIComponent(String(childId))}`;
}

function courseMetadata(course) {
    const { chapters, ...metadata } = course;
    return { ...metadata, type: "course" };
}

function isLegacyCourse(course) {
    return Array.isArray(course.chapters);
}

async function getAllItems() {
    const items = [];
    let lastEvaluatedKey;
    do {
        const result = await db.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey: lastEvaluatedKey }));
        items.push(...(result.Items || []));
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return items;
}

async function getFeedbackItems() {
    const items = [];
    let lastEvaluatedKey;
    do {
        const result = await db.send(new ScanCommand({
            TableName: FEEDBACK_TABLE,
            ExclusiveStartKey: lastEvaluatedKey
        }));
        items.push(...(result.Items || []));
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return items;
}

function contentItemsForCourse(items, courseId) {
    return items.filter(item => item?.type === "course-content" && item.courseId === courseId);
}

function hydrateCourse(course, items) {
    const content = contentItemsForCourse(items, course.id);
    if (!content.length) return { ...course, chapters: Array.isArray(course.chapters) ? course.chapters : [] };

    const chapters = content
        .filter(item => item.contentType === "chapter")
        .sort((a, b) => a.order - b.order)
        .map(chapter => ({
            id: chapter.chapterId,
            name: chapter.name,
            reference: chapter.reference,
            mcqs: content
                .filter(item => item.contentType === "mcq" && item.chapterId === chapter.chapterId)
                .sort((a, b) => a.order - b.order)
                .map(({ question, options, answerIndex, difficulty, explanation }) => ({
                    question,
                    options,
                    answerIndex,
                    difficulty,
                    explanation: typeof explanation === "string" ? explanation : ""
                })),
            flips: content
                .filter(item => item.contentType === "flip" && item.chapterId === chapter.chapterId)
                .sort((a, b) => a.order - b.order)
                .map(({ front, back }) => ({ front, back }))
        }));
    return { ...course, chapters };
}

function chapterItems(courseId, chapter, chapterOrder) {
    const items = [{
        id: courseContentId(courseId, "chapter", chapter.id),
        type: "course-content",
        contentType: "chapter",
        courseId,
        chapterId: chapter.id,
        name: chapter.name,
        reference: chapter.reference,
        order: chapterOrder
    }];
    chapter.mcqs.forEach((mcq, order) => items.push({
        id: courseContentId(courseId, `mcq-${chapter.id}`, order),
        type: "course-content",
        contentType: "mcq",
        courseId,
        chapterId: chapter.id,
        order,
        ...mcq
    }));
    chapter.flips.forEach((flip, order) => items.push({
        id: courseContentId(courseId, `flip-${chapter.id}`, order),
        type: "course-content",
        contentType: "flip",
        courseId,
        chapterId: chapter.id,
        order,
        ...flip
    }));
    return items;
}

const BATCH_WRITE_SIZE = 25;
const BATCH_WRITE_MAX_RETRIES = 6;

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function batchWrite(requests) {
    for (let offset = 0; offset < requests.length; offset += BATCH_WRITE_SIZE) {
        let pending = requests.slice(offset, offset + BATCH_WRITE_SIZE);

        for (let attempt = 0; pending.length && attempt <= BATCH_WRITE_MAX_RETRIES; attempt += 1) {
            const result = await db.send(new BatchWriteCommand({
                RequestItems: { [TABLE]: pending }
            }));
            pending = result.UnprocessedItems?.[TABLE] || [];

            if (pending.length && attempt < BATCH_WRITE_MAX_RETRIES) {
                await delay(Math.min(1000, 100 * (2 ** attempt)));
            }
        }

        if (pending.length) {
            throw new Error(`DynamoDB left ${pending.length} batch write item(s) unprocessed`);
        }
    }
}

async function replaceCourseContent(courseId, chapters) {
    const existing = contentItemsForCourse(await getAllItems(), courseId);
    const nextItems = chapters.flatMap((chapter, order) => chapterItems(courseId, chapter, order));

    // Put replacement content first so a failed save does not leave the
    // course empty after deleting its previous content.
    await batchWrite(nextItems.map(item => ({ PutRequest: { Item: item } })));

    const nextIds = new Set(nextItems.map(item => item.id));
    const staleItems = existing
        .filter(item => !nextIds.has(item.id))
        .map(item => ({ DeleteRequest: { Key: { id: item.id } } }));
    await batchWrite(staleItems);
}

async function replaceChapterContent(courseId, chapter, chapterOrder) {
    const existing = contentItemsForCourse(await getAllItems(), courseId)
        .filter(item => item.chapterId === chapter.id);
    const nextItems = chapterItems(courseId, chapter, chapterOrder);

    // Put replacement content first so a failed save preserves the old
    // chapter instead of deleting it and then timing out during the writes.
    await batchWrite(nextItems.map(item => ({ PutRequest: { Item: item } })));

    const nextIds = new Set(nextItems.map(item => item.id));
    const staleItems = existing
        .filter(item => !nextIds.has(item.id))
        .map(item => ({ DeleteRequest: { Key: { id: item.id } } }));
    await batchWrite(staleItems);
}

async function getHydratedCourses() {
    const items = await getAllItems();
    return items
        .filter(item => item?.id !== SETTINGS_ID && item?.type !== "course-content" && item?.type !== "feedback")
        .map(course => hydrateCourse(course, items));
}

const GUEST_QUESTION_LIMIT = 100;
const GUEST_CACHE_SECONDS = Math.max(60, Number(process.env.GUEST_CACHE_SECONDS || 300));
let guestQuestionCache = null;

function stableHash(value) {
    let hash = 2166136261;
    for (const char of String(value)) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function getGuestQuestionSample(courses, limit = GUEST_QUESTION_LIMIT) {
    const questions = [];

    for (const course of courses) {
        for (const chapter of course.chapters || []) {
            (chapter.mcqs || []).forEach((mcq, questionIndex) => {
                questions.push({
                    id: `${course.id}:${chapter.id}:${questionIndex}`,
                    courseId: course.id,
                    courseName: course.name,
                    chapterId: chapter.id,
                    chapterName: chapter.name,
                    question: mcq.question,
                    options: [...mcq.options],
                    answerIndex: mcq.answerIndex,
                    difficulty: mcq.difficulty,
                    explanation: mcq.explanation || ""
                });
            });
        }
    }

    questions.sort((left, right) => {
        const hashDifference = stableHash(left.id) - stableHash(right.id);
        return hashDifference || left.id.localeCompare(right.id);
    });

    return questions.slice(0, limit);
}

async function getCachedGuestPayload() {
    const now = Date.now();
    if (guestQuestionCache && guestQuestionCache.expiresAt > now) {
        return guestQuestionCache.payload;
    }

    const questions = getGuestQuestionSample(await getHydratedCourses());
    const storedSettings = await getCourseById(SETTINGS_ID);
    const payload = {
        questions,
        count: questions.length,
        limit: GUEST_QUESTION_LIMIT,
        feedback: normalizeFeedback(storedSettings?.feedback)
    };
    guestQuestionCache = {
        payload,
        expiresAt: now + (GUEST_CACHE_SECONDS * 1000)
    };
    return payload;
}

function getPathname(eventPath = "") {
    return String(eventPath).split("?")[0];
}

function payloadTooLargeResponse(event, err) {
    const pathname = getPathname(event.path);
    const chapterMatch = pathname.match(/\/courses\/([^/]+)\/chapters(?:\/([^/]+))?$/);

    if (pathname === "/settings") {
        return {
            message: "Settings could not be saved because the DynamoDB item is larger than 400 KB.",
            details: "The configured image or ad content is too large. Use a smaller image or store the image at a URL instead of embedding it.",
            code: "SETTINGS_ITEM_TOO_LARGE",
            operation: `${event.httpMethod} ${pathname}`
        };
    }

    if (chapterMatch) {
        const courseId = decodeURIComponent(chapterMatch[1]);
        const chapterId = chapterMatch[2] ? decodeURIComponent(chapterMatch[2]) : null;
        return {
            message: `Chapter${chapterId ? ` "${chapterId}"` : ""} in course "${courseId}" could not be saved because one content item is larger than DynamoDB's 400 KB limit.`,
            details: "MCQs and flip cards are stored separately. Shorten the oversized question, option, answer, reference, or flip-card text.",
            code: "CHAPTER_CONTENT_ITEM_TOO_LARGE",
            operation: `${event.httpMethod} ${pathname}`
        };
    }

    return {
        message: "Course data could not be saved because a DynamoDB item is larger than 400 KB.",
        details: "Course metadata, chapters, MCQs, and flip cards are stored separately. Check for an unusually large course field or individual content item.",
        code: "COURSE_ITEM_TOO_LARGE",
        operation: `${event.httpMethod} ${pathname}`,
        cause: err?.name || "ValidationException"
    };
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") {
            return { statusCode: 200, headers: cors(), body: "" };
        }

        const pathname = getPathname(event.path);

        if (event.httpMethod === "GET" && pathname === "/guest/questions") {
            const payload = await getCachedGuestPayload();
            return {
                statusCode: 200,
                headers: {
                    ...cors(),
                    "Cache-Control": `public, max-age=${GUEST_CACHE_SECONDS}, s-maxage=${GUEST_CACHE_SECONDS}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            };
        }

        if (event.httpMethod === "POST" && pathname === "/feedback") {
            if (String(event.body || "").length > 10_000) {
                return {
                    statusCode: 413,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Feedback submission is too large" })
                };
            }

            let body;
            try {
                body = JSON.parse(event.body || "{}");
            } catch {
                return {
                    statusCode: 400,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Feedback must be valid JSON" })
                };
            }

            const validationError = validateFeedbackSubmission(body);
            if (validationError) {
                return {
                    statusCode: 400,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: validationError })
                };
            }

            const submittedAt = new Date().toISOString();
            const feedback = {
                id: `__feedback__#${Date.now()}#${randomUUID()}`,
                type: "feedback",
                ...normalizeFeedbackSubmission(body),
                submittedAt
            };
            await db.send(new PutCommand({ TableName: FEEDBACK_TABLE, Item: feedback }));

            return {
                statusCode: 201,
                headers: { ...cors(), "Content-Type": "application/json", "Cache-Control": "no-store" },
                body: JSON.stringify({ id: feedback.id, submittedAt })
            };
        }

        const u = user(event);
        const settingsMatch = pathname === "/settings";
        const feedbackMatch = pathname === "/feedback";
        const chapterCollectionMatch = pathname.match(/\/courses\/([^/]+)\/chapters$/);
        const chapterItemMatch = pathname.match(/\/courses\/([^/]+)\/chapters\/([^/]+)$/);

        if (event.httpMethod === "GET" && settingsMatch) {
            const settings = await getCourseById(SETTINGS_ID);
            const responseSettings = settings
                ? { ...settings, feedback: normalizeFeedback(settings.feedback) }
                : defaultSettings();
            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(responseSettings)
            };
        }

        if (event.httpMethod === "GET" && feedbackMatch) {
            admin(u);
            const feedback = (await getFeedbackItems())
                .filter(item => item?.type === "feedback")
                .sort((left, right) => String(right.submittedAt).localeCompare(String(left.submittedAt)))
                .slice(0, 500);
            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json", "Cache-Control": "no-store" },
                body: JSON.stringify(feedback)
            };
        }

        if (event.httpMethod === "GET" && !chapterCollectionMatch && !chapterItemMatch) {
            const items = await getHydratedCourses();

            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(items)
            };
        }

        if (event.httpMethod === "GET" && chapterCollectionMatch) {
            const courseId = decodeURIComponent(chapterCollectionMatch[1]);
            const course = await getCourseById(courseId);
            if (!course) {
                return {
                    statusCode: 404,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Course not found" })
                };
            }
            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(hydrateCourse(course, await getAllItems()).chapters)
            };
        }

        if (event.httpMethod === "GET" && chapterItemMatch) {
            const courseId = decodeURIComponent(chapterItemMatch[1]);
            const chapterId = decodeURIComponent(chapterItemMatch[2]);
            const course = await getCourseById(courseId);
            if (!course) {
                return {
                    statusCode: 404,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Course not found" })
                };
            }
            const chapter = hydrateCourse(course, await getAllItems()).chapters.find(ch => String(ch.id) === chapterId);
            if (!chapter) {
                return {
                    statusCode: 404,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Chapter not found" })
                };
            }
            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(chapter)
            };
        }

        admin(u);
        guestQuestionCache = null;

        if (event.httpMethod === "PUT" && settingsMatch) {
            const body = JSON.parse(event.body || "{}");
            const settings = normalizeSettings(body);
            await db.send(new PutCommand({ TableName: TABLE, Item: settings }));
            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(settings)
            };
        }

        if (event.httpMethod === "POST" && chapterCollectionMatch) {
            const courseId = decodeURIComponent(chapterCollectionMatch[1]);
            const body = JSON.parse(event.body || "{}");
            const error = validateChapter(body);
            if (error) {
                return {
                    statusCode: 400,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: error })
                };
            }

            const course = await getCourseById(courseId);
            if (!course) {
                return {
                    statusCode: 404,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Course not found" })
                };
            }

            const chapters = hydrateCourse(course, await getAllItems()).chapters;
            const chapter = normalizeChapter(body);
            if (chapters.some(ch => String(ch.id) === chapter.id)) {
                return {
                    statusCode: 409,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Chapter id already exists" })
                };
            }
            chapters.push(chapter);

            if (isLegacyCourse(course)) {
                await replaceCourseContent(courseId, chapters);
            } else {
                await replaceChapterContent(courseId, chapter, chapters.length - 1);
            }
            await db.send(new PutCommand({ TableName: TABLE, Item: courseMetadata({ ...course, updatedAt: new Date().toISOString() }) }));

            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(chapter)
            };
        }

        if (event.httpMethod === "PUT" && chapterItemMatch) {
            const courseId = decodeURIComponent(chapterItemMatch[1]);
            const chapterId = decodeURIComponent(chapterItemMatch[2]);
            const body = JSON.parse(event.body || "{}");
            body.id = chapterId;
            const error = validateChapter(body);
            if (error) {
                return {
                    statusCode: 400,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: error })
                };
            }

            const course = await getCourseById(courseId);
            if (!course) {
                return {
                    statusCode: 404,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Course not found" })
                };
            }

            const chapters = hydrateCourse(course, await getAllItems()).chapters;
            const idx = chapters.findIndex(ch => String(ch.id) === chapterId);
            if (idx < 0) {
                return {
                    statusCode: 404,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Chapter not found" })
                };
            }

            const chapter = normalizeChapter(body, chapterId);
            chapters[idx] = chapter;
            if (isLegacyCourse(course)) {
                await replaceCourseContent(courseId, chapters);
            } else {
                await replaceChapterContent(courseId, chapter, idx);
            }
            await db.send(new PutCommand({ TableName: TABLE, Item: courseMetadata({ ...course, updatedAt: new Date().toISOString() }) }));

            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify(chapter)
            };
        }

        if (event.httpMethod === "DELETE" && chapterItemMatch) {
            const courseId = decodeURIComponent(chapterItemMatch[1]);
            const chapterId = decodeURIComponent(chapterItemMatch[2]);
            const course = await getCourseById(courseId);
            if (!course) {
                return {
                    statusCode: 404,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Course not found" })
                };
            }

            const chapters = hydrateCourse(course, await getAllItems()).chapters;
            const nextChapters = chapters.filter(ch => String(ch.id) !== chapterId);
            if (nextChapters.length === chapters.length) {
                return {
                    statusCode: 404,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Chapter not found" })
                };
            }

            if (isLegacyCourse(course)) {
                await replaceCourseContent(courseId, nextChapters);
            } else {
                const existing = contentItemsForCourse(await getAllItems(), courseId)
                    .filter(item => item.chapterId === chapterId);
                await batchWrite(existing.map(item => ({ DeleteRequest: { Key: { id: item.id } } })));
            }
            await db.send(new PutCommand({ TableName: TABLE, Item: courseMetadata({ ...course, updatedAt: new Date().toISOString() }) }));

            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify({ ok: true, id: chapterId })
            };
        }

        if (event.httpMethod === "DELETE") {
            const courseId = event.pathParameters?.id || event.pathParameters?.courseId;
            if (!courseId || !String(courseId).trim()) {
                return {
                    statusCode: 400,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Course id is required" })
                };
            }

            const normalizedCourseId = String(courseId).trim();
            const content = contentItemsForCourse(await getAllItems(), normalizedCourseId);
            await batchWrite([
                { DeleteRequest: { Key: { id: normalizedCourseId } } },
                ...content.map(item => ({ DeleteRequest: { Key: { id: item.id } } }))
            ]);

            return {
                statusCode: 200,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify({ ok: true, id: String(courseId).trim() })
            };
        }

        const body = JSON.parse(event.body || "{}");
        if (event.httpMethod === "PUT") {
            const courseId = event.pathParameters?.id || event.pathParameters?.courseId;
            if (!courseId || !String(courseId).trim()) {
                return {
                    statusCode: 400,
                    headers: { ...cors(), "Content-Type": "application/json" },
                    body: JSON.stringify({ message: "Course id is required" })
                };
            }
            body.id = String(courseId).trim();
        }
        const error = validateCourse(body);
        if (error) {
            return {
                statusCode: 400,
                headers: { ...cors(), "Content-Type": "application/json" },
                body: JSON.stringify({ message: error })
            };
        }

        const course = normalizeCourse(body);
        await replaceCourseContent(course.id, course.chapters);
        await db.send(new PutCommand({ TableName: TABLE, Item: courseMetadata(course) }));

        return {
            statusCode: 200,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify(course)
        };
    } catch (err) {
        const isForbidden = err === "Forbidden";
        const isUnauthorized = err === "Unauthorized";
        const isValidation = err?.name === "ValidationException" || String(err?.message || "").includes("Item size");
        if (!isForbidden && !isUnauthorized) console.error("COURSES ERROR:", err);
        const statusCode = isForbidden ? 403 : isUnauthorized ? 401 : isValidation ? 400 : 500;
        const response = isForbidden
            ? { message: "Forbidden" }
            : isUnauthorized
                ? { message: "Unauthorized" }
                : isValidation
                    ? payloadTooLargeResponse(event, err)
                    : { message: "Internal server error" };

        return {
            statusCode,
            headers: { ...cors(), "Content-Type": "application/json" },
            body: JSON.stringify(response)
        };
    }
};

exports._test = {
    getGuestQuestionSample,
    normalizeFeedback,
    normalizeFeedbackSubmission,
    stableHash,
    validateFeedbackSubmission,
    validateCourse,
    validateChapter,
    validateMcq
};
