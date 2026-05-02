import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "Content-Disposition",
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

function digitsOnly(s: string | null | undefined): string {
  return (s ?? "").toString().replace(/\D/g, "");
}

function formatCnpjMask(digits: string): string {
  const d = (digits ?? "").replace(/\D/g, "");
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return digits ?? "";
}

function parseNum(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  // tenta interpretar string: pode vir "1.234,56" ou "1234.56"
  const s = String(v).trim();
  if (s === "") return 0;
  // se contém vírgula, assume formato BR
  if (s.includes(",")) {
    const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatDecimalBR(v: any, casas = 2): string {
  const n = parseNum(v);
  return n.toFixed(casas).replace(".", ",");
}

function formatInt(v: any): string {
  if (v == null || v === "") return "0";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.trunc(v)) : "0";
  const s = String(v).trim();
  // remove zeros à esquerda mas mantém pelo menos 1 dígito
  const m = s.match(/-?\d+/);
  if (!m) return "0";
  const n = parseInt(m[0], 10);
  return Number.isFinite(n) ? String(n) : "0";
}

function formatTexto(v: any): string {
  if (v == null) return "";
  return String(v).replace(/[;\r\n\t]/g, " ").trim();
}

function aspaTexto(v: any): string {
  const s = formatTexto(v);
  const escaped = s.replace(/"/g, '""');
  return `"${escaped}"`;
}

function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function pickSerie(raw: any): string {
  if (!raw || typeof raw !== "object") return "1";
  const cand =
    raw.serie ??
    raw?.ide?.serie ??
    raw?.nfe?.ide?.serie ??
    raw?.infNFe?.ide?.serie ??
    null;
  const s = (cand ?? "").toString().trim();
  return s.length > 0 ? s : "1";
}

async function sha256Hex(content: string | Uint8Array): Promise<string> {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// CP1252 / Latin-1 (mesma estratégia do gerar-txt-dominio)
function toLatin1Bytes(s: string): Uint8Array {
  const normalizado = s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const bytes = new Uint8Array(normalizado.length);
  for (let i = 0; i < normalizado.length; i++) {
    const code = normalizado.charCodeAt(i);
    bytes[i] = code < 256 ? code : 0x3F;
  }
  return bytes;
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

  const { data: profile, error: profileErr } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profileErr || profile?.role !== "escritorio") {
    return json({ ok: false, error: "Apenas escritório pode exportar." }, 403);
  }

  // Body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Payload inválido (esperado JSON)." }, 400);
  }
  const competencia_id = String(body?.competencia_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(competencia_id)) {
    return json({ ok: false, error: "competencia_id inválido." }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Carrega competência + cliente
  const { data: comp, error: compErr } = await admin
    .from("competencias")
    .select(
      "id, periodo, status, tipo, cliente_id, clientes:cliente_id ( id, cnpj, razao_social )",
    )
    .eq("id", competencia_id)
    .maybeSingle();
  if (compErr || !comp) return json({ ok: false, error: "Competência não encontrada." }, 404);

  const cliente: any = (comp as any).clientes;
  if (!cliente) return json({ ok: false, error: "Cliente da competência não encontrado." }, 404);

  // 2. Status
  if (comp.status === "aberta") {
    return json(
      { ok: false, error: "A competência precisa estar concluída antes de exportar." },
      400,
    );
  }

  // 3. Tipo
  if (comp.tipo !== "nfe_entrada" && comp.tipo !== "nfe_saida") {
    return json(
      {
        ok: false,
        error:
          "Esta competência usa o leiaute Domínio 18 (NFSe). Use a função correspondente.",
      },
      400,
    );
  }

  // 4. cliente_operacoes — layout configurado
  const { data: op, error: opErr } = await admin
    .from("cliente_operacoes")
    .select("layout_export, ativo")
    .eq("cliente_id", cliente.id)
    .eq("tipo", comp.tipo)
    .maybeSingle();
  if (opErr) {
    return json({ ok: false, error: `Falha ao carregar configuração do cliente: ${opErr.message}` }, 500);
  }
  if (!op || op.ativo === false) {
    return json(
      { ok: false, error: "Este cliente não tem este tipo de operação habilitado." },
      400,
    );
  }
  if (op.layout_export !== "dominio_separador") {
    return json(
      {
        ok: false,
        error: `Layout de exportação configurado é "${op.layout_export}", esperado "dominio_separador".`,
      },
      400,
    );
  }

  // 5. CNPJ cliente
  const cnpjEmpresa = digitsOnly(cliente.cnpj);
  if (cnpjEmpresa.length !== 14) {
    return json({ ok: false, error: "O CNPJ do cliente precisa ter 14 dígitos para exportação." }, 400);
  }

  // Notas
  const { data: notas, error: notasErr } = await admin
    .from("notas_fiscais")
    .select(
      "id, numero_nfe, chave_nfe, emissao_nfe, prestador_cnpj, prestador_razao, prestador_uf, prestador_municipio, prestador_endereco, raw_data, tipo_operacao_nfe, cancelada",
    )
    .eq("competencia_id", competencia_id)
    .eq("cancelada", false)
    .eq("tipo_documento", "nfe")
    .order("emissao_nfe", { ascending: true });
  if (notasErr) return json({ ok: false, error: `Falha ao carregar notas: ${notasErr.message}` }, 500);

  if (!notas || notas.length === 0) {
    return json({ ok: false, error: "Não há notas NFe para exportar nesta competência." }, 400);
  }

  const notaIds = notas.map((n) => n.id);

  // Itens (paginado)
  const itensAll: any[] = [];
  const CHUNK = 100;
  for (let i = 0; i < notaIds.length; i += CHUNK) {
    const slice = notaIds.slice(i, i + CHUNK);
    const { data: itens, error: itensErr } = await admin
      .from("notas_fiscais_itens")
      .select(
        "id, nota_id, numero_item, codigo_produto, descricao_produto, ncm, cfop, valor, raw_data, acumulador_id, acumuladores:acumulador_id ( codigo )",
      )
      .in("nota_id", slice)
      .order("numero_item", { ascending: true });
    if (itensErr) {
      return json({ ok: false, error: `Falha ao carregar itens: ${itensErr.message}` }, 500);
    }
    if (itens) itensAll.push(...itens);
  }

  // Index notas por id
  const notaById = new Map<string, any>();
  for (const n of notas) notaById.set(n.id, n);

  // Pendências de classificação
  const pendentes: string[] = [];
  for (const it of itensAll) {
    if (!it.acumulador_id) {
      const n = notaById.get(it.nota_id);
      pendentes.push(
        `NF ${n?.numero_nfe ?? "?"} item ${it.numero_item ?? "?"} - ${
          it.descricao_produto ?? "Produto sem descrição"
        } (${n?.prestador_razao ?? "Sem parceiro"})`,
      );
    }
  }
  if (pendentes.length > 0) {
    return json(
      {
        ok: false,
        error: "Há itens pendentes de classificação.",
        pendentes,
        tipo_pendencia: "classificacao",
      },
      400,
    );
  }

  // Agrupa itens por nota
  const itensPorNota = new Map<string, any[]>();
  for (const it of itensAll) {
    const arr = itensPorNota.get(it.nota_id) ?? [];
    arr.push(it);
    itensPorNota.set(it.nota_id, arr);
  }

  // Geração — 1 linha por item, 33 campos, separador ;
  const linhas: string[] = [];

  for (const n of notas) {
    const itens = itensPorNota.get(n.id) ?? [];
    if (itens.length === 0) continue;

    const cnpjPrestador = formatCnpjMask(n.prestador_cnpj ?? "");
    const razaoSocial = formatTexto(n.prestador_razao);
    const uf = formatTexto(n.prestador_uf);
    const municipio = formatTexto(n.prestador_municipio);
    const endereco = formatTexto(n.prestador_endereco);
    const numDoc = formatTexto(n.numero_nfe);
    const serie = formatTexto(pickSerie(n.raw_data));
    const dataEmi = formatDateBR(n.emissao_nfe);
    const situacao = n.cancelada ? "2" : "0";

    for (const it of itens) {
      const codAcum = String(it.acumuladores?.codigo ?? "0").trim();
      const cfop = formatInt(it.cfop);

      const prod = it.raw_data?.produto ?? {};
      const icms = it.raw_data?.icms ?? {};
      const ipi = it.raw_data?.ipi ?? {};
      const pis = it.raw_data?.pis ?? {};
      const cofins = it.raw_data?.cofins ?? {};

      const valorProdRaw = prod.vProd ?? it.valor;
      const valorDescRaw = prod.vDesc ?? 0;
      const valorProd = formatDecimalBR(valorProdRaw);
      const valorDesc = formatDecimalBR(valorDescRaw);
      const valorContabil = formatDecimalBR(parseNum(valorProdRaw) - parseNum(valorDescRaw));

      const codItem = formatTexto(it.codigo_produto);
      const qtde = formatDecimalBR(prod.qCom ?? 0, 4);
      const valorUnit = formatDecimalBR(prod.vUnCom ?? 0, 4);

      const campos = [
        aspaTexto(cnpjPrestador),                          // 1  C
        aspaTexto(razaoSocial),                            // 2  C
        aspaTexto(uf),                                     // 3  C
        aspaTexto(municipio),                              // 4  C
        aspaTexto(endereco),                               // 5  C
        aspaTexto(numDoc),                                 // 6  G
        aspaTexto(serie),                                  // 7  C
        aspaTexto(dataEmi),                                // 8  D
        situacao,                                          // 9  N
        formatInt(codAcum),                                // 10 N
        cfop,                                              // 11 N
        valorProd,                                         // 12 R
        valorDesc,                                         // 13 R
        valorContabil,                                     // 14 R
        formatDecimalBR(icms.vBC ?? 0),                    // 15 R
        formatDecimalBR(icms.pICMS ?? 0),                  // 16 R
        formatDecimalBR(icms.vICMS ?? 0),                  // 17 R
        "0",                                               // 18 R
        "0",                                               // 19 R
        formatDecimalBR(ipi.vBC ?? 0),                     // 20 R
        formatDecimalBR(ipi.pIPI ?? 0),                    // 21 R
        formatDecimalBR(ipi.vIPI ?? 0),                    // 22 R
        "0",                                               // 23 R
        "0",                                               // 24 R
        aspaTexto(codItem),                                // 25 C
        qtde,                                              // 26 R
        valorUnit,                                         // 27 R
        formatInt(pis.CST ?? cofins.CST ?? 0),             // 28 N
        formatDecimalBR(pis.vBC ?? cofins.vBC ?? 0),       // 29 R
        formatDecimalBR(pis.pPIS ?? 0),                    // 30 R
        formatDecimalBR(pis.vPIS ?? 0),                    // 31 R
        formatDecimalBR(cofins.pCOFINS ?? 0),              // 32 R
        formatDecimalBR(cofins.vCOFINS ?? 0),              // 33 R
      ];

      linhas.push(campos.join(";"));
    }
  }

  const conteudo = linhas.join("\r\n") + "\r\n";
  const bytes = toLatin1Bytes(conteudo);

  // Atualiza status
  const { error: updErr } = await admin
    .from("competencias")
    .update({ status: "exportada", exportada_em: new Date().toISOString() })
    .eq("id", competencia_id);
  if (updErr) {
    return json({ ok: false, error: `Falha ao atualizar status: ${updErr.message}` }, 500);
  }

  const isEntrada = comp.tipo === "nfe_entrada";
  const tipoSuffix = isEntrada ? "entrada" : "saida";
  const filename = `dominio_nfe_${cnpjEmpresa}_${comp.periodo}_${tipoSuffix}.txt`;

  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=windows-1252",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
