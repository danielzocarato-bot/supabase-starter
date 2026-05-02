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
function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
function escapeForPipe(s: string | null | undefined): string {
  return (s ?? "").toString().replace(/[|\r\n\t]/g, " ").trim();
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
      "id, numero_nfe, chave_nfe, emissao_nfe, prestador_cnpj, prestador_razao, raw_data, tipo_operacao_nfe",
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

  // Itens (paginado para evitar limite de 1000)
  const itensAll: any[] = [];
  const CHUNK = 100;
  for (let i = 0; i < notaIds.length; i += CHUNK) {
    const slice = notaIds.slice(i, i + CHUNK);
    const { data: itens, error: itensErr } = await admin
      .from("notas_fiscais_itens")
      .select(
        "id, nota_id, numero_item, codigo_produto, descricao_produto, ncm, cfop, valor, acumulador_id, acumuladores:acumulador_id ( codigo )",
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

  // Geração
  const isEntrada = comp.tipo === "nfe_entrada";
  const regParceiro = isEntrada ? "0020" : "0010";
  const regLanc = isEntrada ? "0200" : "0300";

  const linhas: string[] = [];

  // 0000
  linhas.push(`0000|${cnpjEmpresa}|`);

  // 0010/0020 — parceiros (dedup por CNPJ)
  const parceirosVistos = new Set<string>();
  for (const n of notas) {
    const cnpjP = digitsOnly(n.prestador_cnpj);
    if (!cnpjP || parceirosVistos.has(cnpjP)) continue;
    parceirosVistos.add(cnpjP);
    const razao = escapeForPipe(n.prestador_razao);
    const razaoTrunc = razao.slice(0, 40);
    linhas.push(`${regParceiro}|${cnpjP}|${razao}|${razaoTrunc}|`);
  }

  // 0100 — produtos (dedup por codigo_produto, primeiro CFOP observado)
  const produtosVistos = new Map<string, { descricao: string; ncm: string; cfop: string }>();
  for (const it of itensAll) {
    const cod = escapeForPipe(it.codigo_produto);
    if (!cod) continue;
    if (produtosVistos.has(cod)) continue;
    produtosVistos.set(cod, {
      descricao: escapeForPipe(it.descricao_produto),
      ncm: escapeForPipe(it.ncm),
      cfop: escapeForPipe(it.cfop),
    });
  }
  for (const [cod, info] of produtosVistos) {
    linhas.push(`0100|${cod}|${info.descricao}|${info.ncm}|${info.cfop}|`);
  }

  // 0200/0300 — itens em ordem de emissão da nota
  // Reordena itens conforme ordem das notas (já ordenadas por emissao_nfe asc)
  const itensPorNota = new Map<string, any[]>();
  for (const it of itensAll) {
    const arr = itensPorNota.get(it.nota_id) ?? [];
    arr.push(it);
    itensPorNota.set(it.nota_id, arr);
  }

  for (const n of notas) {
    const itens = itensPorNota.get(n.id) ?? [];
    if (itens.length === 0) continue;
    const serie = escapeForPipe(pickSerie(n.raw_data));
    const numero = escapeForPipe(n.numero_nfe);
    const dataEmi = formatDateBR(n.emissao_nfe);
    const cnpjP = digitsOnly(n.prestador_cnpj);
    const chave = escapeForPipe(n.chave_nfe);

    for (const it of itens) {
      const cfop = escapeForPipe(it.cfop);
      const valor = Number(it.valor ?? 0).toFixed(2);
      const codAcum = String(it.acumuladores?.codigo ?? "").trim();
      linhas.push(
        `${regLanc}|${serie}|${numero}|${dataEmi}|${cnpjP}|${cfop}|${valor}|${codAcum}|${chave}|`,
      );
    }
  }

  const conteudo = linhas.join("\n") + "\n";

  // Atualiza status
  const { error: updErr } = await admin
    .from("competencias")
    .update({ status: "exportada", exportada_em: new Date().toISOString() })
    .eq("id", competencia_id);
  if (updErr) {
    return json({ ok: false, error: `Falha ao atualizar status: ${updErr.message}` }, 500);
  }

  const tipoSuffix = isEntrada ? "entrada" : "saida";
  const filename = `dominio_nfe_${cnpjEmpresa}_${comp.periodo}_${tipoSuffix}.txt`;

  return new Response(conteudo, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
