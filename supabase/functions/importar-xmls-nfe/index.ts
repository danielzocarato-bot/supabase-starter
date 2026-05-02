import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { DOMParser } from "https://esm.sh/@xmldom/xmldom@0.8.10";
import JSZip from "https://esm.sh/jszip@3.10.1";

const MAX_EXTRACTED_FILE_BYTES = 50 * 1024 * 1024;

// Boot-time probe: tenta carregar libs opcionais e loga status
type LibStatus = { ok: boolean; error?: string };
const libStatus: { jszip: LibStatus; unrar: LibStatus; sevenZip: LibStatus } = {
  jszip: { ok: true },
  unrar: { ok: false },
  sevenZip: { ok: false },
};

let unrarMod: any = null;
let sevenZipMod: any = null;

try {
  unrarMod = await import("https://esm.sh/node-unrar-js@2.0.2");
  libStatus.unrar = { ok: true };
  console.log("[importar-xmls-nfe][boot] node-unrar-js@2.0.2 carregado com sucesso");
} catch (e: any) {
  libStatus.unrar = { ok: false, error: e?.message ?? String(e) };
  console.error("[importar-xmls-nfe][boot] FALHA ao carregar node-unrar-js@2.0.2:", e?.message ?? e, e?.stack);
}

try {
  sevenZipMod = await import("https://esm.sh/7zip-min@1.4.5");
  libStatus.sevenZip = { ok: true };
  console.log("[importar-xmls-nfe][boot] 7zip-min@1.4.5 carregado com sucesso");
} catch (e: any) {
  libStatus.sevenZip = { ok: false, error: e?.message ?? String(e) };
  console.error("[importar-xmls-nfe][boot] FALHA ao carregar 7zip-min@1.4.5:", e?.message ?? e, e?.stack);
}

console.log("[importar-xmls-nfe][boot] Status libs:", JSON.stringify(libStatus));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
  Deno.env.get("SUPABASE_ANON_KEY")!;

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digitsOnly(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function textOf(parent: Element | Document | null, tag: string): string | null {
  if (!parent) return null;
  // Try with namespace first, then without
  let nodes = (parent as any).getElementsByTagNameNS?.(NFE_NS, tag);
  if (!nodes || nodes.length === 0) {
    nodes = (parent as any).getElementsByTagName?.(tag);
  }
  if (!nodes || nodes.length === 0) return null;
  const t = nodes[0].textContent;
  return t == null ? null : String(t).trim() || null;
}

function firstEl(parent: Element | Document | null, tag: string): Element | null {
  if (!parent) return null;
  let nodes = (parent as any).getElementsByTagNameNS?.(NFE_NS, tag);
  if (!nodes || nodes.length === 0) {
    nodes = (parent as any).getElementsByTagName?.(tag);
  }
  return nodes && nodes.length ? (nodes[0] as Element) : null;
}

function allEls(parent: Element | Document | null, tag: string): Element[] {
  if (!parent) return [];
  let nodes = (parent as any).getElementsByTagNameNS?.(NFE_NS, tag);
  if (!nodes || nodes.length === 0) {
    nodes = (parent as any).getElementsByTagName?.(tag);
  }
  const out: Element[] = [];
  for (let i = 0; i < (nodes?.length ?? 0); i++) out.push(nodes[i] as Element);
  return out;
}

function toNumber(v: string | null): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseDhEmi(v: string | null): string | null {
  if (!v) return null;
  // dhEmi format: 2024-01-15T10:30:00-03:00
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

interface ParsedNFe {
  chave_nfe: string;
  numero_nfe: string | null;
  serie: string | null;
  emissao_nfe: string | null;
  tpNF: string | null;
  emit_cnpj: string | null;
  emit_nome: string | null;
  emit_uf: string | null;
  emit_municipio: string | null;
  emit_endereco: string | null;
  dest_cnpj: string | null;
  dest_nome: string | null;
  dest_uf: string | null;
  dest_municipio: string | null;
  dest_endereco: string | null;
  valor_total: number | null;
  itens: Array<{
    numero_item: number;
    codigo_produto: string | null;
    descricao_produto: string | null;
    ncm: string | null;
    cfop: string | null;
    valor: number | null;
    qCom: number | null;
    uCom: string | null;
    vUnCom: number | null;
    vDesc: number | null;
    raw: Record<string, any>;
  }>;
  raw: Record<string, any>;
}

// Helper que percorre subtags de ICMS (ICMS00, ICMS10, etc / ICMSSN101, etc)
function findFirstChild(parent: Element | null, tagPrefixes: string[]): Element | null {
  if (!parent) return null;
  const children = (parent as any).childNodes;
  if (!children) return null;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType !== 1) continue; // ELEMENT_NODE
    const localName = (c.localName ?? c.tagName ?? "").toString();
    if (tagPrefixes.some((p) => localName.startsWith(p))) return c as Element;
  }
  return null;
}

