import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { digitsOnly } from "../_shared/nfe-parser.ts";
import { processarXmls } from "../_shared/nfe-import.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;

const SIEG_URL = "https://api.sieg.com/BaixarXmls";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ultimoDiaMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

interface SiegBody {
  XmlType: number;
  Take: number;
  Skip: number;
  DataEmissaoInicio?: string;
  DataEmissaoFim?: string;
  DataUploadInicio?: string;
  DataUploadFim?: string;
  CnpjEmit?: string;
  CnpjDest?: string;
  Downloadevent?: boolean;
}

async function fetchSiegBatch(
  apiKey: string,
  body: SiegBody,
): Promise<string[]> {
  // SIEG espera api_key na querystring (formato oficial da doc)
  const url = `${SIEG_URL}?api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    let parsed: any;
    try { parsed = JSON.parse(errText); } catch { /* ignore */ }
    const msg = parsed?.message ?? errText ?? `HTTP ${res.status}`;
    throw new Error(`SIEG: ${msg}`);
  }

  let text = await res.text();
  if (text.startsWith('"') && text.endsWith('"')) {
    text = text.slice(1, -1);
  }
  if (!text.trim()) return [];

  const parts = text.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  const xmls: string[] = [];
  for (const p of parts) {
    try {
      const binary = atob(p);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const xml = new TextDecoder("utf-8").decode(bytes);
      xmls.push(xml);
    } catch (e) {
      console.error("[buscar-xmls-sieg] Falha ao decodificar XML base64:", e);
    }
  }
  return xmls;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido." }, 405);

  // Auth
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
    return json({ ok: false, error: "Apenas escritório pode buscar XMLs no SIEG." }, 403);
  }

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Payload JSON inválido." }, 400);
  }

  const cliente_id = String(body?.cliente_id ?? "").trim();
  const tipo = String(body?.tipo ?? "").trim();
  const periodo = String(body?.periodo ?? "").trim();
  const filtro = String(body?.filtro ?? "emissao").trim();

  if (!/^[0-9a-f-]{36}$/i.test(cliente_id)) return json({ ok: false, error: "cliente_id inválido." }, 400);
  if (tipo !== "nfe_entrada" && tipo !== "nfe_saida") {
    return json({ ok: false, error: "Tipo deve ser nfe_entrada ou nfe_saida." }, 400);
  }
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return json({ ok: false, error: "Período deve estar no formato AAAA-MM." }, 400);
  }
  if (filtro !== "emissao" && filtro !== "upload") {
    return json({ ok: false, error: "Filtro deve ser 'emissao' ou 'upload'." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Carrega API key
  const { data: cfg } = await admin
    .from("configuracoes_escritorio")
    .select("sieg_api_key")
    .eq("id", 1)
    .maybeSingle();
  const apiKey = (cfg?.sieg_api_key ?? "").trim();
  if (!apiKey) {
    return json({
      ok: false,
      error: "API Key SIEG não configurada. Configure em Configurações → Escritório.",
    }, 400);
  }

  // Carrega cliente
  const { data: cliente, error: cliErr } = await admin
    .from("clientes")
    .select("id, cnpj")
    .eq("id", cliente_id)
    .maybeSingle();
  if (cliErr || !cliente) return json({ ok: false, error: "Cliente não encontrado." }, 404);

  const cnpjCliente = digitsOnly(cliente.cnpj);
  if (cnpjCliente.length !== 14) {
    return json({ ok: false, error: "Cliente sem CNPJ válido cadastrado." }, 400);
  }

  // Verifica operação ativa
  const { data: op } = await admin
    .from("cliente_operacoes")
    .select("tipo")
    .eq("cliente_id", cliente_id)
    .eq("tipo", tipo)
    .eq("ativo", true)
    .maybeSingle();
  if (!op) {
    return json({ ok: false, error: "O cliente não está configurado para esse tipo de operação." }, 400);
  }

  // Calcula range de datas
  const [anoStr, mesStr] = periodo.split("-");
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);
  const ultimoDia = ultimoDiaMes(ano, mes);
  const dataInicio = `${anoStr}-${mesStr}-01`;
  const dataFim = `${anoStr}-${mesStr}-${String(ultimoDia).padStart(2, "0")}`;

  const isEntrada = tipo === "nfe_entrada";
  const baseBody: SiegBody = {
    XmlType: 1, // NF-e
    Take: 50,
    Skip: 0,
    Downloadevent: false,
  };
  if (filtro === "upload") {
    baseBody.DataUploadInicio = dataInicio;
    baseBody.DataUploadFim = dataFim;
  } else {
    baseBody.DataEmissaoInicio = dataInicio;
    baseBody.DataEmissaoFim = dataFim;
  }
  if (isEntrada) baseBody.CnpjDest = cnpjCliente;
  else baseBody.CnpjEmit = cnpjCliente;

  console.log(`[buscar-xmls-sieg] Iniciando busca cliente=${cliente_id} tipo=${tipo} periodo=${periodo} filtro=${filtro}`);

  // Loop de paginação
  const todosXmls: Array<{ content: string }> = [];
  let skip = 0;
  const MAX_PAGES = 100;

  for (let page = 0; page < MAX_PAGES; page++) {
    const reqBody = { ...baseBody, Skip: skip };
    let lote: string[] = [];
    try {
      lote = await fetchSiegBatch({ apiKey, email, password }, reqBody);
    } catch (e: any) {
      if (page === 0) {
        console.error("[buscar-xmls-sieg] Falha primeira chamada:", e?.message);
        // Erros 404 do SIEG quando não há nenhuma nota
        const msg = String(e?.message ?? "");
        if (/sem.*registros|nenhum|not.*found|404/i.test(msg)) {
          return json({
            ok: false,
            error: "Nenhum XML encontrado no SIEG para os filtros informados.",
          }, 404);
        }
        return json({ ok: false, error: e?.message ?? "Falha SIEG." }, 502);
      }
      console.error(`[buscar-xmls-sieg] Falha página ${page}:`, e?.message);
      break;
    }
    todosXmls.push(...lote.map((c) => ({ content: c })));
    console.log(`[buscar-xmls-sieg] Página ${page} skip=${skip} recebidos=${lote.length} total=${todosXmls.length}`);
    if (lote.length < 50) break;
    skip += 50;
    // Rate limit guard SIEG (20 req/min)
    await new Promise((r) => setTimeout(r, 200));
  }

  if (todosXmls.length === 0) {
    return json({
      ok: false,
      error: "Nenhum XML encontrado no SIEG para os filtros informados.",
    }, 404);
  }

  const total_baixados = todosXmls.length;

  try {
    const result = await processarXmls(admin, {
      cliente_id,
      cliente: { cnpj: cnpjCliente },
      periodo,
      tipo: tipo as "nfe_entrada" | "nfe_saida",
      xmls: todosXmls,
      arquivo_origem: `sieg/${cliente_id}/${periodo}/`,
    });

    return json({
      ok: true,
      fonte: "sieg",
      total_baixados,
      ...result,
    });
  } catch (e: any) {
    console.error("[buscar-xmls-sieg] Falha processarXmls:", e);
    return json({ ok: false, error: e?.message ?? "Falha ao processar XMLs do SIEG." }, 500);
  }
});
