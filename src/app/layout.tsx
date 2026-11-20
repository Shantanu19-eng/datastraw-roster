import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getCurrentUser } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RosterIQ | DataStraw",
  description: "Smart workforce and roster management",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const pathname = (await headers()).get("x-rosteriq-pathname") ?? "/";
  const isPublicDemo = pathname === "/demo";
  const user = isPublicDemo ? null : await getCurrentUser();
  if (!isPublicDemo) {
    if (pathname === "/login") {
      if (user) redirect("/");
    } else if (!user) {
      redirect("/login");
    } else if (pathname === "/" && (user.role === UserRole.POD_LEAD || user.role === UserRole.EMPLOYEE)) {
      redirect("/roster");
    }
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <TooltipProvider>
          {pathname === "/login" || isPublicDemo ? children : user ? (
            <AppShell user={{ fullName: user.fullName, role: user.role }}>{children}</AppShell>
          ) : children}
        </TooltipProvider>
      </body>
    </html>
  );
}
