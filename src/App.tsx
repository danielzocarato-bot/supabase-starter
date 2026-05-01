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
import ClientesEscritorio from "./pages/escritorio/Clientes";
import NovoCliente from "./pages/escritorio/NovoCliente";
import DetalheCliente from "./pages/escritorio/DetalheCliente";
import ImportarPlanilha from "./pages/escritorio/ImportarPlanilha";
import Usuarios from "./pages/escritorio/Usuarios";
import ClienteCompetencias from "./pages/cliente/Competencias";
import Classificacao from "./pages/Classificacao";
import Placeholder from "./pages/Placeholder";
import Unsubscribe from "./pages/Unsubscribe";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Routes>
              <Route path="/" element={<Navigate to="/login" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />

              <Route path="/app/escritorio" element={<RequireRole role="escritorio"><DashboardEscritorio /></RequireRole>} />
              <Route path="/app/escritorio/clientes" element={<RequireRole role="escritorio"><ClientesEscritorio /></RequireRole>} />
              <Route path="/app/escritorio/clientes/novo" element={<RequireRole role="escritorio"><NovoCliente /></RequireRole>} />
              <Route path="/app/escritorio/clientes/:id" element={<RequireRole role="escritorio"><DetalheCliente /></RequireRole>} />
              <Route path="/app/escritorio/importar" element={<RequireRole role="escritorio"><ImportarPlanilha /></RequireRole>} />
              <Route path="/app/escritorio/competencias/:id" element={<RequireRole role="escritorio"><Classificacao /></RequireRole>} />
              <Route path="/app/cliente/competencias/:id" element={<RequireRole role="cliente"><Classificacao /></RequireRole>} />
              <Route path="/app/escritorio/usuarios" element={<RequireRole role="escritorio"><Usuarios /></RequireRole>} />
              <Route path="/app/escritorio/configuracoes" element={<RequireRole role="escritorio"><Placeholder titulo="Configurações" /></RequireRole>} />

              <Route path="/app/cliente" element={<RequireRole role="cliente"><ClienteCompetencias /></RequireRole>} />
              <Route path="/app/cliente/cadastro" element={<RequireRole role="cliente"><Placeholder titulo="Meu Cadastro" /></RequireRole>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
