/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fundo: '#0B0F19',
        card: '#111827',
        borda: '#1F2937',
        bordaHover: '#374151',
        primaria: '#7C6AF7',
        sucesso: '#3ECFB2',
        atencao: '#F59E0B',
        erro: '#EF4444',
        textoPrimario: '#F9FAFB',
        textoSecundario: '#6B7280',
        textoMudo: '#4B5563',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
