import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { ToastProvider }   from '@/components/ui/Toast';
import { ThemeProvider }   from '@/components/shell/ThemeProvider';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-day-picker/style.css';
import './globals.css';

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
  weight:   ['400', '500', '600', '700'],
});

const jakarta = Plus_Jakarta_Sans({
  subsets:  ['latin'],
  variable: '--font-plus-jakarta-sans',
  display:  'swap',
  weight:   ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title:       'HRMS Pro — Enterprise Workforce Operating System',
  description: 'Multi-tenant B2B SaaS HRMS with zero-trust security, encrypted compensation, and agentic payroll auditing.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      {/*
        Anti-flash script: runs synchronously before first paint.
        Reads localStorage / system preference and adds class="dark"
        to <html> before React hydrates, eliminating the white flash.
      */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('hrms-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: 'var(--color-background)',
          color: 'var(--color-foreground)',
          fontFamily: 'var(--font-in-rg)',
        }}
      >
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
