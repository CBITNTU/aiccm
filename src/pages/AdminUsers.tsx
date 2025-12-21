import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Users, Shield, Trash2, Search, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string;
  role?: 'superadmin' | 'sme-owner';
  first_name?: string;
  last_name?: string;
}

const AdminUsers = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    checkAdminStatus();
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    try {
      const { data } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'superadmin'
      });
      
      setIsAdmin(data);
    } catch (error) {
      console.error('Error checking admin status:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      // Fetch users from profiles table
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Create a map of user_id -> role for quick lookup
      const roleMap = new Map<string, 'superadmin' | 'sme-owner'>();
      roles?.forEach(r => {
        if (r.role === 'superadmin' || r.role === 'sme-owner') {
          roleMap.set(r.user_id, r.role as 'superadmin' | 'sme-owner');
        }
      });

      // Combine profiles with roles
      const formattedUsers: User[] = profiles?.map(profile => ({
        id: profile.user_id,
        email: profile.email || '',
        first_name: profile.first_name,
        last_name: profile.last_name,
        created_at: profile.created_at,
        last_sign_in_at: profile.created_at,
        role: roleMap.get(profile.user_id) || 'sme-owner'
      })) || [];

      setUsers(formattedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "Failed to fetch users",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      // Delete user profile (this will cascade to companies and other related data)
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      toast({
        title: "User Deleted",
        description: "User has been successfully deleted",
      });

      // Refresh users list
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: "Failed to delete user",
        variant: "destructive"
      });
    }
  };

  const toggleUserRole = async (userId: string, currentRole: 'superadmin' | 'sme-owner') => {
    const newRole = currentRole === 'superadmin' ? 'sme-owner' : 'superadmin';
    
    try {
      if (newRole === 'superadmin') {
        // Add superadmin role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: 'superadmin' });
        
        if (error) throw error;
      } else {
        // Remove superadmin role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', 'superadmin');
        
        if (error) throw error;
      }

      toast({
        title: "Role Updated",
        description: `User role changed to ${newRole}`,
      });

      // Refresh users list
      fetchUsers();
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        title: "Error",
        description: "Failed to update user role",
        variant: "destructive"
      });
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access this page. Superadmin access required.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground">User Management</h2>
            <p className="text-muted-foreground mt-2">Manage platform users and their permissions</p>
          </div>
          
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {users.length} Total Users
            </Badge>
          </div>
        </div>

        <Card className="card-professional">
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Platform Users
              </CardTitle>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((userData) => (
                    <TableRow key={userData.id}>
                      <TableCell>
                        <div className="font-medium">
                          {userData.first_name && userData.last_name ? 
                            `${userData.first_name} ${userData.last_name}` : 
                            'No name'
                          }
                        </div>
                      </TableCell>
                      <TableCell>{userData.email}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={userData.role === 'superadmin' ? 'default' : 'secondary'}
                          className="capitalize"
                        >
                          {userData.role === 'superadmin' ? 'Superadmin' : 'SME Owner'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(userData.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleUserRole(userData.id, userData.role || 'sme-owner')}
                          >
                            <Shield className="w-4 h-4 mr-1" />
                            {userData.role === 'superadmin' ? 'Remove Superadmin' : 'Make Superadmin'}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteUser(userData.id)}
                            disabled={userData.id === user?.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredUsers.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No users found matching your search.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Superadmin Instructions:</strong> To create a superadmin account, you need to:
              <br />1. Create a regular account through signup
              <br />2. Update the migration SQL to insert your email as superadmin
              <br />3. Or use the "Make Superadmin" button on an existing user
            </AlertDescription>
          </Alert>
        </div>
    </div>
  );
};

export default AdminUsers;