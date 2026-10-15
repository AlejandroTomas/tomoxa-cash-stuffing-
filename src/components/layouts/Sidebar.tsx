"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import LogOutBtn from "@/components/auth/LogOutBtn";
import { useSession } from "@/hooks/useSession";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, Bell, X } from "lucide-react";
import {
  Home,
  Boxes,
  Users,
  FileText,
  Shield,
  ShieldAlert,
  LayoutGrid,
  ListChecks,
  LayoutDashboard,
} from "lucide-react";

const icons = {
  home: Home,
  boxes: Boxes,
  users: Users,
  fileText: FileText,
  shield: Shield,
  shieldAlert: ShieldAlert,
  layoutGrid: LayoutGrid,
  listChecks: ListChecks,
  layoutDashboard: LayoutDashboard,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export type IconName = keyof typeof icons;

export interface NavItem {
  label: string;
  url?: string;
  icon: IconName;
  onPress?: () => void;
}

interface AppLayoutProps {
  children: React.ReactNode;
  items: NavItem[];
  brand: string;
  brandLetter?: string;
  notifications?: number;
}

// ─── Animated label ───────────────────────────────────────────────────────────
const FadeLabel = ({
  collapsed,
  children,
  className,
}: {
  collapsed: boolean;
  children: React.ReactNode;
  className?: string;
}) => (
  <span
    className={cn(
      "overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-in-out",
      collapsed
        ? "max-w-0 opacity-0 pointer-events-none"
        : "max-w-40 opacity-100",
      className,
    )}
  >
    {children}
  </span>
);

// ─── Single nav item ──────────────────────────────────────────────────────────
const NavItem = ({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) => {
  const router = useRouter();
  //   const isActive = !!item.url && router.route === item.url;
  const isActive = false;
  const Icon = icons[item.icon];

  const handleClick = () => {
    item.onPress?.();
    if (item.url) router.push(item.url);
    onNavigate?.();
  };

  const button = (
    <button
      onClick={handleClick}
      aria-label={item.label}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
        "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        isActive
          ? "bg-indigo-50 text-indigo-700 dark:bg-white dark:text-gray-900"
          : "text-sidebar-foreground/60 hover:bg-white/10 hover:text-sidebar-foreground dark:hover:bg-white/8",
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-indigo-500 dark:bg-gray-700" />
      )}
      <Icon
        className={cn(
          "h-4.5 w-4.5 shrink-0",
          isActive
            ? "text-indigo-600 dark:text-gray-800"
            : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground",
        )}
      />
      <FadeLabel collapsed={collapsed}>{item.label}</FadeLabel>
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={10}
          className="text-xs font-medium"
        >
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
};

// ─── Logo mark ────────────────────────────────────────────────────────────────
const LogoMark = ({ letter }: { letter: string }) => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-sm shadow-md select-none">
    {letter}
  </div>
);

