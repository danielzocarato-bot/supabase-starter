import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ ok: false, error: "Método não permitido." }, 405);
  }

  // Auth: verifica que o caller é escritório
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "Não autenticado." }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ ok: false, error: "Sessão inválida." }, 401);

  const { data: profile, error: profileErr } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profileErr || profile?.role !== "escritorio") {
    return json({ ok: false, error: "Apenas escritório pode convidar usuários." }, 403);
  }

  let payload: { email?: string; cliente_id?: string; nome?: string; role?: "cliente" | "escritorio" };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "Payload inválido." }, 400);
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  const role = payload.role === "escritorio" ? "escritorio" : "cliente";
  const cliente_id = payload.cliente_id ?? null;
  const nome = (payload.nome ?? "").trim() || null;

  if (!isEmail(email)) return json({ ok: false, error: "Email inválido." }, 400);
  if (role === "cliente" && !cliente_id) {
    return json({ ok: false, error: "cliente_id é obrigatório para convite de cliente." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const origin = req.headers.get("origin") ?? "";
  const redirectTo = origin ? `${origin}/reset-password` : undefined;

  // Helper: localiza user existente por email
  async function buscarUserPorEmail(targetEmail: string): Promise<string | null> {
    let page = 1;
    while (page <= 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error || !data?.users?.length) return null;
      const found = data.users.find((u) => (u.email ?? "").toLowerCase() === targetEmail);
      if (found) return found.id;
      if (data.users.length < 200) return null;
      page++;
    }
    return null;
  }

  let userId: string | null = null;
  let convitePendente = false;

  const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { cliente_id, nome, role },
  });

  if (invErr || !inv?.user) {
    const msg = (invErr?.message ?? "").toLowerCase();
    const jaExiste = msg.includes("already") || msg.includes("registered") || msg.includes("exists");
    if (!jaExiste) {
      return json({ ok: false, error: invErr?.message ?? "Falha ao enviar convite." }, 400);
    }

    // Usuário já existe: localiza, vincula perfil e reenvia link de convite
    userId = await buscarUserPorEmail(email);
    if (!userId) {
      return json({ ok: false, error: "Este email já está em uso, mas não foi possível localizar o usuário." }, 409);
    }

    // Verifica se já está confirmado — se sim, não dá pra reenviar convite
    const { data: existingUser } = await admin.auth.admin.getUserById(userId);
    const jaConfirmado = !!existingUser?.user?.email_confirmed_at;

    if (!jaConfirmado) {
      // Reenvia link de convite
      const { error: linkErr } = await admin.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo, data: { cliente_id, nome, role } },
      });
      if (linkErr) {
        return json({ ok: false, error: `Falha ao reenviar convite: ${linkErr.message}` }, 400);
      }
      convitePendente = true;
    } else {
      // Já confirmado: apenas vincula o perfil (sem reenviar convite)
      convitePendente = false;
    }
  } else {
    userId = inv.user.id;
    convitePendente = true;
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({
      role,
      cliente_id: role === "cliente" ? cliente_id : null,
      ...(nome ? { nome } : {}),
    })
    .eq("id", userId);

  if (updErr) {
    return json({ ok: false, error: `Operação concluída parcialmente: ${updErr.message}` }, 207);
  }

  return json({
    ok: true,
    user_id: userId,
    reenviado: convitePendente,
    ja_confirmado: !convitePendente,
  });
});