function parseImpostosItem(det: Element | null) {
  const imposto = firstEl(det, "imposto");

  // ICMS — ICMS00, ICMS10, ..., ICMSSN101, etc.
  const icmsParent = firstEl(imposto, "ICMS");
  const icmsTag = findFirstChild(icmsParent, ["ICMS"]);

  // IPI
  const ipiParent = firstEl(imposto, "IPI");
  const ipiTrib = firstEl(ipiParent, "IPITrib") ?? findFirstChild(ipiParent, ["IPI"]);

  // PIS
  const pisParent = firstEl(imposto, "PIS");
  const pisTag = findFirstChild(pisParent, ["PIS"]);

  // COFINS
  const cofParent = firstEl(imposto, "COFINS");
  const cofTag = findFirstChild(cofParent, ["COFINS"]);

  return {
    icms: {
      CST: textOf(icmsTag, "CST") ?? textOf(icmsTag, "CSOSN"),
      vBC: textOf(icmsTag, "vBC"),
      pICMS: textOf(icmsTag, "pICMS"),
      vICMS: textOf(icmsTag, "vICMS"),
    },
    ipi: {
      CST: textOf(ipiTrib, "CST"),
      vBC: textOf(ipiTrib, "vBC"),
      pIPI: textOf(ipiTrib, "pIPI"),
      vIPI: textOf(ipiTrib, "vIPI"),
    },
    pis: {
      CST: textOf(pisTag, "CST"),
      vBC: textOf(pisTag, "vBC"),
      pPIS: textOf(pisTag, "pPIS"),
      vPIS: textOf(pisTag, "vPIS"),
    },
    cofins: {
      CST: textOf(cofTag, "CST"),
      vBC: textOf(cofTag, "vBC"),
      pCOFINS: textOf(cofTag, "pCOFINS"),
      vCOFINS: textOf(cofTag, "vCOFINS"),
    },
  };
}

function montaEndereco(ender: Element | null): string | null {
  if (!ender) return null;
  const partes = [
    textOf(ender, "xLgr"),
    textOf(ender, "nro"),
    textOf(ender, "xBairro"),
  ].filter((p) => p && String(p).trim() !== "");
  return partes.length > 0 ? partes.join(", ") : null;
}

