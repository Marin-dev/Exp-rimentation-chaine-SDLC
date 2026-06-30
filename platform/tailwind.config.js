/** @type {import('tailwindcss').Config} */
import daisyui from "daisyui";

export default {
  content: ["./index.html", "./src/web/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"EYInterstate"', '"Inter"', "system-ui", "sans-serif"]
      },
      colors: {
        ey: {
          yellow: "#FFE600",
          offwhite: "#F6F6FA",
          gray02: "#C4C4CD",
          gray01: "#747480",
          black: "#2E2E38",
          confident: "#1A1A24",
          border: "#D7D7DC"
        }
      }
    }
  },
  plugins: [daisyui],
  daisyui: {
    logs: false,
    themes: [
      {
        ey: {
          primary: "#FFE600",
          "primary-content": "#2E2E38",
          secondary: "#2E2E38",
          "secondary-content": "#FFFFFF",
          accent: "#155EEF",
          "accent-content": "#FFFFFF",
          neutral: "#2E2E38",
          "neutral-content": "#FFFFFF",
          "base-100": "#FFFFFF",
          "base-200": "#F6F6FA",
          "base-300": "#D7D7DC",
          "base-content": "#2E2E38",
          info: "#155EEF",
          success: "#168736",
          warning: "#A15C07",
          error: "#B42318",
          "--rounded-box": "0.5rem",
          "--rounded-btn": "0.375rem",
          "--rounded-badge": "0.375rem",
          "--border-btn": "1px",
          "--tab-radius": "0.375rem"
        }
      }
    ]
  }
};
