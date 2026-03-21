"use client";

/* eslint-disable @typescript-eslint/no-explicit-any -- profile/user row types */
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api/client";
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
import { Users, Shield, Trash2, Search, Activity } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface User {
  id: string;
  profileId?: string;
  email: string;
  createdAt: string;
  lastSignInAt: string;
  role?: "superadmin" | "sme-owner";
  firstName?: string | null;
  lastName?: string | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [_selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [eventsDialogOpen, setEventsDialogOpen] = useState(false);
  const [userEvents, setUserEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
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
     
  }, [isAdmin]);

  const checkAdminStatus = async () => {
    if (!user) return;

    try {
      const data = await api.getUserRole();
      const admin = data.isAdmin ?? false;
      setIsAdmin(admin);
      if (!admin) {
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

      const roleMap = new Map(
        roles?.map((ur: any) => [ur.userId, ur.role]),
      );

      const formattedUsers: User[] =
        profiles?.map((profile: any) => ({
          id: profile.userId,
          profileId: profile.id,
          email: profile.email || "",
          firstName: profile.firstName,
          lastName: profile.lastName,
          createdAt: profile.createdAt,
          lastSignInAt: profile.createdAt, // Placeholder, ideally from auth.users
          role:
            (roleMap.get(profile.userId) as "superadmin" | "sme-owner") ||
            "sme-owner",
        })) || [];

      setUsers(formattedUsers);
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast.error(`Failed to fetch users: ${error.message}`);
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

  const fetchUserEvents = async (userId: string) => {
    setLoadingEvents(true);
    try {
      const { events } = await api.adminGetUserEvents(userId);
      setUserEvents(events || []);
    } catch (error: any) {
      console.error("Error fetching user events:", error);
      toast.error(`Failed to fetch events: ${error.message}`);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleViewEvents = async (userId: string) => {
    setSelectedUserId(userId);
    setEventsDialogOpen(true);
    await fetchUserEvents(userId);
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
      `${u.firstName} ${u.lastName}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  if (!isAdmin && !loading) {
    return (
      <div className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You don&apos;t have permission to access this page. Superadmin
            access required.
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
          <h2 className="text-2xl font-bold text-foreground">
            User Management
          </h2>
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
                  <TableRow key={userData.profileId || userData.id}>
                    <TableCell>
                      <div className="font-medium">
                        {userData.firstName && userData.lastName
                          ? `${userData.firstName} ${userData.lastName}`
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
                        {(() => {
                          // Handle both new and old role values for display
                          return userData.role === "superadmin"
                            ? "Superadmin"
                            : "SME Owner";
                        })()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(userData.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewEvents(userData.id)}
                        >
                          <Activity className="w-4 h-4 mr-1" />
                          View Events
                        </Button>
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
            3. Or use the &quot;Make Superadmin&quot; button on an existing user
          </AlertDescription>
        </Alert>
      </div>

      {/* User Events Dialog */}
      <Dialog open={eventsDialogOpen} onOpenChange={setEventsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Event Actions</DialogTitle>
            <DialogDescription>
              Recent activity and events for this user
            </DialogDescription>
          </DialogHeader>
          {loadingEvents ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading events...</p>
            </div>
          ) : userEvents.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                No events found for this user.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {event.actionType?.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {event.entityType && event.entityId ? (
                          <span className="text-sm">
                            {event.entityType}:{" "}
                            {event.entityId.substring(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            -
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            event.status === "success"
                              ? "default"
                              : event.status === "error"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {event.status || "success"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {event.details &&
                        Object.keys(event.details).length > 0 ? (
                          <details className="text-xs">
                            <summary className="cursor-pointer text-primary hover:underline">
                              View details
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-32">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