function parseXml(content: string): ParsedNFe | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(content, "text/xml") as unknown as Document;
  } catch {
    return null;
  }
  const inf = firstEl(doc, "infNFe");
  if (!inf) return null;

  const idAttr = inf.getAttribute("Id") ?? "";
  const chave = idAttr.replace(/^NFe/, "").trim();
  if (!chave) return null;

  const ide = firstEl(inf, "ide");
  const emit = firstEl(inf, "emit");
  const dest = firstEl(inf, "dest");
  const enderEmit = firstEl(emit, "enderEmit");
  const enderDest = firstEl(dest, "enderDest");
  const total = firstEl(inf, "total");
  const icmsTot = total ? firstEl(total, "ICMSTot") : null;

  const numero_nfe = textOf(ide, "nNF");
  const serie = textOf(ide, "serie");
  const emissao_nfe = parseDhEmi(textOf(ide, "dhEmi") ?? textOf(ide, "dEmi"));
  const tpNF = textOf(ide, "tpNF");

  const emit_cnpj = digitsOnly(textOf(emit, "CNPJ") ?? textOf(emit, "CPF"));
  const emit_nome = textOf(emit, "xNome");
  const emit_uf = textOf(enderEmit, "UF");
  const emit_municipio = textOf(enderEmit, "xMun");
  const emit_endereco = montaEndereco(enderEmit);

  const dest_cnpj = digitsOnly(textOf(dest, "CNPJ") ?? textOf(dest, "CPF"));
  const dest_nome = textOf(dest, "xNome");
  const dest_uf = textOf(enderDest, "UF");
  const dest_municipio = textOf(enderDest, "xMun");
  const dest_endereco = montaEndereco(enderDest);

  const valor_total = toNumber(textOf(icmsTot, "vNF"));

  const dets = allEls(inf, "det");
  const itens = dets.map((det, idx) => {
    const nItem = parseInt(det.getAttribute("nItem") ?? String(idx + 1), 10);
    const prod = firstEl(det, "prod");
    const impostos = parseImpostosItem(det);
    return {
      numero_item: isNaN(nItem) ? idx + 1 : nItem,
      codigo_produto: textOf(prod, "cProd"),
      descricao_produto: textOf(prod, "xProd"),
      ncm: textOf(prod, "NCM"),
      cfop: textOf(prod, "CFOP"),
      valor: toNumber(textOf(prod, "vProd")),
      qCom: toNumber(textOf(prod, "qCom")),
      uCom: textOf(prod, "uCom"),
      vUnCom: toNumber(textOf(prod, "vUnCom")),
      vDesc: toNumber(textOf(prod, "vDesc")),
      raw: {
        produto: {
          cProd: textOf(prod, "cProd"),
          xProd: textOf(prod, "xProd"),
          NCM: textOf(prod, "NCM"),
          CFOP: textOf(prod, "CFOP"),
          vProd: textOf(prod, "vProd"),
          qCom: textOf(prod, "qCom"),
          uCom: textOf(prod, "uCom"),
          vUnCom: textOf(prod, "vUnCom"),
          vDesc: textOf(prod, "vDesc"),
          vFrete: textOf(prod, "vFrete"),
          vSeg: textOf(prod, "vSeg"),
          vOutro: textOf(prod, "vOutro"),
        },
        icms: impostos.icms,
        ipi: impostos.ipi,
        pis: impostos.pis,
        cofins: impostos.cofins,
      },
    };
  });

  return {
    chave_nfe: chave,
    numero_nfe,
    serie,
    emissao_nfe,
    tpNF,
    emit_cnpj: emit_cnpj || null,
    emit_nome,
    emit_uf,
    emit_municipio,
    emit_endereco,
    dest_cnpj: dest_cnpj || null,
    dest_nome,
    dest_uf,
    dest_municipio,
    dest_endereco,
    valor_total,
    itens,
    raw: {
      chave_nfe: chave,
      numero_nfe,
      serie,
      emissao_nfe,
      tpNF,
      emit: { cnpj: emit_cnpj, nome: emit_nome, uf: emit_uf, municipio: emit_municipio, endereco: emit_endereco },
      dest: { cnpj: dest_cnpj, nome: dest_nome, uf: dest_uf, municipio: dest_municipio, endereco: dest_endereco },
      valor_total,
    },
  };
}

