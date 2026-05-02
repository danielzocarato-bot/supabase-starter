import { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { AcruxLogo } from "@/components/AcruxLogo";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Upload, Settings, LogOut, Moon, Sun, FileText, UserCircle, FileCode2,
} from "lucide-react";

interface NavItem { to: string; label: string; icon: any; }

const navEscritorio: NavItem[] = [
  { to: "/app/escritorio", label: "Dashboard", icon: LayoutDashboard },
  { to: "/app/escritorio/clientes", label: "Clientes", icon: Users },
  { to: "/app/escritorio/importar", label: "Importar Planilha", icon: Upload },
  { to: "/app/escritorio/importar-xmls", label: "Importar XMLs", icon: FileCode2 },
  { to: "/app/escritorio/usuarios", label: "Usuários", icon: UserCircle },
  { to: "/app/escritorio/configuracoes", label: "Configurações", icon: Settings },
];

const navCliente: NavItem[] = [
  { to: "/app/cliente", label: "Minhas Competências", icon: FileText },
  { to: "/app/cliente/cadastro", label: "Meu Cadastro", icon: UserCircle },
];

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const loc = useLocation();
  const items = profile?.role === "escritorio" ? navEscritorio : navCliente;

  const handleLogout = async () => {
    await signOut();
    nav("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Sidebar */}
      <aside className="w-[260px] flex-shrink-0 bg-card border-r border-border flex flex-col">
        <div className="h-16 px-5 flex items-center border-b border-border">
          <AcruxLogo />
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {items.map((item) => {
            const active = loc.pathname === item.to || (item.to !== "/app/escritorio" && item.to !== "/app/cliente" && loc.pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/app/escritorio" || item.to === "/app/cliente"}
                className={({ isActive }) => {
                  const isAct = isActive || active;
                  return `relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isAct
                      ? "bg-brand-soft text-brand"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  }`;
                }}
              >
                {({ isActive }) => (
                  <>
                    {(isActive || active) && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-brand" />
                    )}
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <div className="px-3 py-2">
            <p className="text-sm font-medium truncate">{profile?.nome || profile?.email}</p>
            <p className="text-xs text-muted-foreground capitalize">{profile?.role}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={toggle} className="flex-1 justify-start text-muted-foreground hover:text-foreground">
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              <span className="text-xs">{theme === "light" ? "Escuro" : "Claro"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-danger" aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-card border-b border-border flex items-center px-8">
          <span className="text-sm text-muted-foreground capitalize">
            {loc.pathname.split("/").filter(Boolean).slice(1).join(" / ") || "Início"}
          </span>
        </header>
        <main className="flex-1 px-8 py-6 max-w-screen-2xl w-full mx-auto">
          <motion.div
            key={loc.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
};
