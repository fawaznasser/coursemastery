const hostname = window.location.hostname;
const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);

const API_BASE = isLocalHost
    ? `${window.location.protocol}//${hostname}:3001`
    : "https://b3v2z6iqdf.execute-api.eu-central-1.amazonaws.com/Prod";


async function request(path, method = "GET", body) {
    const token = localStorage.getItem("idToken");
    if (!token) throw "Not authenticated";

    const res = await fetch(API_BASE + path, {
        method,
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) throw await res.text();
    return res.json();
}

async function publicRequest(path, method = "GET", body) {
    const res = await fetch(API_BASE + path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw await res.text();
    return res.json();
}

export const API = {
    getGuestQuestions: () => publicRequest("/guest/questions"),
    submitFeedback: (feedback) => publicRequest("/feedback", "POST", feedback),
    getFeedback: () => request("/feedback"),
    deleteFeedback: (id) => request(`/feedback/${encodeURIComponent(id)}`, "DELETE"),
    getCourses: () => request("/courses"),
    getSettings: () => request("/settings"),
    saveSettings: (settings) => request("/settings", "PUT", settings),
    saveCourse: (c) => request("/courses", "POST", c),
    updateCourse: (id, c) => request(`/courses/${encodeURIComponent(id)}`, "PUT", c),
    deleteCourse: (id) => request(`/courses/${encodeURIComponent(id)}`, "DELETE"),
    getCourseChapters: (courseId) => request(`/courses/${encodeURIComponent(courseId)}/chapters`),
    addCourseChapter: (courseId, chapter) => request(`/courses/${encodeURIComponent(courseId)}/chapters`, "POST", chapter),
    updateCourseChapter: (courseId, chapterId, chapter) => request(`/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}`, "PUT", chapter),
    deleteCourseChapter: (courseId, chapterId) => request(`/courses/${encodeURIComponent(courseId)}/chapters/${encodeURIComponent(chapterId)}`, "DELETE"),
    getProgress: (id) => request(`/progress/${id}`),
    saveProgress: (id, d) => request(`/progress/${id}`, "POST", d)
};
