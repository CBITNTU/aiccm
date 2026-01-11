import { Header } from "@/components/layout/Header";
import { HeroSection } from "@/components/layout/HeroSection";
import { AuthRedirect } from "@/components/layout/AuthRedirect";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Handle auth hash tokens redirected to root */}
      <AuthRedirect />
      <Header variant="landing" />
      <HeroSection />
    </div>
  );
}
