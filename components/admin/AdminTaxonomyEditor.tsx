"use client";

/* eslint-disable @typescript-eslint/no-explicit-any, react/no-unescaped-entities -- capabilities/taxonomy row types; copy uses quotes */
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Edit,
  Trash2,
  ChevronRight,
  ChevronDown,
  Folder,
  FileText,
  Search,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { useBatchProgress } from "@/hooks/useBatchProgress";
import { Progress } from "@/components/ui/progress";

type Capability = {
  id: string;
  name: string;
  category: string;
};

const AdminTaxonomyEditor = () => {
  const [supabase, setSupabase] = useState<SupabaseClient<Database> | null>(
    null,
  );
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [editingCapability, setEditingCapability] = useState<Capability | null>(
    null,
  );
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerationBatchId, setRegenerationBatchId] = useState<string | null>(
    null,
  );
  const [formData, setFormData] = useState({
    name: "",
    category: "",
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    batch,
    progress,
    isLoading: _batchLoading,
  } = useBatchProgress(regenerationBatchId, !!regenerationBatchId);

  useEffect(() => {
    const client = createClient();
    setSupabase(client);
  }, []);

  useEffect(() => {
    if (supabase) {
      fetchCapabilities();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when supabase ready
  }, [supabase]);

  // Refresh capabilities when regeneration completes
  const batchStatus = batch?.status ?? undefined;
  useEffect(() => {
    if (!supabase || batchStatus !== "completed" || !regenerationBatchId)
      return;

    console.log("🔄 Batch completed, refreshing capabilities list...");
    // Small delay to ensure database is updated
    const timeoutId = setTimeout(() => {
      console.log("📥 Fetching updated capabilities...");
      fetchCapabilities();
      toast.success("Capability list refreshed");
      // Clear batch ID after refresh to prevent re-triggering
      setRegenerationBatchId(null);
    }, 3000); // Increased delay to ensure DB writes are complete

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when batch completes
  }, [batchStatus, supabase]); // Only batchStatus and supabase - don't include batchId to keep array size constant

  const fetchCapabilities = async () => {
    if (!supabase) return;

    setLoading(true);
    try {
      // PostgREST defaults to 1000 rows - we need to fetch all capabilities
      // Use a high limit or pagination. For now, using a high limit (100k should be enough)
      let allCapabilities: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("company_capabilities_ref")
          .select("id, name, category")
          .order("category")
          .order("name")
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allCapabilities = [...allCapabilities, ...data];
          page++;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      // Filter out null categories and map to ensure type safety
      const validCapabilities = (allCapabilities || [])
        .filter(
          (c): c is { id: string; name: string; category: string } =>
            c.category !== null,
        )
        .map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
        }));

      // Log the fetched capabilities
      console.log(
        `📋 Fetched ${validCapabilities.length} capabilities from database`,
      );
      const categories = Array.from(
        new Set(validCapabilities.map((c) => c.category)),
      );
      console.log(`📂 Categories in UI (${categories.length}):`, categories);
      console.log(
        `📊 Capabilities by category:`,
        Object.entries(
          validCapabilities.reduce(
            (acc, cap) => {
              acc[cap.category] = (acc[cap.category] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          ),
        ),
      );

      setCapabilities(validCapabilities);
    } catch (error: any) {
      console.error("Error fetching capabilities:", error);
      toast.error(`Failed to load capabilities: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Get unique categories
  const categories = Array.from(
    new Set(capabilities.map((c) => c.category)),
  ).sort();

  // Get capabilities by category
  const getCapabilitiesByCategory = (category: string) => {
    return capabilities.filter((c) => c.category === category);
  };

  const toggleExpand = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const handleCreate = () => {
    setFormData({
      name: "",
      category: categories[0] || "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (capability: Capability) => {
    setEditingCapability(capability);
    setFormData({
      name: capability.name,
      category: capability.category,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!supabase) return;

    setDeletingId(id);
    try {
      const { error } = await supabase
        .from("company_capabilities_ref")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Capability deleted successfully");
      await fetchCapabilities();
    } catch (error: any) {
      console.error("Error deleting capability:", error);
      toast.error(`Failed to delete capability: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async () => {
    if (!supabase) return;

    try {
      if (!formData.name.trim() || !formData.category.trim()) {
        toast.error("Name and category are required");
        return;
      }

      if (editingCapability) {
        // Update existing
        const { error } = await supabase
          .from("company_capabilities_ref")
          .update({
            name: formData.name.trim(),
            category: formData.category.trim(),
          })
          .eq("id", editingCapability.id);

        if (error) throw error;
        toast.success("Capability updated successfully");
        setIsEditDialogOpen(false);
        setEditingCapability(null);
      } else {
        // Create new
        const { error } = await supabase
          .from("company_capabilities_ref")
          .insert({
            name: formData.name.trim(),
            category: formData.category.trim(),
          });

        if (error) throw error;
        toast.success("Capability created successfully");
        setIsCreateDialogOpen(false);
      }

      // Reset form
      setFormData({
        name: "",
        category: categories[0] || "",
      });
      setEditingCapability(null);

      // Refresh the capability list
      await fetchCapabilities();
    } catch (error: any) {
      console.error("Error saving capability:", error);
      toast.error(`Failed to save capability: ${error.message}`);
    }
  };

  const handleResetCapabilities = async () => {
    const confirmReset = window.confirm(
      "⚠️ WARNING: This will DELETE ALL capabilities and company-capability links!\n\n" +
        "This action cannot be undone. All companies will have their capabilities cleared.\n\n" +
        "After reset, you should run 'Regenerate All Company Capabilities' to repopulate.\n\n" +
        "Are you sure you want to proceed?",
    );

    if (!confirmReset) return;

    try {
      setIsRegenerating(true);

      const response = await fetch("/api/admin/reset-capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to reset capabilities");
      }

      // Refresh the capability list to show base capabilities
      await fetchCapabilities();

      toast.success(
        `✅ Reset complete! Deleted ${data.deletedCapabilities} capabilities and ${data.deletedLinks} links. ` +
          `Reseeded ${data.reseededCapabilities} base capabilities. You can now run 'Regenerate All Company Capabilities' to assign companies to these capabilities.`,
      );
    } catch (error) {
      console.error("Error resetting capabilities:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to reset capabilities",
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleRegenerateCapabilities = async () => {
    try {
      setIsRegenerating(true);

      // Clear previous batch ID so progress tracker resets
      setRegenerationBatchId(null);

      // Start regeneration (which will reset capabilities in the API if needed)
      const response = await fetch("/api/admin/regenerate-company-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxonomyOnly: true }), // Only regenerate taxonomy (2x faster)
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to start regeneration");
      }

      setRegenerationBatchId(data.batchId);

      // Refresh UI after a short delay to show reset capabilities
      setTimeout(() => {
        fetchCapabilities();
      }, 2000);

      toast.success(
        `Queued ${data.jobCount} AI processing jobs for ${data.companyCount} companies`,
      );
    } catch (error) {
      console.error("Error regenerating company capabilities:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start regeneration",
      );
    } finally {
      setIsRegenerating(false);
    }
  };

  const filteredCategories = categories.filter((category) => {
    const categoryLower = category.toLowerCase();
    const categoryCapabilities = getCapabilitiesByCategory(category);
    return (
      categoryLower.includes(searchTerm.toLowerCase()) ||
      categoryCapabilities.some((c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    );
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Capability Taxonomy Editor</CardTitle>
              <CardDescription>
                Manage company capabilities by category and name. These are used
                to match companies with projects.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                onClick={handleResetCapabilities}
                disabled={isRegenerating || batch?.status === "processing"}
                title="Delete ALL capabilities and links. Cannot be undone."
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Reset List
              </Button>
              <Button
                variant="outline"
                onClick={handleRegenerateCapabilities}
                disabled={isRegenerating || batch?.status === "processing"}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isRegenerating || batch?.status === "processing" ? "animate-spin" : ""}`}
                />
                Regenerate All Company Capabilities
              </Button>
              <Button
                variant="outline"
                onClick={fetchCapabilities}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
                />
                Refresh List
              </Button>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Capability
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Regeneration Progress */}
          {regenerationBatchId && batch && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">
                    Regenerating Company Capabilities
                  </span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
                <div className="text-sm text-muted-foreground">
                  {batch.completedJobs} / {batch.totalJobs} companies completed.
                  {batch.failedJobs > 0 && (
                    <span className="text-destructive ml-2">
                      ({batch.failedJobs} failed)
                    </span>
                  )}
                </div>
                {batch.status === "completed" && (
                  <div className="text-sm text-green-600 font-medium">
                    ✅ Regeneration completed!
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search capabilities or categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading capabilities...
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCategories.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No capabilities found. Create your first capability.
                </div>
              ) : (
                filteredCategories.map((category) => {
                  const categoryCapabilities = getCapabilitiesByCategory(
                    category,
                  ).filter((c) =>
                    c.name.toLowerCase().includes(searchTerm.toLowerCase()),
                  );
                  const isExpanded = expandedCategories.has(category);

                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleExpand(category)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>

                        <div className="flex-1 flex items-center gap-2">
                          <Folder className="h-4 w-4 text-primary" />
                          <span className="font-semibold">{category}</span>
                          <Badge variant="outline">
                            {categoryCapabilities.length}
                          </Badge>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="ml-8 space-y-1">
                          {categoryCapabilities.map((capability) => (
                            <div
                              key={capability.id}
                              className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50"
                            >
                              <div className="flex-1 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span>{capability.name}</span>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEdit(capability)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={deletingId === capability.id}
                                      className="text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        Delete Capability
                                      </AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete "
                                        {capability.name}"? This action cannot
                                        be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>
                                        Cancel
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() =>
                                          handleDelete(capability.id)
                                        }
                                        className="bg-destructive text-destructive-foreground"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          <div className="mt-4 text-sm text-muted-foreground">
            Total: {capabilities.length} capabilities across {categories.length}{" "}
            categories
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Capability</DialogTitle>
            <DialogDescription>
              Add a new capability to the taxonomy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select or enter category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.category && !categories.includes(formData.category) && (
                <p className="text-xs text-muted-foreground mt-1">
                  This will create a new category: "{formData.category}"
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Capability name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSave}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Capability</DialogTitle>
            <DialogDescription>
              Update the capability details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Capability name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTaxonomyEditor;
