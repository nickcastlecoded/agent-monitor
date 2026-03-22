import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import {
  Users as UsersIcon,
  Plus,
  Trash2,
  Shield,
  ShieldCheck,
  UserCircle,
  Mail,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
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
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface UserProfile {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

function authedFetch(method: string, url: string, token: string, body?: any) {
  return fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function RoleBadge({ role }: { role: string }) {
  if (role === "admin") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-mono text-xs gap-1">
        <ShieldCheck className="w-3 h-3" />
        Admin
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-muted text-muted-foreground border-border font-mono text-xs gap-1">
      <Shield className="w-3 h-3" />
      Member
    </Badge>
  );
}

function AddUserDialog({ token }: { token: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await authedFetch("POST", "/api/users", token, {
        email,
        name: name || undefined,
        password,
        role,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User created", description: `${user.name} has been added.` });
      setOpen(false);
      setEmail("");
      setName("");
      setPassword("");
      setRole("member");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-add-user">
          <Plus className="w-4 h-4 mr-1.5" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-sm font-medium">Add User</DialogTitle>
          <DialogDescription className="text-xs">
            Create a new user profile with dashboard access
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-new-user-email"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input
              placeholder="Display name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-new-user-name"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              placeholder="Set a password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-new-user-password"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger data-testid="select-new-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" size="sm">Cancel</Button>
          </DialogClose>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!email || !password || createMutation.isPending}
            data-testid="button-confirm-add-user"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Create User"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const { user: currentUser, token, isAdmin } = useAuth();
  const { toast } = useToast();

  const { data: users, isLoading } = useQuery<UserProfile[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!token && isAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await authedFetch("DELETE", `/api/users/${id}`, token!);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete user");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "User removed" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: number; role: string }) => {
      const res = await authedFetch("PATCH", `/api/users/${id}`, token!, { role });
      if (!res.ok) throw new Error("Failed to update role");
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Role updated", description: `${user.name} is now ${user.role}.` });
    },
  });

  if (!isAdmin) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-3 rounded-full bg-muted mb-4">
              <Shield className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-sm mb-1">Admin access required</h3>
            <p className="text-xs text-muted-foreground max-w-[28ch]">
              Only administrators can manage user profiles.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Users</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage who has access to the dashboard
            </p>
          </div>
          {token && <AddUserDialog token={token} />}
        </div>

        {/* Current User Card */}
        {currentUser && (
          <Card className="border-card-border bg-primary/[0.02]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-full bg-primary/10">
                    <UserCircle className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{currentUser.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={currentUser.role} />
                  <Badge variant="outline" className="text-xs font-mono">You</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users List */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-[68px] rounded-md" />
            ))}
          </div>
        ) : users && users.length > 0 ? (
          <div className="space-y-2">
            {users
              .filter((u) => u.id !== currentUser?.id)
              .map((user) => (
                <Card key={user.id} className="border-card-border" data-testid={`user-card-${user.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-full bg-muted">
                          <UserCircle className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{user.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {user.email}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              Joined {format(new Date(user.createdAt), "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Select
                          value={user.role}
                          onValueChange={(role) => roleMutation.mutate({ id: user.id, role })}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs" data-testid={`select-role-${user.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive h-8"
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-sm">Remove user?</AlertDialogTitle>
                              <AlertDialogDescription className="text-xs">
                                This will remove {user.name} ({user.email}) from the dashboard. They will no longer be able to sign in.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(user.id)}
                                className="text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            {users.filter((u) => u.id !== currentUser?.id).length === 0 && (
              <Card className="border-card-border border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="p-3 rounded-full bg-muted mb-4">
                    <UsersIcon className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium text-sm mb-1">No other users</h3>
                  <p className="text-xs text-muted-foreground max-w-[28ch]">
                    Add team members to give them dashboard access.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border-card-border border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-3 rounded-full bg-muted mb-4">
                <UsersIcon className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-sm mb-1">No other users</h3>
              <p className="text-xs text-muted-foreground max-w-[28ch]">
                Add team members to give them dashboard access.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