// ─── Sidebar inner content (shared between desktop & mobile drawer) ───────────
const SidebarContent = ({
  items,
  brand,
  brandLetter,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  brand: string;
  brandLetter?: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) => {
  const [search, setSearch] = useState("");
  const session = useSession();
  const userName = session?.fullName ?? session?.username ?? "Invitado";
  const letter = brandLetter ?? brand.charAt(0).toUpperCase();

  const filtered = search.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Brand header */}
      <div className="flex items-center border-b border-sidebar-border px-4 py-4 gap-2.5">
        <LogoMark letter={letter} />
        <FadeLabel
          collapsed={collapsed}
          className="text-sm font-semibold text-sidebar-foreground"
        >
          {brand}
        </FadeLabel>
      </div>

      {/* Search */}
      <div className={cn("px-3 py-3", collapsed && "flex justify-center")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="Buscar"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-sidebar-foreground/50 hover:bg-white/10 hover:text-sidebar-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <Search className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10} className="text-xs">
              Buscar
            </TooltipContent>
          </Tooltip>
        ) : (
          <label className="flex items-center gap-2 rounded-xl bg-white/8 dark:bg-white/5 px-3 py-2 ring-1 ring-white/10 focus-within:ring-indigo-500/50 transition-all">
            <Search className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40" />
            <input
              type="search"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none"
            />
          </label>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
        {filtered.map((item) => (
          <NavItem
            key={item.url ?? item.label}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      {/* Bottom: theme + user + logout */}
      <div className="border-t border-sidebar-border px-2 py-3 space-y-1">
        <div className="flex px-1">
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src="" />
            <AvatarFallback className="bg-indigo-500/25 text-white text-[10px] font-bold border border-white/10">
              {userName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div
            className={cn(
              "flex flex-col min-w-0 overflow-hidden transition-[max-width,opacity] duration-300 ease-in-out",
              collapsed
                ? "max-w-0 opacity-0 pointer-events-none"
                : "max-w-30 opacity-100 flex-1",
            )}
          >
            <span className="text-xs font-semibold text-sidebar-foreground truncate leading-tight whitespace-nowrap">
              {userName}
            </span>
            <span className="text-[10px] text-sidebar-foreground/45 truncate capitalize leading-tight mt-0.5 whitespace-nowrap">
              {session?.role?.toLowerCase() ?? ""}
            </span>
          </div>

          <LogOutBtn iconOnly />
        </div>
      </div>
    </div>
  );
};

// ─── Mobile Navbar (top bar shown only on mobile) ─────────────────────────────
const MobileNavbar = ({
  brand,
  brandLetter,
  notifications = 0,
  onMenuOpen,
}: {
  brand: string;
  brandLetter?: string;
  notifications?: number;
  onMenuOpen: () => void;
}) => {
  const letter = brandLetter ?? brand.charAt(0).toUpperCase();

  return (
    <nav
      className="md:hidden sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/80 shadow-sm"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left: hamburger + brand */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuOpen}
            aria-label="Abrir menú"
          >
            {/* Using the LogoMark as a tap target doubles as brand identity */}
            <LogoMark letter={letter} />
          </Button>
          <span className="text-sm font-semibold text-foreground">{brand}</span>
        </div>

        {/* Right: notifications + theme */}
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            disabled={notifications === 0}
            aria-label="Notificaciones"
          >
            <Bell className="h-4 w-4" />
            {notifications > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 text-[10px]">
                {notifications}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </nav>
  );
};

// ─── Main AppLayout ───────────────────────────────────────────────────────────
const AppLayout = ({
  children,
  items,
  brand,
  brandLetter,
  notifications = 0,
}: AppLayoutProps) => {
  const [collapsed, setCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("sb-collapsed") === "true",
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      localStorage.setItem("sb-collapsed", String(!prev));
      return !prev;
    });
  };

  const sharedProps = { items, brand, brandLetter };

  return (
    <TooltipProvider delayDuration={100}>
      <div
        className="flex h-screen overflow-hidden"
        style={{
          height: "100dvh",
          minHeight: "100svh",
        }}
      >
        {/* ── Desktop/Tablet Sidebar (md+) ── */}
        <aside
          className={cn(
            "relative hidden md:flex flex-col h-full shrink-0",
            "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
            "transition-[width] duration-300 ease-in-out",
            collapsed ? "w-16" : "w-60",
          )}
        >
          {/* Toggle pill */}
          <button
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="absolute -right-3 top-6 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronLeft className="h-3 w-3" />
            )}
          </button>

          <SidebarContent {...sharedProps} collapsed={collapsed} />
        </aside>

        {/* ── Main content area ── */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Mobile top navbar */}
          <MobileNavbar
            brand={brand}
            brandLetter={brandLetter}
            notifications={notifications}
            onMenuOpen={() => setMobileOpen(true)}
          />

          {/* Page content */}
          {children}
        </div>

        {/* ── Mobile slide-in drawer ── */}
        {/* Backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden",
            mobileOpen
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none",
          )}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />

        {/* Drawer panel */}
        <aside
          className={cn(
            "fixed left-0 top-0 z-50 flex w-64 flex-col md:hidden",
            "bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
            "transition-transform duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          style={{
            height: "100dvh",
            minHeight: "100svh",
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {/* Close button */}
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
            className="absolute right-3 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-md text-sidebar-foreground/40 hover:bg-white/10 hover:text-sidebar-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          <SidebarContent
            {...sharedProps}
            collapsed={false}
            onNavigate={() => setMobileOpen(false)}
          />
        </aside>
      </div>
    </TooltipProvider>
  );
};

export default AppLayout;
