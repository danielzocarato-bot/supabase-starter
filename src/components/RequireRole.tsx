import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, Role } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { AppShell } from "./AppShell";

export const RequireRole = ({ role, children }: { role: Role; children: ReactNode }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role !== role) {
    return <Navigate to={profile.role === "escritorio" ? "/app/escritorio" : "/app/cliente"} replace />;
  }
  return <AppShell>{children}</AppShell>;
};
