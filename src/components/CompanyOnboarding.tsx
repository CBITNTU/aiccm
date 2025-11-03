import { useState } from "react";
import CompanyOnboardingStep1 from "./CompanyOnboardingStep1";
import CompanyOnboardingStep2 from "./CompanyOnboardingStep2";

const CompanyOnboarding = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [step1Data, setStep1Data] = useState<any>(null);
  const [prefillData, setPrefillData] = useState<any>(null);

  const handleStep1Next = (data: any, prefill: any) => {
    setStep1Data(data);
    setPrefillData(prefill);
    setCurrentStep(2);
  };

  const handleStep2Back = () => {
    setCurrentStep(1);
  };

  return (
    <div className="max-w-7xl mx-auto">
      {currentStep === 1 && (
        <CompanyOnboardingStep1 onNext={handleStep1Next} />
      )}
      {currentStep === 2 && (
        <CompanyOnboardingStep2
          step1Data={step1Data}
          prefillData={prefillData}
          onBack={handleStep2Back}
        />
      )}
    </div>
  );
};

export default CompanyOnboarding;
