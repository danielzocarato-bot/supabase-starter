// Re-enriquece prestadores de uma competência: busca endereço e código IBGE
// para notas com prestador_municipio_ibge nulo, usando cascata BrasilAPI -> ReceitaWS -> IBGE-por-nome.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { enrichPrestador, lookupIbgePorNome, runWithConcurrency } from "../_shared/enrich-prestador.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digitsOnly(v: string): string {
  return (v ?? "").replace(/\D/g, "");
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
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profile?.role !== "escritorio") {
    return json({ ok: false, error: "Apenas escritório pode re-enriquecer." }, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Body inválido." }, 400);
  }
  const competencia_id = String(body?.competencia_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(competencia_id)) {
    return json({ ok: false, error: "competencia_id inválido." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Notas sem IBGE
  const { data: notas, error: notasErr } = await admin
    .from("notas_fiscais")
    .select("id, prestador_cnpj, prestador_municipio, prestador_uf, prestador_endereco")
    .eq("competencia_id", competencia_id)
    .is("prestador_municipio_ibge", null);

  if (notasErr) return json({ ok: false, error: notasErr.message }, 500);
  if (!notas?.length) {
    return json({ ok: true, total_pendentes: 0, atualizadas: 0, sem_dados: 0, detalhes: [] });
  }

  // Agrupa por CNPJ pra fazer 1 lookup por CNPJ
  const grupos = new Map<string, { municipio: string | null; uf: string | null; ids: string[] }>();
  const semCnpj: Array<{ id: string; municipio: string | null; uf: string | null }> = [];
  for (const n of notas) {
    const cnpj = digitsOnly(n.prestador_cnpj ?? "");
    if (cnpj.length !== 14) {
      semCnpj.push({ id: n.id, municipio: n.prestador_municipio, uf: n.prestador_uf });
      continue;
    }
    const g = grupos.get(cnpj) ?? { municipio: n.prestador_municipio, uf: n.prestador_uf, ids: [] };
    g.ids.push(n.id);
    if (!g.municipio) g.municipio = n.prestador_municipio;
    if (!g.uf) g.uf = n.prestador_uf;
    grupos.set(cnpj, g);
  }

  let atualizadas = 0;
  let sem_dados = 0;
  const detalhes: Array<{ cnpj?: string; nota_id?: string; ok: boolean; fonte?: string | null; motivo?: string }> = [];

  // CNPJs em paralelo (limit 4 pra não estourar rate limit da ReceitaWS)
  const cnpjs = Array.from(grupos.keys());
  await runWithConcurrency(cnpjs, 4, async (cnpj) => {
    const g = grupos.get(cnpj)!;
    const r = await enrichPrestador(cnpj, g.municipio, g.uf);
    const patch: Record<string, any> = {};
    if (r.endereco) patch.prestador_endereco = r.endereco;
    if (r.ibge) patch.prestador_municipio_ibge = r.ibge;
    if (r.municipio && !g.municipio) patch.prestador_municipio = r.municipio;
    if (r.uf && !g.uf) patch.prestador_uf = r.uf;

    if (Object.keys(patch).length === 0) {
      sem_dados += g.ids.length;
      detalhes.push({ cnpj, ok: false, motivo: "Nenhuma fonte retornou dados" });
      return;
    }

    const { error } = await admin
      .from("notas_fiscais")
      .update(patch)
      .in("id", g.ids);
    if (error) {
      detalhes.push({ cnpj, ok: false, motivo: error.message });
      return;
    }
    if (r.ibge) atualizadas += g.ids.length;
    else sem_dados += g.ids.length;
    detalhes.push({ cnpj, ok: !!r.ibge, fonte: r.fonte });
  });

  // Notas sem CNPJ válido — tenta resolver IBGE só por nome de município
  for (const s of semCnpj) {
    const ibge = await lookupIbgePorNome(s.municipio, s.uf);
    if (ibge) {
      const { error } = await admin
        .from("notas_fiscais")
        .update({ prestador_municipio_ibge: ibge })
        .eq("id", s.id);
      if (!error) {
        atualizadas++;
        detalhes.push({ nota_id: s.id, ok: true, fonte: "ibge_nome" });
        continue;
      }
    }
    sem_dados++;
    detalhes.push({ nota_id: s.id, ok: false, motivo: "Sem CNPJ e sem município/UF resolvível" });
  }

  return json({
    ok: true,
    total_pendentes: notas.length,
    atualizadas,
    sem_dados,
    detalhes,
  });
});
