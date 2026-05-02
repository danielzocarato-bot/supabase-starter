// Parser compartilhado de NF-e. Usado por importar-xmls-nfe e buscar-xmls-sieg.
import { DOMParser } from "https://esm.sh/@xmldom/xmldom@0.8.10";

const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

export function digitsOnly(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

export function textOf(parent: Element | Document | null, tag: string): string | null {
  if (!parent) return null;
  let nodes = (parent as any).getElementsByTagNameNS?.(NFE_NS, tag);
  if (!nodes || nodes.length === 0) {
    nodes = (parent as any).getElementsByTagName?.(tag);
  }
  if (!nodes || nodes.length === 0) return null;
  const t = nodes[0].textContent;
  return t == null ? null : String(t).trim() || null;
}

export function firstEl(parent: Element | Document | null, tag: string): Element | null {
  if (!parent) return null;
  let nodes = (parent as any).getElementsByTagNameNS?.(NFE_NS, tag);
  if (!nodes || nodes.length === 0) {
    nodes = (parent as any).getElementsByTagName?.(tag);
  }
  return nodes && nodes.length ? (nodes[0] as Element) : null;
}

export function allEls(parent: Element | Document | null, tag: string): Element[] {
  if (!parent) return [];
  let nodes = (parent as any).getElementsByTagNameNS?.(NFE_NS, tag);
  if (!nodes || nodes.length === 0) {
    nodes = (parent as any).getElementsByTagName?.(tag);
  }
  const out: Element[] = [];
  for (let i = 0; i < (nodes?.length ?? 0); i++) out.push(nodes[i] as Element);
  return out;
}

export function toNumber(v: string | null): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function parseDhEmi(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export interface ParsedNFe {
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

export function findFirstChild(parent: Element | null, tagPrefixes: string[]): Element | null {
  if (!parent) return null;
  const children = (parent as any).childNodes;
  if (!children) return null;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.nodeType !== 1) continue;
    const localName = (c.localName ?? c.tagName ?? "").toString();
    if (tagPrefixes.some((p) => localName.startsWith(p))) return c as Element;
  }
  return null;
}

export function parseImpostosItem(det: Element | null) {
  const imposto = firstEl(det, "imposto");
  const icmsParent = firstEl(imposto, "ICMS");
  const icmsTag = findFirstChild(icmsParent, ["ICMS"]);
  const ipiParent = firstEl(imposto, "IPI");
  const ipiTrib = firstEl(ipiParent, "IPITrib") ?? findFirstChild(ipiParent, ["IPI"]);
  const pisParent = firstEl(imposto, "PIS");
  const pisTag = findFirstChild(pisParent, ["PIS"]);
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

export function montaEndereco(ender: Element | null): string | null {
  if (!ender) return null;
  const partes = [
    textOf(ender, "xLgr"),
    textOf(ender, "nro"),
    textOf(ender, "xBairro"),
  ].filter((p) => p && String(p).trim() !== "");
  return partes.length > 0 ? partes.join(", ") : null;
}

export function parseXml(content: string): ParsedNFe | null {
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
