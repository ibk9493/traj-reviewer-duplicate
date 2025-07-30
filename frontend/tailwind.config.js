/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",  // Watch all React component files in src/
    "./public/index.html"          // Optional: include if you're using HTML templates
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1D4ED8',
        secondary: '#9333EA',
      },
    },
  },
  plugins: [],
}
