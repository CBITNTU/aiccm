"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Menu,
  User,
  LogOut,
  X,
  Search,
  Users,
  FileText,
  Settings,
  LayoutDashboard,
} from "lucide-react";

interface HeaderProps {
  variant?: "landing" | "app";
}

export function Header({ variant = "landing" }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    setIsMenuOpen(false);
    await signOut();
  };

  const navigationItems = [
    { name: "Tenders", href: "/tenders", icon: FileText },
    { name: "Company Directory", href: "/directory", icon: Search },
    { name: "Consulting Team Builder", href: "/vo", icon: Users },
  ];

  return (
    <header className="bg-background/95 backdrop-blur-sm border-b border-border sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo and Brand */}
          <Link
            href="/"
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
          >
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary">AI-Powered CCM</h1>
              <p className="text-xs text-muted-foreground leading-none">
                Collaborative Commerce Marketplace
              </p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          {variant === "app" && (
            <nav className="hidden md:flex items-center space-x-1">
              {navigationItems.map((item) => (
                <Button
                  key={item.name}
                  variant="ghost"
                  className="flex items-center space-x-2 text-muted-foreground hover:text-primary"
                  asChild
                >
                  <Link href={item.href}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                </Button>
              ))}
            </nav>
          )}

          {/* Actions */}
          <div className="flex items-center space-x-3">
            {variant === "landing" ? (
              <div className="flex space-x-4">
                {user ? (
                  <div className="flex items-center space-x-4">
                    <Button variant="outline" asChild>
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                    <Button onClick={handleSignOut} className="flex items-center">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </Button>
                  </div>
                ) : (
                  <div className="flex space-x-4">
                    <Button variant="outline" asChild>
                      <Link href="/auth">Sign In</Link>
                    </Button>
                    <Button asChild>
                      <Link href="/auth">Get Started</Link>
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex items-center space-x-4">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center"
                  asChild
                >
                  <Link href="/dashboard">
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center"
                  asChild
                >
                  <Link href="/profile">
                    <User className="w-4 h-4 mr-2" />
                    Profile
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center"
                  onClick={handleSignOut}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle navigation menu"
            >
              {isMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && variant === "app" && (
          <div className="md:hidden border-t border-border">
            <div className="py-4 space-y-2">
              <Button
                variant="ghost"
                className="w-full justify-start space-x-3 text-muted-foreground"
                asChild
              >
                <Link href="/dashboard">
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </Link>
              </Button>
              {navigationItems.map((item) => (
                <Button
                  key={item.name}
                  variant="ghost"
                  className="w-full justify-start space-x-3 text-muted-foreground"
                  asChild
                >
                  <Link href={item.href}>
                    <item.icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                </Button>
              ))}
              <Button
                variant="ghost"
                className="w-full justify-start space-x-3 text-muted-foreground"
                asChild
              >
                <Link href="/profile">
                  <User className="w-4 h-4" />
                  <span>Profile</span>
                </Link>
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start space-x-3 text-muted-foreground"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
