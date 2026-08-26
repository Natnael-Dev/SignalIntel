/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── SignalIntel Design Tokens ──────────────────────────────────
        'si-bg':        '#05080C',   // root background
        'si-panel':     '#0A0F16',   // primary panel background
        'si-panel-2':   '#0D141D',   // secondary panel background
        'si-border':    '#16222E',   // default border
        'si-border-c':  '#1E4E5C',   // cyan-accented border / panel glow
        'si-cyan':      '#29D3E8',   // primary accent
        'si-green':     '#2FE07A',   // positive / online
        'si-red':       '#FF3B47',   // critical / offline
        'si-amber':     '#FFB020',   // elevated / warning
        'si-text':      '#D7E3EE',   // primary text
        'si-muted':     '#64788C',   // secondary text
        'si-dim':       '#2B3A48',   // very dim UI elements
      },
      fontFamily: {
        mono:    ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Rajdhani', 'sans-serif'],
      },
      fontSize: {
        '2xs': '0.625rem',  // 10px
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '4px',
        md: '4px',
      },
      boxShadow: {
        'panel-glow': '0 0 0 1px #1E4E5C, 0 0 12px rgba(41, 211, 232, 0.08)',
        'cyan-glow':  '0 0 8px rgba(41, 211, 232, 0.4)',
        'red-glow':   '0 0 8px rgba(255, 59, 71, 0.3)',
        'green-glow': '0 0 8px rgba(47, 224, 122, 0.3)',
      },
      animation: {
        'audio-bar-1': 'audioBar 0.7s ease-in-out infinite',
        'audio-bar-2': 'audioBar 0.9s ease-in-out infinite 0.1s',
        'audio-bar-3': 'audioBar 0.6s ease-in-out infinite 0.2s',
        'audio-bar-4': 'audioBar 1.1s ease-in-out infinite 0.05s',
        'audio-bar-5': 'audioBar 0.8s ease-in-out infinite 0.15s',
        'pulse-dot':   'pulseDot 2s ease-in-out infinite',
        'scan-line':   'scanLine 4s linear infinite',
        'fade-in-up':  'fadeInUp 0.3s ease-out',
        'ticker-crawl':'tickerCrawl 18s linear infinite',
      },
      keyframes: {
        audioBar: {
          '0%, 100%': { height: '20%' },
          '50%':       { height: '95%' },
        },
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        tickerCrawl: {
          '0%':   { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
}
