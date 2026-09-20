/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4ade80', // A nice green similar to CamScanner
        'primary-dark': '#166534',
        dark: '#121212',
        'dark-paper': '#1e1e1e',
      }
    },
  },
  plugins: [],
}
