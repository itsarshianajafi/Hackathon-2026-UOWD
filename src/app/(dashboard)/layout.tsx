import type { Metadata } from "next";
import "@/dashboard/styles/base.css";
import "@/dashboard/styles/shell.css";
import "@/dashboard/styles/dashboard.css";
import "@/dashboard/styles/sage.css";
import "@/dashboard/styles/pages.css";
import "@/dashboard/styles/mode.css";

export const metadata: Metadata = {
  title: "Estaro AI — Dubai property market",
  description: "Dubai property intelligence dashboard",
};

// Applies the saved theme before first paint, as the original index.html did.
const themeScript = `try { document.documentElement.dataset.theme = localStorage.getItem('sage-theme') || 'light' } catch (e) {}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#f2f4f6" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
