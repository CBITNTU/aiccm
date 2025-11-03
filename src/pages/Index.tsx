import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Remove automatic redirect so users can visit home page when they want

  return (
    <div className="min-h-screen bg-background">
      <Header variant="landing" />
      <HeroSection />
    </div>
  );
};

export default Index;
