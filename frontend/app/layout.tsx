import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { TopNav } from "@/components/layout/top-nav";
import { ToastProvider } from "@/components/ui/toast";
import { AppMain } from "@/components/motion/app-main";

import "./globals.css";

export const metadata: Metadata = {
  title: "Agency — AI software studio",
  description:
    "Command center for the multi-agent software agency. Projects, your team, runs, deployments.",
};

const themeScript = `(function(){try{var t=localStorage.getItem('agency-theme');if(t==='light'){document.documentElement.classList.add('light')}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-bg font-sans text-text antialiased">
        <Providers>
          <ThemeProvider>
            <ToastProvider>
              <TopNav />
              <AppMain>{children}</AppMain>
            </ToastProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
