"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useAdminStats } from "@/hooks/useAdminStats";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Building2,
  User,
  LogOut,
  Search,
  FileText,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  BarChart3,
  ClipboardCheck,
  ShieldCheck,
  UserCog,
  UserPlus,
  Tags,
  SlidersHorizontal,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { VerificationStatusIndicator } from "@/components/layout/VerificationStatusIndicator";


interface SidenavProps {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  hideForPending: boolean;
  badgeKey?: "pendingApprovalsTotal" | "pendingVerificationTotal";
}

const mainNavItems: NavigationItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    hideForPending: true,
  },
  {
    name: "Tenders",
    href: "/tenders",
    icon: FileText,
    hideForPending: false,
  },
  {
    name: "Company Directory",
    href: "/directory",
    icon: Search,
    hideForPending: false,
  },
  {
    name: "Projects",
    href: "/projects",
    icon: FolderKanban,
    hideForPending: true,
  },
  {
    name: "My Company",
    href: "/my-company",
    icon: Building2,
    hideForPending: true,
  },
  {
    name: "Profile",
    href: "/profile",
    icon: User,
    hideForPending: true,
  },
];

interface AdminNavGroup {
  items: NavigationItem[];
}

const adminNavGroups: AdminNavGroup[] = [
  {
    items: [
      { name: "Overview", href: "/admin/overview", icon: BarChart3, hideForPending: true },
      { name: "Approvals", href: "/admin/approvals", icon: ClipboardCheck, hideForPending: true, badgeKey: "pendingApprovalsTotal" },
      { name: "Verification", href: "/admin/verification", icon: ShieldCheck, hideForPending: true, badgeKey: "pendingVerificationTotal" },
    ],
  },
  {
    items: [
      { name: "Companies", href: "/admin/companies", icon: Building2, hideForPending: true },
      { name: "Users", href: "/admin/users", icon: UserCog, hideForPending: true },
      { name: "Tenders", href: "/admin/tenders", icon: FileText, hideForPending: true },
      { name: "Onboarding", href: "/admin/onboarding", icon: UserPlus, hideForPending: true },
    ],
  },
  {
    items: [
      { name: "Taxonomy", href: "/admin/taxonomy", icon: Tags, hideForPending: true },
      { name: "Settings", href: "/admin/settings", icon: SlidersHorizontal, hideForPending: true },
      { name: "Demo Sync", href: "/admin/demo-sync", icon: FlaskConical, hideForPending: true },
    ],
  },
];

type AdminStatsData = {
  pendingApprovalsTotal: number;
  pendingVerificationTotal: number;
};

interface SidebarContentProps {
  isMobile?: boolean;
  isCollapsed: boolean;
  isRestrictedUser: boolean;
  isAdmin: boolean;
  adminStats?: AdminStatsData;
  toggleCollapsed: () => void;
  filteredMainNavItems: NavigationItem[];
  isActiveRoute: (href: string) => boolean;
  handleNavClick: () => void;
  handleSignOut: () => void;
  userDisplayName: string;
  userEmail: string;
  userInitials: string;
}

function NavItem({
  item,
  isActive,
  isCollapsed,
  isMobile,
  badgeCount,
  onClick,
}: {
  item: NavigationItem;
  isActive: boolean;
  isCollapsed: boolean;
  isMobile: boolean;
  badgeCount?: number;
  onClick: () => void;
}) {
  const showBadge = badgeCount !== undefined && badgeCount > 0;

  const NavButton = (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      className={cn(
        "w-full justify-start relative",
        isCollapsed && !isMobile && "justify-center px-2",
      )}
      asChild
    >
      <Link href={item.href} onClick={onClick}>
        <div className="relative flex-shrink-0">
          <item.icon
            className={cn(
              "h-4 w-4",
              (!isCollapsed || isMobile) && "mr-3",
            )}
          />
          {showBadge && isCollapsed && !isMobile && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-destructive rounded-full" />
          )}
        </div>
        {(!isCollapsed || isMobile) && (
          <>
            <span className="truncate flex-1">{item.name}</span>
            {showBadge && (
              <span className="ml-auto flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-xs font-medium flex items-center justify-center">
                {badgeCount}
              </span>
            )}
          </>
        )}
      </Link>
    </Button>
  );

  if (isCollapsed && !isMobile) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{NavButton}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>
          {item.name}
          {showBadge && ` (${badgeCount})`}
        </TooltipContent>
      </Tooltip>
    );
  }

  return <div>{NavButton}</div>;
}

