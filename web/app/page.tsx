import { Header } from "@/components/layout/Header";
import { HeroSection } from "@/components/layout/HeroSection";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header variant="landing" />
      <HeroSection />
    </div>
  );
}
