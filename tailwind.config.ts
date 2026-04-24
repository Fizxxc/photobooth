import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7ff',
          100: '#d9ecff',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          950: '#082f49'
        }
      },
      boxShadow: {
        panel: '0 20px 60px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};
export default config;
