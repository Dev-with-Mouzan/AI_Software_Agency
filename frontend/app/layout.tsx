import type { Metadata } from "next";

import { Providers } from "@/components/providers";
import { ThemeProvider } from "@/components/theme-provider";
import { SiteNavbar } from "@/components/layout/site-navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import { GlobalChatbot } from "@/components/global-chatbot";
import { GuidedTour } from "@/components/tour/guided-tour";
import { ToastProvider } from "@/components/ui/toast";
import { AppMain } from "@/components/motion/app-main";

import "./globals.css";

export const metadata: Metadata = {
  title: "DevPilot AI — AI software studio",
  description:
    "Command center for the multi-agent software studio. Projects, your team, runs, deployments.",
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
        <div id="top" className="site-atmosphere" aria-hidden />
        <div className="site-grid" aria-hidden />
        <Providers>
          <ThemeProvider>
            <ToastProvider>
              <SiteNavbar />
              <AppMain>{children}</AppMain>
              <SiteFooter />
              <GlobalChatbot />
              <GuidedTour />
            </ToastProvider>
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  );
}
