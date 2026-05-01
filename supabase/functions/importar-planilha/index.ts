import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

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

function normalizeKey(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function findHeader(row: Record<string, any>, target: string): string | undefined {
  const t = normalizeKey(target);
  return Object.keys(row).find((k) => normalizeKey(k) === t);
}

function getVal(row: Record<string, any>, target: string): any {
  const k = findHeader(row, target);
  return k ? row[k] : undefined;
}

function excelDateToISO(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const v = value.trim();
    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[0];
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Brazilian format possible: "1.234,56"
    const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

function isTruthyCancel(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

function digitsOnly(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

function formatPeriodoLabel(p: string): string {
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return p;
  return `${meses[parseInt(m[2],10)-1]} / ${m[1]}`;
}

async function fetchEmpresaBrasilAPI(cnpj: string): Promise<{ endereco: string | null; ibge: string | null } | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { "Accept": "application/json" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const partes = [
      d.logradouro,
      d.numero,
      d.complemento,
      d.bairro,
    ].filter((x: any) => x && String(x).trim() !== "");
    let endereco = partes.length > 0 ? partes.join(", ") : null;
    if (d.cep) {
      const cep = String(d.cep).replace(/\D/g, "");
      if (cep.length === 8) {
        const cepFmt = `${cep.slice(0, 5)}-${cep.slice(5)}`;
        endereco = endereco ? `${endereco}, CEP ${cepFmt}` : `CEP ${cepFmt}`;
      }
    }
    const ibge = d.codigo_municipio_ibge ? String(d.codigo_municipio_ibge) : (d.codigo_municipio ? String(d.codigo_municipio) : null);
    return { endereco, ibge };
  } catch {
    return null;
  }
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try {
        const r = await worker(items[i]);
        results[i] = { status: "fulfilled", value: r };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  });
  await Promise.all(runners);
  return results;
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
    return json({ ok: false, error: "Apenas escritório pode importar planilhas." }, 403);
  }

  // Parse FormData
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "Payload inválido (esperado multipart/form-data)." }, 400);
  }

  const arquivo = form.get("arquivo");
  const cliente_id = String(form.get("cliente_id") ?? "").trim();
  const periodo = String(form.get("periodo") ?? "").trim();

  if (!(arquivo instanceof File)) return json({ ok: false, error: "Arquivo ausente ou inválido." }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(cliente_id)) return json({ ok: false, error: "cliente_id inválido." }, 400);
  if (!/^\d{4}-\d{2}$/.test(periodo)) return json({ ok: false, error: "Período deve estar no formato AAAA-MM." }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Confirma cliente existe
  const { data: cliente, error: cliErr } = await admin
    .from("clientes")
    .select("id")
    .eq("id", cliente_id)
    .maybeSingle();
  if (cliErr || !cliente) return json({ ok: false, error: "Cliente não encontrado." }, 404);

  // Upload no storage
  const ts = Date.now();
  const safeName = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${cliente_id}/${periodo}/${ts}-${safeName}`;
  const fileBuf = new Uint8Array(await arquivo.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from("planilhas")
    .upload(storagePath, fileBuf, {
      contentType: arquivo.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
  if (upErr) return json({ ok: false, error: `Falha no upload: ${upErr.message}` }, 500);

  // Parse XLSX
  let rows: Record<string, any>[];
  try {
    const wb = XLSX.read(fileBuf, { type: "array", cellDates: false });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) throw new Error("Planilha vazia.");
    const sheet = wb.Sheets[sheetName];
    rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null, raw: true });
  } catch (e) {
    return json({ ok: false, error: `Não conseguimos ler este arquivo. ${(e as Error).message}` }, 400);
  }

  if (!rows.length) return json({ ok: false, error: "A planilha não contém linhas." }, 400);

  // UPSERT competência
  const { data: comp, error: compErr } = await admin
    .from("competencias")
    .upsert(
      { cliente_id, periodo, arquivo_origem: storagePath },
      { onConflict: "cliente_id,periodo" },
    )
    .select("id")
    .single();
  if (compErr || !comp) return json({ ok: false, error: `Falha ao criar competência: ${compErr?.message}` }, 500);

  const competencia_id = comp.id;

  // Conta existentes para diferenciar adicionadas vs mescladas
  const { data: existentes } = await admin
    .from("notas_fiscais")
    .select("id_externo")
    .eq("competencia_id", competencia_id);
  const existentesSet = new Set((existentes ?? []).map((n) => n.id_externo));

  // Verifica se a coluna #Id existe NA PRIMEIRA LINHA (presume schema homogêneo)
  const primeiraLinha = rows[0];
  if (!findHeader(primeiraLinha, "#Id")) {
    return json({
      ok: false,
      error: "A coluna #Id é obrigatória e não foi encontrada na planilha. Verifique se você está usando o arquivo correto exportado do UneCont.",
    }, 400);
  }

  // Mapeia linhas → registros
  const registros: any[] = [];
  let linhas_ignoradas = 0;
  for (const row of rows) {
    const idExt = getVal(row, "#Id");
    if (idExt == null || idExt === "") { linhas_ignoradas++; continue; }

    const valor_nfe = toNumber(getVal(row, "Valor NFe"));
    const desconto = toNumber(getVal(row, "Desconto Incondicionado")) ?? 0;
    const valor_contabil = valor_nfe == null ? null : valor_nfe - desconto;

    const municipioPrestadorRaw = getVal(row, "Município Prestador");
    let prestador_municipio: string | null = null;
    let prestador_uf: string | null = null;
    if (typeof municipioPrestadorRaw === "string" && municipioPrestadorRaw.includes(" - ")) {
      const [m, u] = municipioPrestadorRaw.split(" - ");
      prestador_municipio = m?.trim() || null;
      prestador_uf = u?.trim() || null;
    } else if (typeof municipioPrestadorRaw === "string" && municipioPrestadorRaw.trim()) {
      prestador_municipio = municipioPrestadorRaw.trim();
    }

    registros.push({
      competencia_id,
      id_externo: String(idExt),
      numero_nfe: getVal(row, "Número NFe") != null ? String(getVal(row, "Número NFe")) : null,
      emissao_nfe: excelDateToISO(getVal(row, "Emissão NFe")),
      data_competencia: excelDateToISO(getVal(row, "Data Competência")),
      prestador_razao: getVal(row, "Prestador") ?? null,
      prestador_cnpj: (() => {
        const v = getVal(row, "Cnpj/Cpf Prestador");
        if (v == null) return null;
        const d = digitsOnly(String(v));
        return d.length >= 11 ? d : null; // 11=CPF, 14=CNPJ
      })(),
      prestador_municipio,
      prestador_uf,
      cnae_descricao: getVal(row, "CNAE Descrição") ?? null,
      valor_nfe,
      desconto,
      valor_contabil,
      servico_municipal: getVal(row, "Serviço Municipal") ?? null,
      observacao: getVal(row, "Observação") ?? null,
      cancelada: isTruthyCancel(getVal(row, "Cancelamento")),
      raw_data: row,
    });
  }

  if (!registros.length) {
    return json({
      ok: false,
      error: `Nenhuma linha válida encontrada (todas as ${rows.length} linhas tinham #Id vazio).`,
    }, 400);
  }

  // UPSERT preservando classificação. Estratégia: como o upsert padrão atualiza TODOS
  // os campos enviados, e nós queremos preservar acumulador_id/classificado_em/classificado_por,
  // simplesmente NÃO enviamos esses campos. Em insert eles ficam NULL (default), em conflict
  // não são tocados.
  const { error: upsertErr } = await admin
    .from("notas_fiscais")
    .upsert(registros, { onConflict: "competencia_id,id_externo" });
  if (upsertErr) return json({ ok: false, error: `Falha ao salvar notas: ${upsertErr.message}` }, 500);

  let adicionadas = 0;
  let mescladas = 0;
  for (const r of registros) {
    if (existentesSet.has(r.id_externo)) mescladas++;
    else adicionadas++;
  }

  // Enriquecimento via BrasilAPI: CNPJs distintos sem prestador_endereco
  const { data: paraEnriquecer } = await admin
    .from("notas_fiscais")
    .select("prestador_cnpj")
    .eq("competencia_id", competencia_id)
    .is("prestador_endereco", null)
    .not("prestador_cnpj", "is", null);

  const cnpjsDistintos = Array.from(
    new Set(
      (paraEnriquecer ?? [])
        .map((n) => digitsOnly(n.prestador_cnpj ?? ""))
        .filter((c) => c.length === 14),
    ),
  );

  let enriquecidos = 0;
  let falhas_enriquecimento = 0;

  if (cnpjsDistintos.length > 0) {
    const settled = await runWithConcurrency(cnpjsDistintos, 5, async (cnpj) => {
      const info = await fetchEmpresaBrasilAPI(cnpj);
      if (!info || (!info.endereco && !info.ibge)) {
        throw new Error("sem dados");
      }
      // prestador_cnpj agora é sempre dígitos
      const { error } = await admin
        .from("notas_fiscais")
        .update({
          prestador_endereco: info.endereco,
          prestador_municipio_ibge: info.ibge,
        })
        .eq("competencia_id", competencia_id)
        .eq("prestador_cnpj", cnpj);
      if (error) throw error;
      return true;
    });

    for (const s of settled) {
      if (s.status === "fulfilled") enriquecidos++;
      else falhas_enriquecimento++;
    }
  }


  // Notifica usuários cliente — não bloqueante
  try {
    const { data: clientesUsers } = await admin
      .from("profiles")
      .select("email, nome")
      .eq("cliente_id", cliente_id)
      .eq("role", "cliente");

    const { data: cli } = await admin
      .from("clientes")
      .select("razao_social")
      .eq("id", cliente_id)
      .maybeSingle();

    const appOrigin = Deno.env.get("APP_ORIGIN") ?? "https://classifica.acrux-group.com.br";
    const periodoLabel = formatPeriodoLabel(periodo);
    const ctaUrl = `${appOrigin}/app/cliente/competencias/${competencia_id}`;
    const totalNotas = registros.length;

    for (const u of clientesUsers ?? []) {
      if (!u.email) continue;
      try {
        await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "competencia-pronta",
            recipientEmail: u.email,
            idempotencyKey: `pronta-${competencia_id}-${u.email}`,
            templateData: {
              nome: u.nome ?? null,
              razaoSocial: cli?.razao_social ?? "Sua contabilidade",
              periodoLabel,
              totalNotas,
              ctaUrl,
            },
          },
        });
      } catch (sendErr) {
        console.error("[importar-planilha] Falha ao enviar email para", u.email, sendErr);
      }
    }
  } catch (e) {
    console.error("[importar-planilha] Falha ao notificar clientes:", e);
    // Não bloqueia
  }

  return json({
    ok: true,
    competencia_id,
    adicionadas,
    mescladas,
    total: registros.length,
    linhas_ignoradas,
    enriquecidos,
    falhas_enriquecimento,
  });
});