async function fetchEmpresaBrasilAPI(cnpj: string): Promise<{ endereco: string | null; ibge: string | null } | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    const partes = [d.logradouro, d.numero, d.complemento, d.bairro].filter(
      (x: any) => x && String(x).trim() !== "",
    );
    let endereco = partes.length > 0 ? partes.join(", ") : null;
    if (d.cep) {
      const cep = String(d.cep).replace(/\D/g, "");
      if (cep.length === 8) {
        const cepFmt = `${cep.slice(0, 5)}-${cep.slice(5)}`;
        endereco = endereco ? `${endereco}, CEP ${cepFmt}` : `CEP ${cepFmt}`;
      }
    }
    const ibge = d.codigo_municipio_ibge
      ? String(d.codigo_municipio_ibge)
      : d.codigo_municipio
      ? String(d.codigo_municipio)
      : null;
    return { endereco, ibge };
  } catch {
    return null;
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
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
    return json({ ok: false, error: "Apenas escritório pode importar XMLs." }, 403);
  }

  // Parse FormData
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ ok: false, error: "Payload inválido (esperado multipart/form-data)." }, 400);
  }

  const cliente_id = String(form.get("cliente_id") ?? "").trim();
  const periodo = String(form.get("periodo") ?? "").trim();
  const tipo = String(form.get("tipo") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(cliente_id)) return json({ ok: false, error: "cliente_id inválido." }, 400);
  if (!/^\d{4}-\d{2}$/.test(periodo)) return json({ ok: false, error: "Período deve estar no formato AAAA-MM." }, 400);
  if (tipo !== "nfe_entrada" && tipo !== "nfe_saida") {
    return json({ ok: false, error: "Tipo deve ser nfe_entrada ou nfe_saida." }, 400);
  }

  const arquivos = form.getAll("arquivos[]").filter((a) => a instanceof File) as File[];
  if (arquivos.length === 0) return json({ ok: false, error: "Nenhum arquivo enviado." }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Confirma cliente e operação configurada
  const { data: cliente, error: cliErr } = await admin
    .from("clientes")
    .select("id, cnpj")
    .eq("id", cliente_id)
    .maybeSingle();
  if (cliErr || !cliente) return json({ ok: false, error: "Cliente não encontrado." }, 404);

  const clienteCnpj = digitsOnly(cliente.cnpj);
  if (!clienteCnpj) return json({ ok: false, error: "Cliente sem CNPJ válido cadastrado." }, 400);

  const { data: op } = await admin
    .from("cliente_operacoes")
    .select("tipo, ativo")
    .eq("cliente_id", cliente_id)
    .eq("tipo", tipo)
    .eq("ativo", true)
    .maybeSingle();
  if (!op) {
    return json({ ok: false, error: "O cliente não está configurado para esse tipo de operação." }, 400);
  }

  // Coleta XMLs (de .xml direto ou descompactando .zip) e faz upload do original
  const ts = Date.now();
  const xmls: Array<{ name: string; content: string }> = [];

  let containers_descompactados = 0;
  let formato_falho: string | null = null;

  for (const arq of arquivos) {
    const safeName = arq.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${cliente_id}/${periodo}/${ts}-${safeName}`;
    const buf = new Uint8Array(await arq.arrayBuffer());

    // Upload original (não bloqueante em caso de erro)
    await admin.storage.from("planilhas").upload(storagePath, buf, {
      contentType: arq.type || "application/octet-stream",
      upsert: false,
    }).catch(() => null);

    const lower = arq.name.toLowerCase();
    let formato: "xml" | "zip" | "rar" | "7z" | "outro" = "outro";
    if (lower.endsWith(".xml")) formato = "xml";
    else if (lower.endsWith(".zip")) formato = "zip";
    else if (lower.endsWith(".rar")) formato = "rar";
    else if (lower.endsWith(".7z")) formato = "7z";

    if (formato === "xml") {
      const content = new TextDecoder("utf-8").decode(buf);
      xmls.push({ name: arq.name, content });
      continue;
    }

    if (formato === "zip") {
      let extraidos = 0;
      try {
        const zip = await JSZip.loadAsync(buf);
        for (const fname of Object.keys(zip.files)) {
          const entry = zip.files[fname];
          if (entry.dir) continue;
          if (!fname.toLowerCase().endsWith(".xml")) continue;
          const content = await entry.async("string");
          if (content.length > MAX_EXTRACTED_FILE_BYTES) {
            console.error(`[importar-xmls-nfe][extract] container=${arq.name} formato=zip lib=jszip arquivo=${fname} ignorado (>50MB)`);
            continue;
          }
          xmls.push({ name: fname, content });
          extraidos++;
        }
        containers_descompactados++;
        console.log(`[importar-xmls-nfe][extract] container=${arq.name} formato=zip lib=jszip xmls_extraidos=${extraidos}`);
      } catch (e: any) {
        console.error(`[importar-xmls-nfe][extract] container=${arq.name} formato=zip lib=jszip ERRO=${e?.message}`, e?.stack);
      }
      continue;
    }

    if (formato === "rar") {
      if (!libStatus.unrar.ok || !unrarMod) {
        console.error(`[importar-xmls-nfe][extract] container=${arq.name} formato=rar lib=node-unrar-js INDISPONIVEL erro_boot=${libStatus.unrar.error}`);
        formato_falho = "rar";
        continue;
      }
      let extraidos = 0;
      try {
        const createExtractor = unrarMod.createExtractorFromData ?? unrarMod.default?.createExtractorFromData;
        if (!createExtractor) throw new Error("createExtractorFromData não exportado");
        const extractor = await createExtractor({ data: buf.buffer });
        const list = extractor.getFileList();
        const fileHeaders = [...(list.fileHeaders ?? [])];
        const xmlNames = fileHeaders
          .filter((h: any) => !h.flags?.directory && h.name?.toLowerCase().endsWith(".xml"))
          .map((h: any) => h.name);
        if (xmlNames.length > 0) {
          const extracted = extractor.extract({ files: xmlNames });
          for (const file of extracted.files ?? []) {
            const fname = file.fileHeader?.name ?? "arquivo.xml";
            const data = file.extraction;
            if (!data) continue;
            if (data.byteLength > MAX_EXTRACTED_FILE_BYTES) {
              console.error(`[importar-xmls-nfe][extract] container=${arq.name} formato=rar arquivo=${fname} ignorado (>50MB)`);
              continue;
            }
            const content = new TextDecoder("utf-8").decode(data);
            xmls.push({ name: fname, content });
            extraidos++;
          }
        }
        containers_descompactados++;
        console.log(`[importar-xmls-nfe][extract] container=${arq.name} formato=rar lib=node-unrar-js xmls_extraidos=${extraidos}`);
      } catch (e: any) {
        console.error(`[importar-xmls-nfe][extract] container=${arq.name} formato=rar lib=node-unrar-js ERRO=${e?.message}`, e?.stack);
        formato_falho = formato_falho ?? "rar";
      }
      continue;
    }

    if (formato === "7z") {
      if (!libStatus.sevenZip.ok || !sevenZipMod) {
        console.error(`[importar-xmls-nfe][extract] container=${arq.name} formato=7z lib=7zip-min INDISPONIVEL erro_boot=${libStatus.sevenZip.error}`);
        formato_falho = formato_falho ?? "7z";
        continue;
      }
      // 7zip-min depende de binário nativo (spawn) — em Deno edge não roda.
      // Mantemos a tentativa pra logar a falha concreta e sinalizamos formato_falho.
      try {
        const sz = sevenZipMod.default ?? sevenZipMod;
        if (!sz.unpack) throw new Error("unpack não exportado");
        // Sem filesystem persistente confiável, esta tentativa quase certamente falhará.
        throw new Error("7zip-min requer binário nativo (spawn child_process), não suportado em Deno edge runtime");
      } catch (e: any) {
        console.error(`[importar-xmls-nfe][extract] container=${arq.name} formato=7z lib=7zip-min ERRO=${e?.message}`, e?.stack);
        formato_falho = formato_falho ?? "7z";
      }
      continue;
    }

    console.error(`[importar-xmls-nfe][extract] container=${arq.name} formato=desconhecido ignorado`);
  }

  if (xmls.length === 0) {
    if (formato_falho) {
      return json({
        ok: false,
        error: `Formato .${formato_falho} ainda não é suportado em servidor. Descompacte localmente e suba os XMLs.`,
        formato_falho,
      }, 400);
    }
    return json({ ok: false, error: "Nenhum XML encontrado nos arquivos enviados." }, 400);
  }

  // Cria/atualiza competência por (cliente_id, periodo, tipo)
  const { data: comp, error: compErr } = await admin
    .from("competencias")
    .upsert(
      { cliente_id, periodo, tipo, arquivo_origem: `${cliente_id}/${periodo}/` },
      { onConflict: "cliente_id,periodo,tipo" },
    )
    .select("id")
    .single();
  if (compErr || !comp) {
    return json({ ok: false, error: `Falha ao criar competência: ${compErr?.message}` }, 500);
  }
  const competencia_id = comp.id;

  // Conta existentes para diferenciar adicionadas vs duplicadas
  const { data: existentes } = await admin
    .from("notas_fiscais")
    .select("id_externo")
    .eq("competencia_id", competencia_id);
  const existentesSet = new Set((existentes ?? []).map((n) => n.id_externo));

  // Parse + validação semântica
  const tipoOpNfe = tipo === "nfe_entrada" ? "entrada" : "saida";
  const nao_aplicaveis: Array<{ chave: string; motivo: string }> = [];
  let invalidos = 0;
  const validas: ParsedNFe[] = [];

  for (const x of xmls) {
    const p = parseXml(x.content);
    if (!p) {
      invalidos++;
      continue;
    }
    if (tipo === "nfe_entrada") {
      if (p.dest_cnpj !== clienteCnpj) {
        nao_aplicaveis.push({ chave: p.chave_nfe, motivo: "Esta NFe não é de entrada para o cliente" });
        continue;
      }
    } else {
      if (p.emit_cnpj !== clienteCnpj) {
        nao_aplicaveis.push({ chave: p.chave_nfe, motivo: "Esta NFe não é de saída para o cliente" });
        continue;
      }
    }
    validas.push(p);
  }

  // UPSERT notas
  let duplicadas_atualizadas = 0;
  let notas_processadas = 0;
  let itens_processados = 0;

  for (const p of validas) {
    const isEntrada = tipo === "nfe_entrada";
    const prestador_razao = isEntrada ? p.emit_nome : p.dest_nome;
    const prestador_cnpj = isEntrada ? p.emit_cnpj : p.dest_cnpj;

    const notaPayload = {
      competencia_id,
      id_externo: p.chave_nfe,
      chave_nfe: p.chave_nfe,
      tipo_documento: "nfe",
      tipo_operacao_nfe: tipoOpNfe,
      numero_nfe: p.numero_nfe,
      emissao_nfe: p.emissao_nfe,
      data_competencia: p.emissao_nfe,
      prestador_razao,
      prestador_cnpj,
      valor_nfe: p.valor_total,
      desconto: 0,
      valor_contabil: p.valor_total,
      cancelada: false,
      raw_data: p.raw,
    };

    const { data: notaSaved, error: notaErr } = await admin
      .from("notas_fiscais")
      .upsert(notaPayload, { onConflict: "competencia_id,id_externo" })
      .select("id")
      .single();

    if (notaErr || !notaSaved) {
      console.error("[importar-xmls-nfe] Falha upsert nota", p.chave_nfe, notaErr);
      continue;
    }

    if (existentesSet.has(p.chave_nfe)) duplicadas_atualizadas++;
    notas_processadas++;

    if (p.itens.length > 0) {
      // Itens: upsert por (nota_id, numero_item) — preserva acumulador_id/classificado_em/classificado_por
      const itensPayload = p.itens.map((it) => ({
        nota_id: notaSaved.id,
        numero_item: it.numero_item,
        codigo_produto: it.codigo_produto,
        descricao_produto: it.descricao_produto,
        ncm: it.ncm,
        cfop: it.cfop,
        valor: it.valor ?? 0,
        raw_data: it.raw,
      }));
      const { error: itErr } = await admin
        .from("notas_fiscais_itens")
        .upsert(itensPayload, { onConflict: "nota_id,numero_item" });
      if (itErr) {
        console.error("[importar-xmls-nfe] Falha upsert itens", p.chave_nfe, itErr);
      } else {
        itens_processados += p.itens.length;
      }
    }
  }

  // Enriquecimento BrasilAPI
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
      if (!info || (!info.endereco && !info.ibge)) throw new Error("sem dados");
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

  return json({
    ok: true,
    competencia_id,
    notas_processadas,
    itens_processados,
    duplicadas_atualizadas,
    nao_aplicaveis,
    invalidos,
    enriquecidos,
    falhas_enriquecimento,
    containers_descompactados,
    formato_falho,
  });
});
