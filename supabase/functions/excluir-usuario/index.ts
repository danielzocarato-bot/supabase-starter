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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "Não autenticado." }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ ok: false, error: "Sessão inválida." }, 401);

  const { data: profile } = await userClient
    .from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  if (profile?.role !== "escritorio") {
    return json({ ok: false, error: "Apenas escritório pode excluir usuários." }, 403);
  }

  let payload: { user_id?: string };
  try { payload = await req.json(); } catch { return json({ ok: false, error: "Payload inválido." }, 400); }

  const userId = payload.user_id;
  if (!userId) return json({ ok: false, error: "user_id é obrigatório." }, 400);

  // Não deixa o usuário excluir a si mesmo
  if (userId === userRes.user.id) {
    return json({ ok: false, error: "Você não pode excluir a si mesmo." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Não permite excluir outro escritório (proteção mínima)
  const { data: alvo } = await admin
    .from("profiles").select("role").eq("id", userId).maybeSingle();
  if (alvo?.role === "escritorio") {
    return json({ ok: false, error: "Não é possível excluir um usuário escritório por aqui." }, 403);
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return json({ ok: false, error: delErr.message }, 400);
  }

  // O profile geralmente é removido em cascata, mas garante limpeza
  await admin.from("profiles").delete().eq("id", userId);

  return json({ ok: true });
});
