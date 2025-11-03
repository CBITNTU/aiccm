import Header from "@/components/Header";
import CompanyOnboarding from "@/components/CompanyOnboarding";

const Onboarding = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header variant="app" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <CompanyOnboarding />
      </div>
    </div>
  );
};

export default Onboarding;