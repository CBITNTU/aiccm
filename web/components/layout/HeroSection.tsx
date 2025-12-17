"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
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
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null
  );
  const [realStats, setRealStats] = useState({
    companies: 0,
    tenders: 0,
    matches: 0,
    projects: 0,
  });

  // Initialize supabase client
  useEffect(() => {
    try {
      const client = createClient();
      setSupabase(client);
    } catch (error) {
      console.error("Failed to create Supabase client:", error);
    }
  }, []);

  // Fetch platform stats
  useEffect(() => {
    if (!supabase) return;

    const fetchStats = async () => {
      try {
        const { data, error } = await supabase.functions.invoke(
          "get-platform-stats"
        );

        if (error) {
          console.error("Error fetching stats:", error);
          return;
        }

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
  }, [supabase]);

  const stats = [
    {
      label: "Network Companies",
      value: realStats.companies.toString(),
      icon: Building2,
      gradient: "from-primary to-primary/80",
      description: "Active businesses in our network",
    },
    {
      label: "Available Opportunities",
      value: realStats.tenders.toString(),
      icon: FileText,
      gradient: "from-secondary to-secondary/80",
      description: "Current tender opportunities",
    },
    {
      label: "Smart Matches",
      value: realStats.matches.toString(),
      icon: Users2,
      gradient: "from-accent to-accent/80",
      description: "AI-powered connections made",
    },
    {
      label: "Active Projects",
      value: realStats.projects.toString(),
      icon: Award,
      gradient: "from-primary to-secondary",
      description: "Collaborative consortiums formed",
    },
  ];

  const features = [
    {
      icon: Sparkles,
      title: "Smart Business Profiling",
      description:
        "AI analyzes your business data to build comprehensive capability profiles automatically, identifying strengths and opportunities.",
      gradient: "from-primary/20 to-primary/5",
    },
    {
      icon: Target,
      title: "Intelligent Opportunity Matching",
      description:
        "Get matched to relevant opportunities with explainable AI scoring and detailed capability analysis for informed decisions.",
      gradient: "from-secondary/20 to-secondary/5",
    },
    {
      icon: Network,
      title: "Regional Partnership Network",
      description:
        "Form strategic partnerships with complementary regional businesses to compete for larger opportunities together.",
      gradient: "from-accent/20 to-accent/5",
    },
  ];

  return (
    <section className="relative overflow-hidden min-h-screen">
      {/* Enhanced Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-primary/5 to-secondary/5" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(var(--primary)/0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,hsl(var(--secondary)/0.1),transparent_50%)]" />

      {/* Animated Background Elements */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-full blur-3xl animate-pulse" />
      <div
        className="absolute top-40 right-20 w-48 h-48 bg-gradient-to-r from-secondary/15 to-accent/15 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: "1s" }}
      />
      <div
        className="absolute bottom-40 left-1/3 w-40 h-40 bg-gradient-to-r from-accent/20 to-primary/20 rounded-full blur-3xl animate-pulse"
        style={{ animationDelay: "2s" }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        {/* Hero Section */}
        <div className="text-center space-y-8">
          {/* Main Heading */}
          <div className="max-w-5xl mx-auto space-y-6">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground leading-tight">
              AI-Powered CCM{" "}
              <span className="relative">
                <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Empowering Collaboration through Competence
                </span>
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-secondary/20 blur opacity-30 -z-10" />
              </span>
            </h1>

            <p className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-4xl mx-auto leading-relaxed font-medium">
              Discover your company&apos;s strengths, match with tenders, and
              form winning consortiums with AI.
            </p>
          </div>

          {/* Call to Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center pt-4">
            <Button
              size="lg"
              className="min-w-[220px] text-lg px-8 py-6 shadow-2xl"
              asChild
            >
              <Link href="/onboarding">
                Add Your Company
                <ArrowRight className="ml-2 w-5 h-5" />
              </Link>
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="min-w-[220px] text-lg px-8 py-6"
              asChild
            >
              <Link href="/tenders">Explore Tenders</Link>
            </Button>
          </div>
        </div>

        {/* Statistics Grid */}
        <div className="mt-20 lg:mt-24">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Platform Impact
            </h2>
            <p className="text-lg text-muted-foreground">
              Real results driving regional growth across the East Midlands
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
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
              Platform Features
            </h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
              Discover how AI-powered matching and regional partnerships can
              transform your business opportunities
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
                      <div className="w-20 h-20 bg-gradient-to-br from-primary to-secondary rounded-2xl mx-auto flex items-center justify-center group-hover:scale-110 transition-transform duration-500 shadow-xl">
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
              Get In Touch
            </h2>
            <p className="text-lg text-muted-foreground">
              Ready to join the East Midlands business network?
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
                  Email Us
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
              <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <CardContent className="relative p-8 text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-secondary to-secondary/80 mb-6 group-hover:scale-110 transition-transform duration-500 shadow-lg">
                  <Clock className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-4">
                  Office Hours
                </h3>
                <div className="text-muted-foreground space-y-2 font-medium">
                  <p>Monday - Friday: 9 am - 5 pm</p>
                  <p>Saturday - Sunday: Closed</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-16 border-t border-border/20 pt-8">
          <div className="flex flex-col items-center md:items-end md:pr-4">
            <p className="text-sm text-muted-foreground">
              Powered by Centre for Business and Industry Transformation (CBIT)
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
