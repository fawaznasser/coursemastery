module.exports = {
    content: ["./*.html", "./*.js"],
    theme: {
        extend: {
            colors: {
                ink: "#0f172a",
                shell: "#f3f7fb",
                panel: "#ffffff",
                focus: "#0284c7",
                focusdark: "#075985",
                mastery: "#16a34a",
                challenge: "#f59e0b",
                gap: "#e11d48",
                cyanx: "#0891b2",
                bluex: "#2563eb",
                amberx: "#d97706",
                greenx: "#15803d",
                redx: "#b91c1c"
            },
            fontFamily: {
                sans: ["Manrope", "system-ui", "sans-serif"],
                mono: ["IBM Plex Mono", "ui-monospace", "monospace"]
            },
            boxShadow: {
                soft: "0 10px 30px rgba(15, 23, 42, 0.08)",
                card: "0 2px 12px rgba(15, 23, 42, 0.08)"
            }
        }
    },
    plugins: []
};
