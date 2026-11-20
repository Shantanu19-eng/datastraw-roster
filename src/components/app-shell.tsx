"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  CalendarDays,
  Users,
  Building2,
  Workflow,
  Network,
  CalendarOff,
  ChartNoAxesCombined,
  TriangleAlert,
  Settings,
  CircleUserRound,
  Search,
  Menu,
} from "lucide-react";
import { useState } from "react";
import type { UserRole } from "@prisma/client";
import { logout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navigation: Array<{ label: string; href: string; icon: typeof LayoutDashboard; count?: number }> = [
  { label: "Overview", href: "/", icon: LayoutDashboard },
  { label: "Roster", href: "/roster", icon: CalendarDays },
  { label: "Employees", href: "/employees", icon: Users },
  { label: "Brands", href: "/brands", icon: Building2 },
  { label: "Processes", href: "/processes", icon: Workflow },
  { label: "Pods", href: "/pods", icon: Network },
  { label: "Leave Management", href: "/leaves", icon: CalendarOff },
  { label: "Coverage Analysis", href: "/coverage", icon: ChartNoAxesCombined },
  { label: "Conflicts", href: "/conflicts", icon: TriangleAlert },
  { label: "My account", href: "/account", icon: CircleUserRound },
  { label: "Settings", href: "/settings", icon: Settings },
];

function visibleNavigation(role: UserRole) {
  if (role === "ADMIN" || role === "OPERATIONS_MANAGER") return navigation;
  if (role === "POD_LEAD") {
    return navigation.filter((item) => ["/roster", "/employees", "/leaves", "/coverage", "/conflicts", "/account"].includes(item.href));
  }
  return navigation.filter((item) => ["/roster", "/leaves", "/account"].includes(item.href));
}

function SidebarContent({ collapsed = false, role }: { collapsed?: boolean; role: UserRole }) {
  const pathname = usePathname();
  const items = visibleNavigation(role);
  return (
    <div className="flex h-full flex-col">
      <div className={`flex h-16 items-center border-b border-[#E5E9F0] ${collapsed ? "justify-center px-2" : "px-5"}`}>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#315EAA] text-sm font-bold text-white">D</div>
        {!collapsed && (
          <div className="ml-3 leading-tight">
            <div className="text-sm font-semibold text-[#172033]">RosterIQ</div>
            <div className="text-[11px] text-[#697586]">DataStraw Operations</div>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`group flex h-9 items-center rounded-md text-[13px] font-medium transition-colors ${
                collapsed ? "justify-center px-2" : "gap-3 px-3"
              } ${active ? "bg-[#EEF4FF] text-[#315EAA]" : "text-[#697586] hover:bg-[#F5F7FA] hover:text-[#172033]"}`}
            >
              <Icon size={16} strokeWidth={1.8} />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.count ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FEECEC] px-1 text-[11px] font-semibold text-[#B42318]">
                  {item.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[#E5E9F0] p-3">
        <button className={`flex h-9 w-full items-center rounded-md text-[#697586] hover:bg-[#F5F7FA] ${collapsed ? "justify-center" : "gap-3 px-3"}`}>
          <CircleHelp size={16} />
          {!collapsed && <span className="text-[13px] font-medium">Help & support</span>}
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children, user }: { children: React.ReactNode; user: { fullName: string; role: UserRole } }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const items = visibleNavigation(user.role);
  const current = items.find((item) => item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const initials = user.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      <aside className={`fixed inset-y-0 left-0 z-30 hidden border-r border-[#E5E9F0] bg-white transition-[width] md:block ${collapsed ? "w-[64px]" : "w-[232px]"}`}>
        <SidebarContent collapsed={collapsed} role={user.role} />
      </aside>
      <div className={`transition-[padding] ${collapsed ? "md:pl-[64px]" : "md:pl-[232px]"}`}>
        <header className="sticky top-0 z-20 flex h-16 items-center border-b border-[#E5E9F0] bg-white/95 px-4 md:px-6">
          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="mr-2 md:hidden"><Menu size={18} /></Button>}
            />
            <SheetContent side="left" className="w-[232px] p-0">
              <SidebarContent role={user.role} />
            </SheetContent>
          </Sheet>
          <button
            onClick={() => setCollapsed((value) => !value)}
            className="mr-3 hidden h-7 w-7 items-center justify-center rounded-md border border-[#E5E9F0] text-[#697586] md:flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
          <div className="min-w-0">
            <div className="text-[11px] text-[#697586]">Workspace / Operations</div>
            <h1 className="truncate text-sm font-semibold text-[#172033]">{current?.label ?? "Overview"}</h1>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <button className="hidden h-8 w-[220px] items-center gap-2 rounded-md border border-[#E5E9F0] px-3 text-left text-xs text-[#697586] lg:flex">
              <Search size={14} /> Search <kbd className="ml-auto rounded border bg-[#F8F9FB] px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
            </button>
            <Button variant="ghost" size="icon" className="relative text-[#697586]">
              <Bell size={17} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#315EAA]" />
            </Button>
            <div className="ml-1 flex items-center gap-2 px-1.5 py-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8EEF8] text-xs font-semibold text-[#315EAA]">{initials}</div>
              <div className="hidden text-left sm:block"><div className="text-xs font-semibold text-[#172033]">{user.fullName}</div><div className="text-[10px] text-[#697586]">{user.role.replaceAll("_", " ")}</div></div>
            </div>
            <form action={logout}><button className="ml-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#697586] hover:bg-[#F5F7FA]">Sign out</button></form>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
