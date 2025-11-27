import { ArrowRight, Building2, FileText, Users2, TrendingUp, Mail, Clock, Sparkles, Award, Network, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import cbitLogo from "@/assets/cbit-logo.png";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const HeroSection = () => {
  const [realStats, setRealStats] = useState({
    companies: 0,
    tenders: 0,
    matches: 0,
    projects: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-platform-stats');
        
        if (error) {
          console.error('Error fetching stats:', error);
          return;
        }

        if (data) {
          setRealStats({
            companies: data.companies || 0,
            tenders: data.tenders || 0,
            matches: data.matches || 0,
            projects: data.projects || 0
          });
        }
      } catch (error) {
        console.error('Error fetching stats:', error);
      }
    };

    fetchStats();
  }, []);

  const stats = [
    { 
      label: "Network Companies", 
      value: realStats.companies.toString(), 
      icon: Building2, 
      gradient: "from-primary to-primary-hover",
      description: "Active businesses in our network"
    },
    { 
      label: "Available Opportunities", 
      value: realStats.tenders.toString(), 
      icon: FileText, 
      gradient: "from-secondary to-secondary-hover",
      description: "Current tender opportunities"
    },
    { 
      label: "Smart Matches", 
      value: realStats.matches.toString(), 
      icon: Users2, 
      gradient: "from-accent to-accent-hover",
      description: "AI-powered connections made"
    },
    { 
      label: "Active Projects", 
      value: realStats.projects.toString(), 
      icon: Award, 
      gradient: "from-primary to-secondary",
      description: "Collaborative consortiums formed"
    },
  ];

  const features = [
    {
      icon: Sparkles,
      title: "Smart Business Profiling",
      description: "AI analyzes your business data to build comprehensive capability profiles automatically, identifying strengths and opportunities.",
      gradient: "from-primary/20 to-primary/5"
    },
    {
      icon: Target,
      title: "Intelligent Opportunity Matching", 
      description: "Get matched to relevant opportunities with explainable AI scoring and detailed capability analysis for informed decisions.",
      gradient: "from-secondary/20 to-secondary/5"
    },
    {
      icon: Network,
      title: "Regional Partnership Network",
      description: "Form strategic partnerships with complementary regional businesses to compete for larger opportunities together.",
      gradient: "from-accent/20 to-accent/5"
    }
  ];

  return (
    <section className="relative overflow-hidden min-h-screen bg-black">
      {/* Cinematic Background with Film Grain Effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-background to-black" />
      
      {/* Spotlight Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(45_100%_51%/0.15),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(0_70%_45%/0.2),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_left,hsl(200_100%_50%/0.1),transparent_50%)]" />
      
      {/* Film Grain Texture */}
      <div className="absolute inset-0 opacity-30 mix-blend-overlay" 
           style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'4\' numOctaves=\'4\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")' }} />
      
      {/* Animated Spotlight Beams */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-b from-primary/30 to-transparent rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-20 right-1/4 w-80 h-80 bg-gradient-to-b from-secondary/25 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      <div className="absolute bottom-0 left-1/2 w-72 h-72 bg-gradient-to-t from-accent/20 to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
        {/* Hero Section */}
        <div className="text-center space-y-8 animate-fade-in">

          {/* Main Heading - Cinematic Title Style */}
          <div className="max-w-5xl mx-auto space-y-8">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black text-foreground leading-none tracking-tight">
              <span className="block text-primary drop-shadow-[0_0_30px_rgba(255,215,0,0.5)]">AI-Powered CCM</span>
              <span className="relative block mt-4">
                <span className="gradient-hero bg-clip-text text-transparent drop-shadow-[0_0_50px_rgba(220,38,38,0.6)]">
                  Empowering Collaboration through Competence
                </span>
                <div className="absolute -inset-2 bg-gradient-to-r from-primary/30 via-secondary/30 to-accent/30 blur-2xl opacity-50 -z-10 animate-pulse" />
              </span>
            </h1>
            
            <p className="text-xl md:text-2xl lg:text-3xl text-foreground/90 max-w-4xl mx-auto leading-relaxed font-light tracking-wide">
              Discover your company's strengths, match with tenders, and form winning consortiums with AI.
            </p>
          </div>

          {/* Call to Action Buttons - Cinematic Style */}
          <div className="flex flex-col sm:flex-row gap-8 justify-center items-center pt-8">
            <Button size="lg" className="btn-hero min-w-[260px] text-xl px-12 py-6 shadow-cinematic uppercase tracking-wider" asChild>
              <a href="/onboarding">
                Add Your Company
                <ArrowRight className="ml-3 w-6 h-6" />
              </a>
            </Button>
            
            <Button size="lg" variant="outline" className="btn-outline-primary min-w-[260px] text-xl px-12 py-6 uppercase tracking-wider" asChild>
              <a href="/tenders">
                Explore Tenders
              </a>
            </Button>
          </div>
        </div>

        {/* Regional Network Map 
        <div className="mt-20 lg:mt-32">
          <div className="animate-fade-in">
            <UKCompaniesMap />
          </div>
        </div>*/}

        {/* Statistics Grid - Cinematic */}
        <div className="mt-32 lg:mt-40">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-primary drop-shadow-[0_0_30px_rgba(255,215,0,0.4)] uppercase tracking-wide mb-6">Platform Impact</h2>
            <p className="text-xl md:text-2xl text-foreground/80 font-light tracking-wide">Real results driving regional growth across the East Midlands</p>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10 animate-slide-up">
            {stats.map((stat, index) => (
              <Card key={stat.label} className="relative group overflow-hidden border border-primary/20 bg-card/30 backdrop-blur-xl shadow-dramatic hover:shadow-cinematic transition-all duration-700 hover:border-primary/60">
                {/* Cinematic Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                
                <CardContent className="relative p-8 lg:p-10 text-center">
                  <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br ${stat.gradient} mb-8 group-hover:scale-125 transition-transform duration-700 shadow-glow`}>
                    <stat.icon className="w-10 h-10 text-black" />
                  </div>
                  
                  <div className="space-y-3">
                    <p className="text-5xl lg:text-6xl font-black text-primary drop-shadow-[0_0_20px_rgba(255,215,0,0.5)] group-hover:scale-110 transition-transform duration-500">{stat.value}</p>
                    <p className="text-base font-bold text-foreground uppercase tracking-wider">{stat.label}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed font-light">{stat.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Features Section - Cinematic */}
        <div className="mt-32 lg:mt-48">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-secondary drop-shadow-[0_0_30px_rgba(220,38,38,0.5)] uppercase tracking-wide mb-6">Platform Features</h2>
            <p className="text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto font-light tracking-wide leading-relaxed">
              Discover how AI-powered matching and regional partnerships can transform your business opportunities
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-10 lg:gap-14">
            {features.map((feature, index) => (
              <div key={feature.title} className="group">
                <Card className="relative overflow-hidden border border-secondary/30 bg-card/20 backdrop-blur-xl shadow-dramatic hover:shadow-cinematic transition-all duration-700 h-full hover:border-secondary/70">
                  {/* Spotlight Effect */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-transparent opacity-50" />
                  
                  <CardContent className="relative p-10 text-center space-y-8 h-full flex flex-col">
                    <div className="flex-shrink-0">
                      <div className="w-24 h-24 gradient-primary rounded-full mx-auto flex items-center justify-center group-hover:scale-125 group-hover:rotate-12 transition-all duration-700 shadow-glow border-2 border-primary/50">
                        <feature.icon className="w-12 h-12 text-black" />
                      </div>
                    </div>
                    
                    <div className="flex-grow space-y-5">
                      <h3 className="text-2xl lg:text-3xl font-black text-primary uppercase tracking-wide group-hover:text-secondary transition-colors duration-500 drop-shadow-[0_0_15px_rgba(255,215,0,0.4)]">
                        {feature.title}
                      </h3>
                      <p className="text-foreground/80 leading-relaxed text-base lg:text-lg font-light">
                        {feature.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>

        {/* Contact Section - Cinematic */}
        <div className="mt-32 lg:mt-48 max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-accent drop-shadow-[0_0_30px_rgba(0,191,255,0.5)] uppercase tracking-wide mb-6">Get In Touch</h2>
            <p className="text-xl md:text-2xl text-foreground/80 font-light tracking-wide">Ready to join the East Midlands business network?</p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-10">
            <Card className="relative overflow-hidden border border-primary/30 bg-card/20 backdrop-blur-xl shadow-[0_30px_80px_-20px_hsl(0_0%_0%/0.8)] hover:shadow-[0_20px_60px_-15px_hsl(45_100%_51%/0.4),0_0_80px_-20px_hsl(0_70%_45%/0.3)] transition-all duration-700 group hover:border-primary/70">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent" />
              <CardContent className="relative p-10 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary-hover mb-8 group-hover:scale-125 transition-transform duration-700 shadow-[0_0_40px_hsl(45_100%_51%/0.5)] border-2 border-primary/50">
                  <Mail className="w-10 h-10 text-black" />
                </div>
                <h3 className="text-2xl font-black text-primary uppercase tracking-wider mb-6 drop-shadow-[0_0_15px_rgba(255,215,0,0.3)]">Email Us</h3>
                <a href="mailto:cbit@ntu.ac.uk" className="text-foreground hover:text-primary transition-colors text-xl font-light hover:drop-shadow-[0_0_10px_rgba(255,215,0,0.5)]">
                  cbit@ntu.ac.uk
                </a>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border border-secondary/30 bg-card/20 backdrop-blur-xl shadow-[0_30px_80px_-20px_hsl(0_0%_0%/0.8)] hover:shadow-[0_20px_60px_-15px_hsl(45_100%_51%/0.4),0_0_80px_-20px_hsl(0_70%_45%/0.3)] transition-all duration-700 group hover:border-secondary/70">
              <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-secondary to-transparent" />
              <CardContent className="relative p-10 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-secondary to-secondary-hover mb-8 group-hover:scale-125 transition-transform duration-700 shadow-[0_0_40px_hsl(45_100%_51%/0.5)] border-2 border-secondary/50">
                  <Clock className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-black text-secondary uppercase tracking-wider mb-6 drop-shadow-[0_0_15px_rgba(220,38,38,0.3)]">Office Hours</h3>
                <div className="text-foreground/80 space-y-3 font-light text-lg">
                  <p>Monday – Friday: 9 am – 5 pm</p>
                  <p>Saturday – Sunday: Closed</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer with Logo - Cinematic */}
        <div className="mt-24 border-t border-primary/20 pt-12">
          <div className="flex flex-col items-end pr-4">
            <img src={cbitLogo} alt="Centre for Business and Industry Transformation" className="h-16 drop-shadow-[0_0_20px_rgba(255,215,0,0.3)]" />
            <p className="text-base text-foreground/60 mt-3 font-light tracking-wider">Powered by UKCCM</p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;