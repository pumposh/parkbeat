/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Bree Serif', 'ui-serif', 'Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
      },
      backgroundColor: {
        background: "var(--background)",
      },
      textColor: {
        foreground: "var(--foreground)",
      },
      keyframes: {
        bulge: {
          '0%': { 
            transform: 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'
          },
          '33%': { 
            transform: 'matrix3d(0.99619, 0.08715, 0, 0.004, -0.08715, 0.99619, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'
          },
          '66%': { 
            transform: 'matrix3d(0.99619, -0.08715, 0, -0.004, 0.08715, 0.99619, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'
          },
          '100%': { 
            transform: 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'
          }
        }
      },
      animation: {
        bulge: 'bulge 2s cubic-bezier(0.4, 0, 0.2, 1) infinite'
      }
    },
  },
  plugins: [],
}

