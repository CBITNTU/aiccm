import { Suspense } from "react";
import { Header } from "@/components/layout/Header";
import { HeroSection } from "@/components/layout/HeroSection";
import { AuthRedirect } from "@/components/layout/AuthRedirect";
import { ModeRedirect } from "@/components/layout/ModeRedirect";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Handle auth hash tokens redirected to root */}
      <AuthRedirect />
      {/* Handle ?mode=create query param for company creation */}
      <Suspense fallback={null}>
        <ModeRedirect />
      </Suspense>
      <Header variant="landing" />
      <HeroSection />
    </div>
  );
}
