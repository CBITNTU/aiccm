"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import {
  ArrowRight,
  Building2,
  FileText,
  Users2,
  Sparkles,
  Award,
  Network,
  Target,
  Mail,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function HeroSection() {
  const t = useTranslations("HeroSection");
  const [realStats, setRealStats] = useState({
    companies: 0,
    tenders: 0,
    matches: 0,
    projects: 0,
  });

  // Fetch platform stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.getPlatformStats();

        if (data) {
          setRealStats({
            companies: data.companies || 0,
            tenders: data.tenders || 0,
            matches: data.matches || 0,
            projects: data.projects || 0,
          });
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, []);

  const stats = [
    {
      label: t("stats.networkCompanies"),
      value: realStats.companies.toString(),
      icon: Building2,
      gradient: "from-primary to-primary/80",
      description: t("stats.networkCompaniesDescription"),
    },
    {
      label: t("stats.availableOpportunities"),
      value: realStats.tenders.toString(),
      icon: FileText,
      gradient: "from-accent to-accent/80",
      description: t("stats.availableOpportunitiesDescription"),
    },
    {
      label: t("stats.smartMatches"),
      value: realStats.matches.toString(),
      icon: Users2,
      gradient: "from-accent to-accent/80",
      description: t("stats.smartMatchesDescription"),
    },
    {
      label: t("stats.activeProjects"),
      value: realStats.projects.toString(),
      icon: Award,
      gradient: "from-primary to-primary/80",
      description: t("stats.activeProjectsDescription"),
    },
  ];

  const features = [
    {
      icon: Sparkles,
      title: t("features.profilingTitle"),
      description: t("features.profilingDescription"),
      gradient: "from-primary/20 to-primary/5",
    },
    {
      icon: Target,
      title: t("features.matchingTitle"),
      description: t("features.matchingDescription"),
      gradient: "from-accent/20 to-accent/5",
    },
    {
      icon: Network,
      title: t("features.networkTitle"),
      description: t("features.networkDescription"),
      gradient: "from-accent/20 to-accent/5",
    },
  ];

  return (
    <section className="relative overflow-hidden min-h-screen">
      {/* Enhanced Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-primary/5 to-accent/5" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(var(--accent)/0.1),transparent_50%)]" />

      {/* Animated Background Elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-to-r from-primary/20 to-accent/20 rounded-full blur-3xl animate-float" />
      <div
        className="absolute top-40 right-20 w-48 h-48 bg-gradient-to-r from-accent/15 to-primary/15 rounded-full blur-3xl animate-float"
        style={{ animationDelay: "1s" }}
      />
      <div
        className="absolute bottom-40 left-1/3 w-40 h-40 bg-gradient-to-r from-accent/20 to-primary/20 rounded-full blur-3xl animate-float"
        style={{ animationDelay: "2s" }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        {/* Hero Section */}
        <div className="text-center space-y-8 animate-fade-in">
          {/* Main Heading */}
          <div className="max-w-5xl mx-auto space-y-6">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight">
              {t("headlineBrand")}{" "}
              <span className="relative">
                <span className="gradient-hero bg-clip-text text-transparent">
                  {t("headlineAccent")}
                </span>
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-accent/20 blur opacity-30 -z-10" />
              </span>
            </h1>

            <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed font-medium">
              {t("subheadline")}
            </p>
          </div>

          {/* Call to Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-4">
            <Button
              size="lg"
              className="btn-hero min-w-[220px] text-lg px-8 py-4 shadow-2xl"
              asChild
            >
              <Link href="/onboarding">
                {t("ctaAddCompany")}
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="btn-outline-primary min-w-[220px] text-lg px-8 py-4"
              asChild
            >
              <Link href="/tenders">{t("ctaExploreTenders")}</Link>
            </Button>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="mt-20 lg:mt-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {t("impact.title")}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t("impact.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 animate-slide-up">
            {stats.map((stat) => (
              <Card
                key={stat.label}
                className="relative group overflow-hidden border-0 bg-card/80 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500"
              >
                {/* Gradient Background */}
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${stat.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500`}
                />

                <CardContent className="relative p-6 lg:p-8 text-center">
                  <div
                    className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${stat.gradient} mb-6 group-hover:scale-110 transition-transform duration-500 shadow-lg`}
                  >
                    <stat.icon className="w-8 h-8 text-white" />
                  </div>

                  <div className="space-y-2">
                    <p className="text-4xl lg:text-5xl font-bold text-foreground group-hover:scale-105 transition-transform duration-300">
                      {stat.value}
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {stat.label}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {stat.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-20 lg:mt-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {t("platformFeatures.title")}
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              {t("platformFeatures.subtitle")}
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
            {features.map((feature) => (
              <div key={feature.title} className="group">
                <Card className="relative overflow-hidden border-0 bg-card/60 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 h-full">
                  {/* Background Gradient */}
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-50 group-hover:opacity-70 transition-opacity duration-500`}
                  />

                  <CardContent className="relative p-8 text-center space-y-6 h-full flex flex-col">
                    <div className="flex-shrink-0">
                      <div className="w-20 h-20 gradient-primary rounded-2xl mx-auto flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-xl">
                        <feature.icon className="w-10 h-10 text-white" />
                      </div>
                    </div>

                    <div className="flex-grow space-y-4">
                      <h3 className="text-xl lg:text-2xl font-bold text-foreground group-hover:text-primary transition-colors duration-300">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground leading-relaxed text-sm lg:text-base">
                        {feature.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* Contact Section */}
        <div className="mt-20 lg:mt-32 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              {t("contact.title")}
            </h2>
            <p className="text-lg text-muted-foreground">
              {t("contact.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <Card className="relative overflow-hidden border-0 bg-card/80 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardContent className="relative p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-lg">
                  <Mail className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-4">
                  {t("contact.emailUs")}
                </h3>
                <a
                  href="mailto:cbit@ntu.ac.uk"
                  className="text-primary hover:text-primary/80 transition-colors text-lg font-medium"
                >
                  cbit@ntu.ac.uk
                </a>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-0 bg-card/80 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 group">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/10 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardContent className="relative p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent/80 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-lg">
                  <Clock className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-4">
                  {t("contact.officeHours")}
                </h3>
                <div className="text-muted-foreground space-y-2 font-medium">
                  <p>{t("contact.weekdays")}</p>
                  <p>{t("contact.weekend")}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer with Logo */}
        <div className="mt-16 border-t border-border/20 pt-8">
          <div className="flex flex-col items-end pr-4">
            <Image
              src="/cbit-logo.png"
              alt={t("footer.logoAlt")}
              width={150}
              height={48}
              className="h-12 w-auto"
            />
            <p className="text-sm text-muted-foreground mt-2">
              {t("footer.poweredBy")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
