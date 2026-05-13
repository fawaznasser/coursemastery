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
    getProgress: (id) => request(`/progress/${id}`),
    saveProgress: (id, d) => request(`/progress/${id}`, "POST", d)
};
