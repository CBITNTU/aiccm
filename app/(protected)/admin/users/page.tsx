"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
import { Header } from "@/components/layout/Header";
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
  TableRow,
} from "@/components/ui/table";
import { Users, Shield, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface User {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string;
  role?: "superadmin" | "sme-owner";
  first_name?: string;
  last_name?: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      checkAdminStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when user changes
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when isAdmin changes
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    if (!user) return;

    try {
      const { isAdmin: adminStatus } = await api.getUserRole();

      setIsAdmin(adminStatus);
      if (!adminStatus) {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error checking admin status:", error);
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { profiles, roles } = await api.adminListUsers();

      // Create a map of user roles
      const roleMap = new Map<string, string>();
      roles?.forEach((role) => {
        roleMap.set(role.user_id as string, role.role as string);
      });

      const formattedUsers: User[] =
        profiles?.map((profile) => ({
          id: profile.user_id as string,
          email: (profile.email as string) || "",
          first_name: (profile.first_name as string) || undefined,
          last_name: (profile.last_name as string) || undefined,
          created_at: profile.created_at as string,
          last_sign_in_at: profile.created_at as string,
          role:
            (roleMap.get(profile.user_id as string) as
              | "superadmin"
              | "sme-owner") || "sme-owner",
        })) || [];

      setUsers(formattedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (userId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this user? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      await api.adminDeleteUser(userId);

      toast.success("User has been successfully deleted");

      // Refresh users list
      fetchUsers();
    } catch (error) {
      console.error("Error deleting user:", error);
      toast.error("Failed to delete user");
    }
  };

  const toggleUserRole = async (
    userId: string,
    currentRole: "superadmin" | "sme-owner",
  ) => {
    const newRole = currentRole === "superadmin" ? "sme-owner" : "superadmin";

    try {
      if (newRole === "superadmin") {
        // Add superadmin role
        await api.adminAddUserRole(userId, "superadmin");
      } else {
        // Remove superadmin role
        await api.adminRemoveUserRole(userId, "superadmin");
      }

      toast.success(`User role changed to ${newRole}`);

      // Refresh users list
      fetchUsers();
    } catch (error) {
      console.error("Error updating user role:", error);
      toast.error("Failed to update user role");
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${u.first_name} ${u.last_name}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  if (!isAdmin && !loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              You don&apos;t have permission to access this page. Superadmin
              access required.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header variant="app" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header variant="app" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              User Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage platform users and their permissions
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {users.length} Total Users
            </Badge>
          </div>
        </div>

        <Card>
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
                          {userData.first_name && userData.last_name
                            ? `${userData.first_name} ${userData.last_name}`
                            : "No name"}
                        </div>
                      </TableCell>
                      <TableCell>{userData.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            userData.role === "superadmin"
                              ? "default"
                              : "secondary"
                          }
                          className="capitalize"
                        >
                          {userData.role === "superadmin"
                            ? "Superadmin"
                            : "SME Owner"}
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
                            onClick={() =>
                              toggleUserRole(
                                userData.id,
                                userData.role || "sme-owner",
                              )
                            }
                          >
                            <Shield className="w-4 h-4 mr-1" />
                            {userData.role === "superadmin"
                              ? "Remove Superadmin"
                              : "Make Superadmin"}
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
                  <p className="text-muted-foreground">
                    No users found matching your search.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mt-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Superadmin Instructions:</strong> To create a superadmin
              account, you need to:
              <br />
              1. Create a regular account through signup
              <br />
              2. Update the migration SQL to insert your email as superadmin
              <br />
              3. Or use the &quot;Make Superadmin&quot; button on an existing
              user
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </div>
  );
}
