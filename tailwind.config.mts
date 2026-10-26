import type { Config } from "tailwindcss";

// Explicit ESM keeps the v4 config loader from guessing the module format.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        night: "var(--night)",
        navy: "var(--navy)",
        aurora: "var(--aurora)",
        stardust: "var(--stardust)",
        moon: "var(--moon)",
        pearl: "var(--pearl)"
      },
      boxShadow: {
        halo: "0 24px 80px rgba(9, 14, 36, 0.55)",
        glow: "0 0 0 1px rgba(255,255,255,0.08), 0 12px 32px rgba(15, 24, 54, 0.45)"
      },
      backgroundImage: {
        "aurora-grid":
          "radial-gradient(circle at top, rgba(157, 229, 255, 0.18), transparent 36%), linear-gradient(135deg, rgba(251, 227, 180, 0.09), transparent 45%)"
      }
    }
  },
  plugins: []
};

export default config;
