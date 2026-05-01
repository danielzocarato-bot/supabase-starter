import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { RequireRole } from "@/components/RequireRole";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import DashboardEscritorio from "./pages/escritorio/Dashboard";
import ClienteCompetencias from "./pages/cliente/Competencias";
import Placeholder from "./pages/Placeholder";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="/app/escritorio" element={<RequireRole role="escritorio"><DashboardEscritorio /></RequireRole>} />
              <Route path="/app/escritorio/clientes" element={<RequireRole role="escritorio"><Placeholder titulo="Clientes" descricao="Lista e gestão de clientes." /></RequireRole>} />
              <Route path="/app/escritorio/importar" element={<RequireRole role="escritorio"><Placeholder titulo="Importar Planilha" /></RequireRole>} />
              <Route path="/app/escritorio/usuarios" element={<RequireRole role="escritorio"><Placeholder titulo="Usuários" /></RequireRole>} />
              <Route path="/app/escritorio/configuracoes" element={<RequireRole role="escritorio"><Placeholder titulo="Configurações" /></RequireRole>} />

              <Route path="/app/cliente" element={<RequireRole role="cliente"><ClienteCompetencias /></RequireRole>} />
              <Route path="/app/cliente/cadastro" element={<RequireRole role="cliente"><Placeholder titulo="Meu Cadastro" /></RequireRole>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
