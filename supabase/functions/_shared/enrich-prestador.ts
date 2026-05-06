// Enriquecimento em cascata de prestador (endereço + código IBGE).
// Cascata: BrasilAPI -> ReceitaWS -> IBGE (por nome de município + UF).

export interface EnrichResult {
  endereco: string | null;
  ibge: string | null;
  municipio: string | null;
  uf: string | null;
  fonte: "brasilapi" | "receitaws" | "ibge_nome" | null;
}

function digitsOnly(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

function normalize(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function tryBrasilAPI(cnpj: string) {
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
    const municipio = d.municipio ? String(d.municipio) : null;
    const uf = d.uf ? String(d.uf) : null;
    return { endereco, ibge, municipio, uf };
  } catch {
    return null;
  }
}

async function tryReceitaWS(cnpj: string) {
  try {
    const r = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.status === "ERROR") return null;
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
    const municipio = d.municipio ? String(d.municipio) : null;
    const uf = d.uf ? String(d.uf) : null;
    // ReceitaWS não retorna IBGE — vai precisar do passo 3
    return { endereco, ibge: null as string | null, municipio, uf };
  } catch {
    return null;
  }
}

// Cache simples por UF para municípios IBGE
const ibgeCache = new Map<string, Array<{ id: number; nome: string }>>();

async function fetchIbgeMunicipios(uf: string): Promise<Array<{ id: number; nome: string }>> {
  const key = uf.toUpperCase();
  if (ibgeCache.has(key)) return ibgeCache.get(key)!;
  try {
    const r = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${key}/municipios`,
      { headers: { Accept: "application/json" } },
    );
    if (!r.ok) return [];
    const arr = (await r.json()) as Array<{ id: number; nome: string }>;
    ibgeCache.set(key, arr);
    return arr;
  } catch {
    return [];
  }
}

export async function lookupIbgePorNome(
  municipio: string | null,
  uf: string | null,
): Promise<string | null> {
  if (!municipio || !uf) return null;
  const lista = await fetchIbgeMunicipios(uf);
  if (!lista.length) return null;
  const alvo = normalize(municipio);
  const m = lista.find((x) => normalize(x.nome) === alvo);
  return m ? String(m.id) : null;
}

export async function enrichPrestador(
  cnpj: string,
  fallbackMunicipio?: string | null,
  fallbackUf?: string | null,
): Promise<EnrichResult> {
  const cnpjDigits = digitsOnly(cnpj);
  const result: EnrichResult = {
    endereco: null,
    ibge: null,
    municipio: null,
    uf: null,
    fonte: null,
  };

  if (cnpjDigits.length === 14) {
    const br = await tryBrasilAPI(cnpjDigits);
    if (br) {
      result.endereco = br.endereco;
      result.ibge = br.ibge;
      result.municipio = br.municipio;
      result.uf = br.uf;
      result.fonte = "brasilapi";
    }

    if (!result.ibge || !result.endereco) {
      const rws = await tryReceitaWS(cnpjDigits);
      if (rws) {
        result.endereco = result.endereco ?? rws.endereco;
        result.municipio = result.municipio ?? rws.municipio;
        result.uf = result.uf ?? rws.uf;
        if (!result.fonte) result.fonte = "receitaws";
      }
    }
  }

  // Se ainda sem IBGE, tenta lookup por nome de município
  if (!result.ibge) {
    const muni = result.municipio ?? fallbackMunicipio ?? null;
    const uf = result.uf ?? fallbackUf ?? null;
    const ibge = await lookupIbgePorNome(muni, uf);
    if (ibge) {
      result.ibge = ibge;
      if (!result.fonte) result.fonte = "ibge_nome";
    }
  }

  return result;
}

export async function runWithConcurrency<T, R>(
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
