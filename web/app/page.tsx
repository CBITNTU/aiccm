import Link from "next/link";
import { Building2, ArrowRight, Target, Users, LineChart } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 btn-hero rounded flex items-center justify-center">
                <Building2 className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg">AICCM</span>
            </div>
            <nav className="flex items-center gap-4">
              <Link
                href="/auth"
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/auth"
                className="btn-cta text-sm px-4 py-2 rounded-md"
              >
                Get Started
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 animate-fade-in">
            AI-Powered Construction
            <span className="block bg-gradient-to-r from-[hsl(215,84%,42%)] to-[hsl(158,64%,52%)] bg-clip-text text-transparent">
              Tender Matching
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto animate-slide-up">
            Connect your construction company with the perfect tender
            opportunities. Our AI-powered platform matches your capabilities
            with relevant projects across the UK.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up">
            <Link href="/auth" className="btn-hero px-8 py-3 rounded-lg">
              Start Matching
              <ArrowRight className="w-4 h-4 ml-2 inline" />
            </Link>
            <Link
              href="/auth"
              className="border border-input px-8 py-3 rounded-lg hover:bg-accent transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-muted/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            Why Choose AICCM?
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="card-professional p-6">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Smart Matching</h3>
              <p className="text-muted-foreground">
                Our AI analyzes your company&apos;s capabilities and matches you
                with the most relevant tender opportunities.
              </p>
            </div>
            <div className="card-professional p-6">
              <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-secondary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Team Building</h3>
              <p className="text-muted-foreground">
                Find complementary partners to form winning consortiums for
                larger construction projects.
              </p>
            </div>
            <div className="card-professional p-6">
              <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                <LineChart className="w-6 h-6 text-accent" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Business Intelligence</h3>
              <p className="text-muted-foreground">
                Get insights into market trends, competitor analysis, and
                optimize your bidding strategy.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Win More Tenders?</h2>
          <p className="text-muted-foreground mb-8">
            Join hundreds of construction companies already using AICCM to find
            and win the right projects.
          </p>
          <Link href="/auth" className="btn-hero px-8 py-3 rounded-lg inline-flex items-center">
            Get Started Free
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 btn-hero rounded flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">AICCM</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} AI Construction Competence
            Matching. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
