"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
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
  Users,
  FileText,
  LayoutDashboard,
  Shield,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidenavProps {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  hideForPending: boolean;
  adminOnly?: boolean;
}

const navigationItems: NavigationItem[] = [
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
    name: "My Companies",
    href: "/my-companies",
    icon: Building2,
    hideForPending: true,
  },
  {
    name: "Profile",
    href: "/profile",
    icon: User,
    hideForPending: true,
  },
  {
    name: "Admin",
    href: "/admin",
    icon: Shield,
    hideForPending: true,
    adminOnly: true,
  },
];

interface SidebarContentProps {
  isMobile?: boolean;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  filteredNavItems: NavigationItem[];
  isActiveRoute: (href: string) => boolean;
  handleNavClick: () => void;
  handleSignOut: () => void;
  userDisplayName: string;
  userEmail: string;
  userInitials: string;
}

function SidebarContent({
  isMobile = false,
  isCollapsed,
  toggleCollapsed,
  filteredNavItems,
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

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          <TooltipProvider delayDuration={0}>
            {filteredNavItems.map((item) => {
              const isActive = isActiveRoute(item.href);
              const NavButton = (
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn(
                    "w-full justify-start",
                    isCollapsed && !isMobile && "justify-center px-2",
                  )}
                  asChild
                >
                  <Link href={item.href} onClick={handleNavClick}>
                    <item.icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        (!isCollapsed || isMobile) && "mr-3",
                      )}
                    />
                    {(!isCollapsed || isMobile) && (
                      <span className="truncate">{item.name}</span>
                    )}
                  </Link>
                </Button>
              );

              if (isCollapsed && !isMobile) {
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>{NavButton}</TooltipTrigger>
                    <TooltipContent side="right" sideOffset={10}>
                      {item.name}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return <div key={item.href}>{NavButton}</div>;
            })}
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
  const pathname = usePathname();

  // Users are restricted if they're pending approval OR still onboarding
  const isRestrictedUser = isPendingApproval || isOnboarding;

  // Load collapsed state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidenav-collapsed");
    if (stored !== null) {
      setIsCollapsed(stored === "true");
    }
  }, []);

  // Toggle collapsed state
  const toggleCollapsed = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("sidenav-collapsed", String(newState));
  };

  // Filter navigation based on user status
  const filteredNavItems = navigationItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    // Hide restricted items for both pending and onboarding users
    if (item.hideForPending && isRestrictedUser) return false;
    return true;
  });

  // Check if route is active
  const isActiveRoute = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
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
    profile?.first_name && profile?.last_name
      ? `${profile.first_name} ${profile.last_name}`
      : user?.email?.split("@")[0] || "User";
  const userEmail = user?.email || "";
  const userInitials = userDisplayName.slice(0, 2).toUpperCase();

  // Shared props for SidebarContent
  const sidebarProps = {
    isCollapsed,
    toggleCollapsed,
    filteredNavItems,
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
