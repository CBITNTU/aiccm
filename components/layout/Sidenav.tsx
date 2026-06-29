"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useAdminStats } from "@/hooks/useAdminStats";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
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
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useDeployment } from "@/lib/deployment/client";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { OrgSwitcher } from "@/components/layout/OrgSwitcher";
import { VerificationStatusIndicator } from "@/components/layout/VerificationStatusIndicator";


interface SidenavProps {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

interface NavigationItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  hideForPending: boolean;
  badgeKey?: "pendingApprovalsTotal" | "pendingVerificationTotal";
}

const mainNavItems: NavigationItem[] = [
  {
    labelKey: "nav.dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    hideForPending: true,
  },
  {
    labelKey: "nav.tenders",
    href: "/tenders",
    icon: FileText,
    hideForPending: false,
  },
  {
    labelKey: "nav.directory",
    href: "/directory",
    icon: Search,
    hideForPending: false,
  },
  {
    labelKey: "nav.projects",
    href: "/projects",
    icon: FolderKanban,
    hideForPending: true,
  },
  {
    labelKey: "nav.myCompany",
    href: "/my-company",
    icon: Building2,
    hideForPending: true,
  },
  {
    labelKey: "nav.profile",
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
      { labelKey: "admin.overview", href: "/admin/overview", icon: BarChart3, hideForPending: true },
      { labelKey: "admin.approvals", href: "/admin/approvals", icon: ClipboardCheck, hideForPending: true, badgeKey: "pendingApprovalsTotal" },
      { labelKey: "admin.verification", href: "/admin/verification", icon: ShieldCheck, hideForPending: true, badgeKey: "pendingVerificationTotal" },
    ],
  },
  {
    items: [
      { labelKey: "admin.companies", href: "/admin/companies", icon: Building2, hideForPending: true },
      { labelKey: "admin.users", href: "/admin/users", icon: UserCog, hideForPending: true },
      { labelKey: "admin.tenders", href: "/admin/tenders", icon: FileText, hideForPending: true },
      { labelKey: "admin.onboarding", href: "/admin/onboarding", icon: UserPlus, hideForPending: true },
    ],
  },
  {
    items: [
      { labelKey: "admin.taxonomy", href: "/admin/taxonomy", icon: Tags, hideForPending: true },
      { labelKey: "admin.settings", href: "/admin/settings", icon: SlidersHorizontal, hideForPending: true },
      { labelKey: "admin.demoSync", href: "/admin/demo-sync", icon: FlaskConical, hideForPending: true },
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
  filteredAdminNavGroups: AdminNavGroup[];
  toggleCollapsed: () => void;
  filteredMainNavItems: NavigationItem[];
  isActiveRoute: (href: string) => boolean;
  handleNavClick: () => void;
  handleSignOut: () => void;
  userDisplayName: string;
  userEmail: string;
  userInitials: string;
}

interface SidebarSkeletonProps {
  isMobile?: boolean;
  isCollapsed: boolean;
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
  const t = useTranslations("Sidenav");
  const label = t(item.labelKey as Parameters<typeof t>[0]);
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
            <span className="truncate flex-1">{label}</span>
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
          {label}
          {showBadge && ` (${badgeCount})`}
        </TooltipContent>
      </Tooltip>
    );
  }

  return <div>{NavButton}</div>;
}

function SidebarContentSkeleton({
  isMobile = false,
  isCollapsed,
}: SidebarSkeletonProps) {
  return (
    <div className="flex flex-col h-full">
      <div
        className={cn(
          "flex items-center h-16 px-4 border-b border-border",
          isCollapsed && !isMobile ? "justify-center" : "justify-between",
        )}
      >
        <div className="flex items-center space-x-3">
          <Skeleton className="w-8 h-8 rounded-lg" />
          {(!isCollapsed || isMobile) && <Skeleton className="h-5 w-20" />}
        </div>
        {!isMobile && !isCollapsed && <Skeleton className="h-8 w-8 rounded-md" />}
      </div>

      <div className="flex-1 py-4 px-2 space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center h-9",
              isCollapsed && !isMobile ? "justify-center px-2" : "px-3 gap-3",
            )}
          >
            <Skeleton className="h-4 w-4 rounded" />
            {(!isCollapsed || isMobile) && <Skeleton className="h-4 flex-1 max-w-[140px]" />}
          </div>
        ))}
      </div>

      <div className="border-t border-border p-4 space-y-3">
        <div
          className={cn(
            "flex items-center",
            isCollapsed && !isMobile ? "justify-center" : "space-x-3",
          )}
        >
          <Skeleton className="h-8 w-8 rounded-full" />
          {(!isCollapsed || isMobile) && (
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          )}
        </div>
        <Separator />
        {(!isCollapsed || isMobile) && <Skeleton className="h-7 w-full rounded-md" />}
      </div>
    </div>
  );
}

function SidebarContent({
  isMobile = false,
  isCollapsed,
  isRestrictedUser,
  isAdmin,
  adminStats,
  toggleCollapsed,
  filteredMainNavItems,
  filteredAdminNavGroups,
  isActiveRoute,
  handleNavClick,
  handleSignOut,
  userDisplayName,
  userEmail,
  userInitials,
}: SidebarContentProps) {
  const t = useTranslations("Sidenav");
  const { brand } = useDeployment();
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
                {brand.name}
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
            aria-label={isCollapsed ? t("expandSidebar") : t("collapseSidebar")}
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
                      {t("admin.label")}
                    </span>
                  </div>
                )}

                {filteredAdminNavGroups.map((group, groupIndex) => (
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
            /* Collapsed desktop: stacked icon buttons with tooltips */
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    className="w-full justify-center px-2 mb-1"
                    onClick={toggleCollapsed}
                    aria-label={t("language")}
                  >
                    <Globe className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  {t("language")}
                </TooltipContent>
              </Tooltip>
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
                  {t("signOut")}
                </TooltipContent>
              </Tooltip>
            </>
          ) : (
            /* Expanded desktop or mobile: single inline row */
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                <LocaleSwitcher size="sm" />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 shrink-0"
                onClick={handleSignOut}
                aria-label={t("signOut")}
              >
                <LogOut className="h-4 w-4" />
                <span className="ml-1.5 text-xs">{t("signOut")}</span>
              </Button>
            </div>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}

export function Sidenav({ mobileOpen, onMobileOpenChange }: SidenavProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const {
    user,
    signOut,
    isPendingApproval,
    isOnboarding,
    profile,
    hasResolvedInitialProfile,
  } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { data: adminStatsData } = useAdminStats(isAdmin);

  const pathname = usePathname();

  // Users are restricted if they're pending approval OR still onboarding
  const isRestrictedUser = isPendingApproval || isOnboarding;
  const showInitialNavSkeleton =
    !!user && (!hasResolvedInitialProfile || roleLoading);

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

  const filteredAdminNavGroups = adminNavGroups;

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
    filteredAdminNavGroups,
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
        {showInitialNavSkeleton ? (
          <SidebarContentSkeleton isCollapsed={isCollapsed} />
        ) : (
          <SidebarContent {...sidebarProps} />
        )}
      </aside>

      {/* Mobile Sidenav (Sheet) */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          {showInitialNavSkeleton ? (
            <SidebarContentSkeleton isCollapsed={isCollapsed} isMobile />
          ) : (
            <SidebarContent {...sidebarProps} isMobile />
          )}
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
