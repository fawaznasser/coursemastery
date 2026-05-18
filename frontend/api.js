const API_BASE =
    window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost"
        ? "http://127.0.0.1:3001"
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

export const API = {
    getCourses: () => request("/courses"),
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
