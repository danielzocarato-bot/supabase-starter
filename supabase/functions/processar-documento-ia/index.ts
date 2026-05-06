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
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);
const MAX_BYTES = 5 * 1024 * 1024;
const CATEGORIAS = new Set(["boleto", "fatura", "apolice"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digitsOnly(v: unknown): string | null {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function inferMime(name: string, type: string): string {
  if (type && ALLOWED_MIME.has(type)) return type;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return type || "application/octet-stream";
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(bin);
}

const SYSTEM_PROMPT =
  `Você é um assistente especialista em extrair dados estruturados de documentos brasileiros (boletos, faturas e apólices de seguro) para lançamento contábil. Extraia APENAS o que estiver visivelmente presente no documento. Se um campo não estiver claramente presente, retorne null. Não invente valores.`;

const USER_PROMPT_TEMPLATES: Record<string, string> = {
  boleto: `Este é um BOLETO bancário. Extraia os campos abaixo e retorne em JSON.
Campos a extrair:
- cnpj_beneficiario (string, apenas dígitos): CNPJ ou CPF do beneficiário (quem recebe)
- razao_beneficiario (string): nome/razão social do beneficiário
- uf_beneficiario (string, 2 letras): UF do beneficiário se aparecer
- municipio_beneficiario (string)
- endereco_beneficiario (string)
- numero_documento (string): número do título/documento
- data_emissao (string AAAA-MM-DD): data de emissão do boleto
- data_vencimento (string AAAA-MM-DD): data de vencimento
- valor (number): valor do boleto (se houver desconto, use o valor final a pagar)
- descricao (string): linha "histórico" ou descrição da cobrança, se houver. Se não, monte algo como "Boleto - Pagamento referente a [número/serviço]"
- cfop (string, 4 dígitos): se aparecer no documento, senão null
Retorne JSON puro, sem markdown.`,
  fatura: `Esta é uma FATURA (energia, telefone, internet, etc — NÃO é nota fiscal eletrônica). Extraia os campos abaixo.
Campos a extrair:
- cnpj_emitente (string, apenas dígitos)
- razao_emitente (string)
- uf_emitente, municipio_emitente, endereco_emitente
- numero_documento (string)
- data_emissao (string AAAA-MM-DD)
- data_vencimento (string AAAA-MM-DD)
- valor (number): valor TOTAL da fatura (após descontos, antes de juros/multa por atraso)
- descricao (string): tipo de serviço (ex: "Conta de energia elétrica - Mês de referência 03/2026")
- valor_icms (number): se aparecer ICMS no documento, valor; senão null
- aliquota_icms (number): alíquota ICMS se aparecer
- cfop (string): se aparecer
- valor_pis, valor_cofins (number): se aparecerem
Retorne JSON puro, sem markdown.`,
  apolice: `Esta é uma APÓLICE DE SEGURO. Extraia os campos abaixo.
Campos a extrair:
- cnpj_seguradora (string, apenas dígitos)
- razao_seguradora (string)
- uf_seguradora, municipio_seguradora, endereco_seguradora
- numero_apolice (string)
- data_emissao (string AAAA-MM-DD)
- data_inicio_vigencia (string AAAA-MM-DD)
- data_fim_vigencia (string AAAA-MM-DD)
- valor_premio (number): valor TOTAL do prêmio (incluindo IOF)
- valor_iof (number): IOF separadamente, se discriminado
- descricao (string): "Seguro [tipo] - Apólice [número] - Vigência [início] a [fim]"
Retorne JSON puro, sem markdown.`,
};

async function extrairComIA(
  categoria: string,
  mime: string,
  b64: string,
): Promise<{ ok: true; data: any } | { ok: false; status: number; error: string }> {
  const aiResponse = await fetch(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: USER_PROMPT_TEMPLATES[categoria] },
              {
                type: "image_url",
                image_url: { url: `data:${mime};base64,${b64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    },
  );

  if (aiResponse.status === 429) {
    return {
      ok: false,
      status: 429,
      error:
        "Limite de processamento de IA atingido. Tente novamente em alguns instantes.",
    };
  }
  if (aiResponse.status === 402) {
    return {
      ok: false,
      status: 402,
      error: "Créditos de IA esgotados no workspace.",
    };
  }
  if (!aiResponse.ok) {
    const txt = await aiResponse.text().catch(() => "");
    console.error("[processar-documento-ia] IA error", aiResponse.status, txt);
    return {
      ok: false,
      status: 500,
      error: `IA respondeu erro ${aiResponse.status}.`,
    };
  }

  const aiData = await aiResponse.json();
  const raw = aiData?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { ok: true, data: parsed };
  } catch (e) {
    console.error("[processar-documento-ia] JSON parse fail", raw);
    return {
      ok: false,
      status: 500,
      error: "Resposta da IA não é JSON válido.",
    };
  }
}

function normalizar(categoria: string, extraido: any) {
  const cnpj = extraido.cnpj_beneficiario ?? extraido.cnpj_emitente ??
    extraido.cnpj_seguradora ?? null;
  const razao = extraido.razao_beneficiario ?? extraido.razao_emitente ??
    extraido.razao_seguradora ?? null;
  const uf = extraido.uf_beneficiario ?? extraido.uf_emitente ??
    extraido.uf_seguradora ?? null;
  const municipio = extraido.municipio_beneficiario ??
    extraido.municipio_emitente ?? extraido.municipio_seguradora ?? null;
  const endereco = extraido.endereco_beneficiario ??
    extraido.endereco_emitente ?? extraido.endereco_seguradora ?? null;
  const numero = extraido.numero_documento ?? extraido.numero_apolice ?? null;
  const dataEmissao = extraido.data_emissao ?? null;
  const dataVencimento = extraido.data_vencimento ??
    extraido.data_fim_vigencia ?? null;
  const valor = Number(extraido.valor ?? extraido.valor_premio ?? 0) || 0;
  const descricao = extraido.descricao ??
    `${categoria.toUpperCase()} - ${numero ?? "sem número"}`;
  const cfop = extraido.cfop ?? "1933";
  return {
    cnpj,
    razao,
    uf,
    municipio,
    endereco,
    numero,
    dataEmissao,
    dataVencimento,
    valor,
    descricao,
    cfop,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Método não permitido." }, 405);
  }

  const url = new URL(req.url);
  const isTest = url.searchParams.get("test") === "true";

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(
      { ok: false, error: "Payload inválido (esperado multipart/form-data)." },
      400,
    );
  }

  const arquivo = form.get("arquivo");
  const categoria = String(form.get("categoria") ?? "").trim().toLowerCase();

  if (!(arquivo instanceof File)) {
    return json({ ok: false, error: "Arquivo ausente ou inválido." }, 400);
  }
  if (arquivo.size > MAX_BYTES) {
    return json(
      { ok: false, error: "Arquivo maior que 5MB." },
      400,
    );
  }
  if (!CATEGORIAS.has(categoria)) {
    return json(
      {
        ok: false,
        error: "Categoria inválida. Use boleto, fatura ou apolice.",
      },
      400,
    );
  }

  const mime = inferMime(arquivo.name, arquivo.type);
  if (!ALLOWED_MIME.has(mime)) {
    return json(
      { ok: false, error: "Esse formato de documento não é aceito." },
      400,
    );
  }

  const fileBuf = new Uint8Array(await arquivo.arrayBuffer());
  const b64 = bytesToBase64(fileBuf);

  // Modo test: só extrai e retorna, sem auth nem persistência.
  if (isTest) {
    const ai = await extrairComIA(categoria, mime, b64);
    if (!ai.ok) return json({ ok: false, error: ai.error }, ai.status);
    const norm = normalizar(categoria, ai.data);
    return json({
      ok: true,
      test: true,
      categoria,
      extraido: ai.data,
      normalizado: norm,
    });
  }

  // === Fluxo completo: requer auth + escritorio ===
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "Não autenticado." }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return json({ ok: false, error: "Sessão inválida." }, 401);
  }
  const { data: profile } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profile?.role !== "escritorio") {
    return json(
      { ok: false, error: "Apenas escritório pode processar documentos." },
      403,
    );
  }

  const cliente_id = String(form.get("cliente_id") ?? "").trim();
  const periodo = String(form.get("periodo") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(cliente_id)) {
    return json({ ok: false, error: "cliente_id inválido." }, 400);
  }
  if (!/^\d{4}-\d{2}$/.test(periodo)) {
    return json(
      { ok: false, error: "Período deve estar no formato AAAA-MM." },
      400,
    );
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: cliente } = await admin
    .from("clientes")
    .select("id")
    .eq("id", cliente_id)
    .maybeSingle();
  if (!cliente) {
    return json({ ok: false, error: "Cliente não encontrado." }, 404);
  }

  const { data: op } = await admin
    .from("cliente_operacoes")
    .select("tipo, ativo")
    .eq("cliente_id", cliente_id)
    .eq("tipo", "documento_avulso")
    .eq("ativo", true)
    .maybeSingle();
  if (!op) {
    return json(
      {
        ok: false,
        error:
          "Cliente não possui operação 'Documento Avulso' ativa. Habilite em Clientes → Operações.",
      },
      400,
    );
  }

  // Storage
  const ts = Date.now();
  const safeName = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${cliente_id}/${periodo}/documentos/${ts}-${safeName}`;
  const { error: upErr } = await admin.storage
    .from("planilhas")
    .upload(storagePath, fileBuf, { contentType: mime, upsert: false });
  if (upErr) {
    return json(
      { ok: false, error: `Falha no upload: ${upErr.message}` },
      500,
    );
  }

  // IA
  const ai = await extrairComIA(categoria, mime, b64);
  if (!ai.ok) return json({ ok: false, error: ai.error }, ai.status);
  const extraido = ai.data;
  const n = normalizar(categoria, extraido);

  // Competência
  const { data: comp, error: compErr } = await admin
    .from("competencias")
    .upsert(
      {
        cliente_id,
        periodo,
        tipo: "documento_avulso",
        arquivo_origem: `${cliente_id}/${periodo}/documentos/`,
      },
      { onConflict: "cliente_id,periodo,tipo" },
    )
    .select("id")
    .single();
  if (compErr || !comp) {
    return json(
      {
        ok: false,
        error: `Falha ao criar competência: ${compErr?.message}`,
      },
      500,
    );
  }
  const competencia_id = comp.id;

  // Nota
  const idExterno =
    `${categoria}_${n.numero ?? `sem_num_${ts}`}_${n.cnpj ?? "sem_cnpj"}`;
  const { data: notaSaved, error: notaErr } = await admin
    .from("notas_fiscais")
    .upsert(
      {
        competencia_id,
        id_externo: idExterno,
        tipo_documento: categoria,
        categoria_doc: categoria,
        numero_nfe: n.numero,
        emissao_nfe: n.dataEmissao,
        data_competencia: n.dataEmissao,
        data_vencimento: n.dataVencimento,
        prestador_razao: n.razao,
        prestador_cnpj: digitsOnly(n.cnpj),
        prestador_uf: n.uf,
        prestador_municipio: n.municipio,
        prestador_endereco: n.endereco,
        valor_nfe: n.valor,
        desconto: 0,
        valor_contabil: n.valor,
        cancelada: false,
        raw_data: {
          extraido_ia: extraido,
          arquivo_original: storagePath,
          mime,
        },
      },
      { onConflict: "competencia_id,id_externo" },
    )
    .select("id")
    .single();
  if (notaErr || !notaSaved) {
    return json(
      { ok: false, error: `Falha ao salvar nota: ${notaErr?.message}` },
      500,
    );
  }

  // Item
  const { error: itErr } = await admin
    .from("notas_fiscais_itens")
    .upsert(
      {
        nota_id: notaSaved.id,
        numero_item: 1,
        codigo_produto: `${categoria.toUpperCase()}-${n.numero ?? "AVULSO"}`,
        descricao_produto: n.descricao,
        ncm: null,
        cfop: n.cfop,
        valor: n.valor,
        raw_data: {
          quantidade: 1,
          valor_unitario: n.valor,
          icms: extraido.valor_icms
            ? { vICMS: extraido.valor_icms, pICMS: extraido.aliquota_icms }
            : null,
          pis: extraido.valor_pis ? { vPIS: extraido.valor_pis } : null,
          cofins: extraido.valor_cofins
            ? { vCOFINS: extraido.valor_cofins }
            : null,
        },
      },
      { onConflict: "nota_id,numero_item" },
    );
  if (itErr) {
    console.error("[processar-documento-ia] Falha item", itErr);
  }

  return json({
    ok: true,
    competencia_id,
    nota_id: notaSaved.id,
    extraido,
    campos_processados: {
      cnpj: n.cnpj,
      razao: n.razao,
      valor: n.valor,
      data_emissao: n.dataEmissao,
      data_vencimento: n.dataVencimento,
    },
  });
});
