// Lógica compartilhada de import/upsert de NF-e a partir de strings XML.
// Usado por importar-xmls-nfe (após descompactar) e buscar-xmls-sieg (após baixar do SIEG).
import { digitsOnly, parseXml, type ParsedNFe } from "./nfe-parser.ts";

export type TipoNFeOp = "nfe_entrada" | "nfe_saida";

export interface ProcessarXmlsParams {
  cliente_id: string;
  cliente: { cnpj: string };
  periodo: string;
  tipo: TipoNFeOp;
  xmls: Array<{ name?: string; content: string }>;
  arquivo_origem?: string;
}

export interface ProcessarXmlsResult {
  competencia_id: string;
  notas_processadas: number;
  itens_processados: number;
  duplicadas_atualizadas: number;
  nao_aplicaveis: Array<{ chave: string; motivo: string }>;
  invalidos: number;
  enriquecidos: number;
  falhas_enriquecimento: number;
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

export async function processarXmls(
  admin: any,
  params: ProcessarXmlsParams,
): Promise<ProcessarXmlsResult> {
  const { cliente_id, cliente, periodo, tipo, xmls, arquivo_origem } = params;
  const clienteCnpj = digitsOnly(cliente.cnpj);

  // Cria/atualiza competência
  const { data: comp, error: compErr } = await admin
    .from("competencias")
    .upsert(
      {
        cliente_id,
        periodo,
        tipo,
        arquivo_origem: arquivo_origem ?? `${cliente_id}/${periodo}/`,
      },
      { onConflict: "cliente_id,periodo,tipo" },
    )
    .select("id")
    .single();
  if (compErr || !comp) {
    throw new Error(`Falha ao criar competência: ${compErr?.message}`);
  }
  const competencia_id = comp.id as string;

  const { data: existentes } = await admin
    .from("notas_fiscais")
    .select("id_externo")
    .eq("competencia_id", competencia_id);
  const existentesSet = new Set((existentes ?? []).map((n: any) => n.id_externo));

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

  let duplicadas_atualizadas = 0;
  let notas_processadas = 0;
  let itens_processados = 0;

  for (const p of validas) {
    const isEntrada = tipo === "nfe_entrada";
    const prestador_razao = isEntrada ? p.emit_nome : p.dest_nome;
    const prestador_cnpj = isEntrada ? p.emit_cnpj : p.dest_cnpj;
    const prestador_uf = isEntrada ? p.emit_uf : p.dest_uf;
    const prestador_municipio = isEntrada ? p.emit_municipio : p.dest_municipio;
    const prestador_endereco = isEntrada ? p.emit_endereco : p.dest_endereco;

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
      prestador_uf,
      prestador_municipio,
      prestador_endereco,
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
      console.error("[nfe-import] Falha upsert nota", p.chave_nfe, notaErr);
      continue;
    }

    if (existentesSet.has(p.chave_nfe)) duplicadas_atualizadas++;
    notas_processadas++;

    if (p.itens.length > 0) {
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
        console.error("[nfe-import] Falha upsert itens", p.chave_nfe, itErr);
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
        .map((n: any) => digitsOnly(n.prestador_cnpj ?? ""))
        .filter((c: string) => c.length === 14),
    ),
  ) as string[];

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

  return {
    competencia_id,
    notas_processadas,
    itens_processados,
    duplicadas_atualizadas,
    nao_aplicaveis,
    invalidos,
    enriquecidos,
    falhas_enriquecimento,
  };
}