function SidebarContent({
  isMobile = false,
  isCollapsed,
  isRestrictedUser,
  isAdmin,
  adminStats,
  toggleCollapsed,
  filteredMainNavItems,
  isActiveRoute,
  handleNavClick,
  handleSignOut,
  userDisplayName,
  userEmail,
  userInitials,
}: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Logo section */}
      <div
        className={cn(
          "flex items-center h-16 px-4 border-b border-border",
          isCollapsed && !isMobile ? "justify-center" : "justify-between",
        )}
      >
        <Link
          href="/"
          className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
          onClick={handleNavClick}
        >
          <div className="w-8 h-8 gradient-hero rounded-lg flex items-center justify-center flex-shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          {(!isCollapsed || isMobile) && (
            <div className="overflow-hidden">
              <h1 className="text-lg font-bold text-primary leading-tight">
                TNDRX
              </h1>
            </div>
          )}
        </Link>
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            className={cn(
              "h-8 w-8 flex-shrink-0",
              isCollapsed && "absolute -right-3 bg-background border shadow-sm",
            )}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Org Switcher — hidden for onboarding/pending-approval users and super admins */}
      {!isRestrictedUser && !isAdmin && (
        <>
          <OrgSwitcher isCollapsed={isCollapsed && !isMobile} isMobile={isMobile} />
          <VerificationStatusIndicator isCollapsed={isCollapsed && !isMobile} isMobile={isMobile} />
        </>
      )}

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          <TooltipProvider delayDuration={0}>
            {/* Admin Section — shown first for super admins */}
            {isAdmin && (
              <>
                {(!isCollapsed || isMobile) && (
                  <div className="px-3 py-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Admin
                    </span>
                  </div>
                )}

                {adminNavGroups.map((group, groupIndex) => (
                  <div key={groupIndex}>
                    {groupIndex > 0 && (
                      <div className={cn("py-1", isCollapsed && !isMobile && "py-0.5")}>
                        {(!isCollapsed || isMobile) ? (
                          <Separator className="opacity-50" />
                        ) : (
                          <div className="mx-auto w-4 border-t border-border/50" />
                        )}
                      </div>
                    )}
                    {group.items.map((item) => {
                      const badgeCount = item.badgeKey && adminStats
                        ? adminStats[item.badgeKey]
                        : undefined;
                      return (
                        <NavItem
                          key={item.href}
                          item={item}
                          isActive={isActiveRoute(item.href)}
                          isCollapsed={isCollapsed}
                          isMobile={isMobile}
                          badgeCount={badgeCount}
                          onClick={handleNavClick}
                        />
                      );
                    })}
                  </div>
                ))}

                <div className="pt-3 pb-1">
                  <Separator />
                </div>
              </>
            )}

            {/* Main Navigation */}
            {filteredMainNavItems.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                isActive={isActiveRoute(item.href)}
                isCollapsed={isCollapsed}
                isMobile={isMobile}
                onClick={handleNavClick}
              />
            ))}
          </TooltipProvider>
        </nav>
      </ScrollArea>

      {/* User section */}
      <div className="border-t border-border p-4">
        <div
          className={cn(
            "flex items-center",
            isCollapsed && !isMobile ? "justify-center" : "space-x-3",
          )}
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-medium text-primary">
              {userInitials}
            </span>
          </div>
          {(!isCollapsed || isMobile) && (
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{userDisplayName}</p>
              <p className="text-xs text-muted-foreground truncate">
                {userEmail}
              </p>
            </div>
          )}
        </div>

        <Separator className="my-3" />

        <TooltipProvider delayDuration={0}>
          {isCollapsed && !isMobile ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-center px-2"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                Sign Out
              </TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-3" />
              Sign Out
            </Button>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}

export function Sidenav({ mobileOpen, onMobileOpenChange }: SidenavProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { user, signOut, isPendingApproval, isOnboarding, profile } = useAuth();
  const { isAdmin } = useUserRole();
  const { data: adminStatsData } = useAdminStats(isAdmin);

  const pathname = usePathname();

  // Users are restricted if they're pending approval OR still onboarding
  const isRestrictedUser = isPendingApproval || isOnboarding;

  // Load collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidenav-collapsed");
    if (stored !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from localStorage on mount
      setIsCollapsed(stored === "true");
    }
  }, []);

  // Toggle collapsed state
  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("sidenav-collapsed", String(newState));
  };

  // Filter main navigation based on user status
  const filteredMainNavItems = mainNavItems.filter((item) => {
    if (item.hideForPending && isRestrictedUser) return false;
    return true;
  });

  // Check if route is active
  const isActiveRoute = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    // For admin sub-routes, match exactly on the route prefix
    if (href.startsWith("/admin/")) {
      return pathname.startsWith(href);
    }
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    onMobileOpenChange(false);
    await signOut();
  };

  const handleNavClick = () => {
    onMobileOpenChange(false);
  };

  // Get user display info
  const userDisplayName =
    profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || "";
  const userInitials = userDisplayName.slice(0, 2).toUpperCase();

  // Extract admin stats for badges
  const adminStats: AdminStatsData | undefined = adminStatsData
    ? {
        pendingApprovalsTotal: adminStatsData.pendingApprovalsTotal,
        pendingVerificationTotal: adminStatsData.pendingVerificationTotal,
      }
    : undefined;

  // Shared props for SidebarContent
  const sidebarProps = {
    isCollapsed,
    isRestrictedUser,
    isAdmin,
    adminStats,
    toggleCollapsed,
    filteredMainNavItems,
    isActiveRoute,
    handleNavClick,
    handleSignOut,
    userDisplayName,
    userEmail,
    userInitials,
  };

  return (
    <>
      {/* Desktop Sidenav */}
      <aside
        className={cn(
          "hidden md:flex flex-col fixed left-0 top-0 h-screen bg-background border-r border-border transition-all duration-300 z-40",
          isCollapsed ? "w-16" : "w-64",
        )}
      >
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Mobile Sidenav (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-72 p-0">
          <SidebarContent {...sidebarProps} isMobile />
        </SheetContent>
      </Sheet>

      {/* Spacer for desktop layout */}
      <div
        className={cn(
          "hidden md:block flex-shrink-0 transition-all duration-300",
          isCollapsed ? "w-16" : "w-64",
        )}
      />
    </>
  );
}
