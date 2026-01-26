import { Suspense } from "react";
import { ProjectCreationWizard } from "@/components/projects/new/ProjectCreationWizard";
import { Loader2 } from "lucide-react";

interface PageProps {
  searchParams: Promise<{
    tenderId?: string;
    companyId?: string;
  }>;
}

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export default async function NewProjectPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ProjectCreationWizard
        initialTenderId={params.tenderId}
        initialCompanyId={params.companyId}
      />
    </Suspense>
  );
}
