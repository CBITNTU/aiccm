import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTaxonomies, type Taxonomy } from "@/hooks/useTaxonomies";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Plus, Edit, Trash2, ChevronRight, ChevronDown, Folder, FileText, Search, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AdminTaxonomyEditor = () => {
  const { taxonomies, loading, getLevel1, getLevel2, getLevel3, refetch } = useTaxonomies();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingTaxonomy, setEditingTaxonomy] = useState<Taxonomy | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    level: 1,
    parent_id: null as string | null,
  });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const handleCreate = () => {
    setFormData({
      name: "",
      description: "",
      level: 1,
      parent_id: null,
    });
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (taxonomy: Taxonomy) => {
    setEditingTaxonomy(taxonomy);
    setFormData({
      name: taxonomy.name,
      description: taxonomy.description || "",
      level: taxonomy.level,
      parent_id: taxonomy.parent_id,
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      // Check if taxonomy has children
      const hasChildren = taxonomies.some(t => t.parent_id === id);
      if (hasChildren) {
        toast.error("Cannot delete taxonomy with child categories. Please delete children first.");
        return;
      }

      const { error } = await supabase
        .from('taxonomies')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success("Taxonomy deleted successfully");
      refetch();
    } catch (error: any) {
      console.error('Error deleting taxonomy:', error);
      toast.error(`Failed to delete taxonomy: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name.trim()) {
        toast.error("Name is required");
        return;
      }

      if (editingTaxonomy) {
        // Update existing
        const { error } = await supabase
          .from('taxonomies')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            parent_id: formData.parent_id || null,
          })
          .eq('id', editingTaxonomy.id);

        if (error) throw error;
        toast.success("Taxonomy updated successfully");
        setIsEditDialogOpen(false);
        setEditingTaxonomy(null);
      } else {
        // Create new
        const { error } = await supabase
          .from('taxonomies')
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            level: formData.level,
            parent_id: formData.parent_id || null,
          });

        if (error) throw error;
        toast.success("Taxonomy created successfully");
        setIsCreateDialogOpen(false);
      }

      // Reset form
      setFormData({
        name: "",
        description: "",
        level: 1,
        parent_id: null,
      });
      setEditingTaxonomy(null);
      
      // Refresh the taxonomy list
      await refetch();
    } catch (error: any) {
      console.error('Error saving taxonomy:', error);
      toast.error(`Failed to save taxonomy: ${error.message}`);
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(taxonomies, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `taxonomies-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Taxonomies exported successfully");
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      if (!Array.isArray(imported)) {
        throw new Error("Invalid format: expected array of taxonomies");
      }

      // Validate structure
      for (const item of imported) {
        if (!item.name || typeof item.level !== 'number' || item.level < 1 || item.level > 3) {
          throw new Error(`Invalid taxonomy item: ${JSON.stringify(item)}`);
        }
      }

      // Import taxonomies (you might want to add conflict handling)
      const { error } = await supabase
        .from('taxonomies')
        .upsert(imported.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description || null,
          level: item.level,
          parent_id: item.parent_id || null,
        })), {
          onConflict: 'id'
        });

      if (error) throw error;

      toast.success(`Successfully imported ${imported.length} taxonomies`);
      refetch();
    } catch (error: any) {
      console.error('Error importing taxonomies:', error);
      toast.error(`Failed to import: ${error.message}`);
    }
  };

  const renderTaxonomyTree = (level1Items: Taxonomy[], depth = 0) => {
    const filtered = level1Items.filter(item =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return filtered.map((item) => {
      const hasChildren = taxonomies.some(t => t.parent_id === item.id);
      const isExpanded = expandedItems.has(item.id);
      const children = taxonomies.filter(t => t.parent_id === item.id);

      return (
        <div key={item.id} className="space-y-1">
          <div className={`flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 ${depth > 0 ? 'ml-6' : ''}`}>
            {hasChildren && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => toggleExpand(item.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
            {!hasChildren && <div className="w-6" />}
            
            <div className="flex-1 flex items-center gap-2">
              {item.level === 1 ? (
                <Folder className="h-4 w-4 text-primary" />
              ) : (
                <FileText className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-medium">{item.name}</span>
              <Badge variant="outline">Level {item.level}</Badge>
              {item.description && (
                <span className="text-sm text-muted-foreground">- {item.description}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(item)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deletingId === item.id}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Taxonomy</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{item.name}"? This action cannot be undone.
                      {hasChildren && " This will also delete all child categories."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(item.id)}
                      className="bg-destructive text-destructive-foreground"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {isExpanded && hasChildren && (
            <div className="ml-4">
              {renderTaxonomyTree(children, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const level1Items = getLevel1();
  const filteredTaxonomies = searchTerm
    ? taxonomies.filter(t =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : taxonomies;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Taxonomy Editor</CardTitle>
              <CardDescription>
                Manage competency categories and taxonomy structure. Edit JSON/XML structure in-browser.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export JSON
              </Button>
              <label>
                <Button variant="outline" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    Import JSON
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search taxonomies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading taxonomies...</div>
          ) : (
            <div className="space-y-2">
              {level1Items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No taxonomies found. Create your first category.
                </div>
              ) : (
                renderTaxonomyTree(level1Items)
              )}
            </div>
          )}

          <div className="mt-4 text-sm text-muted-foreground">
            Total: {taxonomies.length} categories
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Taxonomy Category</DialogTitle>
            <DialogDescription>
              Add a new category to the taxonomy structure.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="level">Level</Label>
              <Select
                value={formData.level.toString()}
                onValueChange={(value) => {
                  setFormData({ ...formData, level: parseInt(value), parent_id: null });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Level 1 - Main Category</SelectItem>
                  <SelectItem value="2">Level 2 - Sub-category</SelectItem>
                  <SelectItem value="3">Level 3 - Specific Area</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.level > 1 && (
              <div>
                <Label htmlFor="parent">Parent Category</Label>
                <Select
                  value={formData.parent_id || ""}
                  onValueChange={(value) => setFormData({ ...formData, parent_id: value || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent category" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxonomies
                      .filter(t => t.level === formData.level - 1)
                      .map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Category name"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Category description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
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
            <DialogTitle>Edit Taxonomy Category</DialogTitle>
            <DialogDescription>
              Update the taxonomy category details.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-level">Level</Label>
              <Select
                value={formData.level.toString()}
                onValueChange={(value) => {
                  setFormData({ ...formData, level: parseInt(value) });
                }}
                disabled
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Level 1 - Main Category</SelectItem>
                  <SelectItem value="2">Level 2 - Sub-category</SelectItem>
                  <SelectItem value="3">Level 3 - Specific Area</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.level > 1 && (
              <div>
                <Label htmlFor="edit-parent">Parent Category</Label>
                <Select
                  value={formData.parent_id || ""}
                  onValueChange={(value) => setFormData({ ...formData, parent_id: value || null })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent category" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxonomies
                      .filter(t => t.level === formData.level - 1 && t.id !== editingTaxonomy?.id)
                      .map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Category name"
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Category description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
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

