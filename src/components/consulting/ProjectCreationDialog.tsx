import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Briefcase } from "lucide-react";
import { toast } from "sonner";

interface ProjectCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (projectId: string) => void;
  companyId: string;
}

export function ProjectCreationDialog({ 
  open, 
  onOpenChange, 
  onProjectCreated,
  companyId 
}: ProjectCreationDialogProps) {
  const [loading, setLoading] = useState(false);
  const [tenders, setTenders] = useState<any[]>([]);
  const [loadingTenders, setLoadingTenders] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_tender_id: ''
  });

  useEffect(() => {
    if (open) {
      loadTenders();
    }
  }, [open]);

  const loadTenders = async () => {
    try {
      setLoadingTenders(true);
      const { data, error } = await supabase
        .from('tenders')
        .select('id, title, buyer, deadline')
        .in('status', ['open', 'closing_soon'])
        .order('deadline', { ascending: true })
        .limit(50);

      if (error) throw error;
      setTenders(data || []);
    } catch (error: any) {
      console.error('Error loading tenders:', error);
      toast.error('Failed to load tenders');
    } finally {
      setLoadingTenders(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a project name');
      return;
    }

    try {
      setLoading(true);

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('virtual_organizations')
        .insert({
          name: formData.name,
          description: formData.description,
          lead_company_id: companyId,
          target_tender_id: formData.target_tender_id || null,
          status: 'draft'
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Add owner as lead member
      const { error: memberError } = await supabase
        .from('vo_members')
        .insert({
          vo_id: project.id,
          company_id: companyId,
          role: 'lead'
        });

      if (memberError) throw memberError;

      toast.success('Consulting project created!');
      onProjectCreated(project.id);
      onOpenChange(false);
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        target_tender_id: ''
      });
    } catch (error: any) {
      console.error('Error creating project:', error);
      toast.error('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Create Consulting Project
          </DialogTitle>
          <DialogDescription>
            Start a new consulting project and build your team to bid on tenders
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name *</Label>
            <Input
              id="project-name"
              placeholder="e.g., Digital Transformation Project"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              placeholder="Describe the project goals and objectives..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tender-select">Target Tender (Optional)</Label>
            {loadingTenders ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <Select
                value={formData.target_tender_id}
                onValueChange={(value) => setFormData({ ...formData, target_tender_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a tender (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No tender</SelectItem>
                  {tenders.map((tender) => (
                    <SelectItem key={tender.id} value={tender.id}>
                      {tender.title} - {tender.buyer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
