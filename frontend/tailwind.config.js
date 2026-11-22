/** Every colour is a CSS variable (src/index.css), so the Light/Dark toggle swaps them. */
const v = name => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  // DataTable builds these from a column's `align` value
  safelist: ["text-left", "text-right", "text-center"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        primary: v("primary"),
        "on-primary": v("on-primary"),
        secondary: v("secondary"),
        "secondary-fg": v("secondary-fg"),
        success: v("success"),
        warning: v("warning"),
        danger: v("danger"),
        sev: {
          0: "var(--sev-0)", 1: "var(--sev-1)", 2: "var(--sev-2)", 3: "var(--sev-3)", 4: "var(--sev-4)",
        },
      },
      fontFamily: {
        sans: ["Poppins", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "Consolas", "monospace"],
      },
      maxWidth: { page: "1440px" },
    },
  },
  plugins: [],
};
