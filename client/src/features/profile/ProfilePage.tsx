import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { KeyRound, LogOut, Save } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/ui/toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
} from "@/components/ui/primitives";

export default function ProfilePage() {
  const { user, refreshUser, logoutAll } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const saveProfile = useMutation({
    mutationFn: async () =>
      (
        await api.patch("/users/me/profile", {
          name: name.trim(),
          email: email.trim() || null,
        })
      ).data,
    onSuccess: async () => {
      await refreshUser();
      toast.success("Profile updated");
    },
    onError: (err) => toast.error("Save failed", errorMessage(err)),
  });

  const changePassword = useMutation({
    mutationFn: async () =>
      (await api.post("/auth/change-password", { currentPassword, newPassword })).data,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      toast.success("Password changed");
    },
    onError: (err) => toast.error("Change failed", errorMessage(err)),
  });

  const passwordMismatch = confirm.length > 0 && newPassword !== confirm;

  return (
    <div className="animate-fade-in">
      <PageHeader title="My Profile" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar name={user?.name ?? "?"} src={user?.avatarUrl} size={64} />
              <div>
                <p className="font-semibold">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.mobile}</p>
                <Badge color="#3B82F6" className="mt-1">{user?.role.name}</Badge>
              </div>
            </div>
            <div>
              <Label htmlFor="pf-name">Name</Label>
              <Input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="pf-email">Email</Label>
              <Input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => saveProfile.mutate()}
                loading={saveProfile.isPending}
                disabled={name.trim().length < 2}
              >
                <Save className="h-4 w-4" /> Save
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Security</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pf-current">Current Password</Label>
              <Input
                id="pf-current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pf-new">New Password</Label>
              <Input
                id="pf-new"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              {newPassword.length > 0 && newPassword.length < 8 && (
                <p className="mt-1 text-xs text-destructive">At least 8 characters</p>
              )}
            </div>
            <div>
              <Label htmlFor="pf-confirm">Confirm New Password</Label>
              <Input
                id="pf-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {passwordMismatch && (
                <p className="mt-1 text-xs text-destructive">Passwords do not match</p>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                loading={changePassword.isPending}
                disabled={!currentPassword || newPassword.length < 8 || newPassword !== confirm}
                onClick={() => changePassword.mutate()}
              >
                <KeyRound className="h-4 w-4" /> Change Password
              </Button>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm font-semibold">Active sessions</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Signing out everywhere revokes every refresh token issued for your account.
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-3"
                onClick={() => logoutAll().then(() => navigate("/login"))}
              >
                <LogOut className="h-4 w-4" /> Logout from all devices
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
