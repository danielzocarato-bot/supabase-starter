import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Expose-Headers": "Content-Disposition",
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

// ===== Helpers de formatação =====

function digitsOnly(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

function padN(value: string | number | null | undefined, width: number): string {
  const s = String(value ?? 0).replace(/\D/g, "");
  return s.padStart(width, "0").slice(-width);
}

function padC(value: string | null | undefined, width: number): string {
  // Remove acentos e converte para Latin-1 friendly antes de medir tamanho
  const raw = (value ?? "").toString();
  const norm = raw.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (norm.length >= width) return norm.slice(0, width);
  return norm + " ".repeat(width - norm.length);
}

function padR(value: number | null | undefined, dec: number, width: number): string {
  const factor = Math.pow(10, dec);
  const v = Math.round((value ?? 0) * factor);
  const s = String(Math.max(0, v));
  return s.padStart(width, "0").slice(-width);
}

function formatDateD(iso: string | null | undefined): string {
  if (!iso) return " ".repeat(10);
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return " ".repeat(10);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function toLatin1Bytes(s: string): Uint8Array {
  const normalizado = s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const bytes = new Uint8Array(normalizado.length);
  for (let i = 0; i < normalizado.length; i++) {
    const code = normalizado.charCodeAt(i);
    bytes[i] = code < 256 ? code : 0x3F;
  }
  return bytes;
}

function ultimoDiaMes(periodo: string): string {
  // periodo "AAAA-MM"
  const [anoStr, mesStr] = periodo.split("-");
  const ano = parseInt(anoStr, 10);
  const mes = parseInt(mesStr, 10);
  const dia = new Date(ano, mes, 0).getDate();
  return `${String(dia).padStart(2, "0")}/${mesStr}/${anoStr}`;
}

function primeiroDiaMes(periodo: string): string {
  const [ano, mes] = periodo.split("-");
  return `01/${mes}/${ano}`;
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
    .select("id, periodo, status, cliente_id, clientes:cliente_id ( id, cnpj, codigo_empresa_dominio, razao_social )")
    .eq("id", competencia_id)
    .maybeSingle();

  if (compErr || !comp) return json({ ok: false, error: "Competência não encontrada." }, 404);

  const cliente: any = (comp as any).clientes;
  if (!cliente) return json({ ok: false, error: "Cliente da competência não encontrado." }, 404);

  // 2. Bloqueia se aberta
  if (comp.status === "aberta") {
    return json({ ok: false, error: "A competência precisa estar concluída antes de exportar." }, 400);
  }

  // Validações cliente
  const cnpjDigitsCliente = digitsOnly(cliente.cnpj);
  if (cnpjDigitsCliente.length !== 14) {
    return json({ ok: false, error: "O CNPJ do cliente precisa ter 14 dígitos para exportação." }, 400);
  }
  const codDominio = String(cliente.codigo_empresa_dominio ?? "");
  if (!/^\d+$/.test(codDominio) || codDominio.length > 7) {
    return json({ ok: false, error: "O código da empresa no Domínio deve ter no máximo 7 dígitos." }, 400);
  }

  // 3. Carrega notas + acumulador
  const { data: notas, error: notasErr } = await admin
    .from("notas_fiscais")
    .select("*, acumuladores:acumulador_id ( codigo )")
    .eq("competencia_id", competencia_id)
    .order("emissao_nfe", { ascending: true });

  if (notasErr) return json({ ok: false, error: `Falha ao carregar notas: ${notasErr.message}` }, 500);

  // 4. Pendentes (não-canceladas sem acumulador)
  const pendentes: string[] = [];
  for (const n of notas ?? []) {
    if (!n.cancelada && !n.acumulador_id) {
      pendentes.push(`NF ${n.numero_nfe ?? "?"} - ${n.prestador_razao ?? "Sem prestador"}`);
    }
  }
  if (pendentes.length > 0) {
    return json({
      ok: false,
      error: "Há notas pendentes de classificação.",
      pendentes,
    }, 400);
  }

  // Validações por nota: código acumulador <=7 dígitos
  for (const n of notas ?? []) {
    if (n.cancelada) continue;
    const codAcum = String((n as any).acumuladores?.codigo ?? "");
    if (!/^\d+$/.test(codAcum) || codAcum.length > 7) {
      return json({
        ok: false,
        error: `O código do acumulador da NF ${n.numero_nfe ?? "?"} é inválido (máx. 7 dígitos numéricos).`,
      }, 400);
    }
  }

  // ===== Gera linhas =====
  const linhas: string[] = [];

  // REGISTRO 01 — Cabeçalho (54 chars)
  let r01 = "";
  r01 += "01";                                                // 1-2
  r01 += padN(codDominio, 7);                                 // 3-9
  r01 += padN(cnpjDigitsCliente, 14);                         // 10-23
  r01 += primeiroDiaMes(comp.periodo);                        // 24-33 (10)
  r01 += ultimoDiaMes(comp.periodo);                          // 34-43 (10)
  r01 += "N";                                                 // 44
  r01 += "04";                                                // 45-46
  r01 += "00000";                                             // 47-51
  r01 += "1";                                                 // 52
  r01 += "17";                                                // 53-54
  if (r01.length !== 54) {
    return json({ ok: false, error: `Falha interna: registro 01 tem ${r01.length} chars (esperado 54).` }, 500);
  }
  linhas.push(r01);

  // REGISTRO 02 (e 12) — uma por NF não cancelada
  let seq = 0;
  for (const n of notas ?? []) {
    if (n.cancelada) continue;
    seq++;

    const codAcum = String((n as any).acumuladores?.codigo ?? "");
    const cnpjPrest = digitsOnly(n.prestador_cnpj).slice(0, 14);
    const numNfeDigits = digitsOnly(n.numero_nfe);
    const dataComp = n.data_competencia ?? n.emissao_nfe;

    let r02 = "";
    r02 += "02";                                              // 1-2
    r02 += padN(seq, 7);                                      // 3-9
    r02 += padN(codDominio, 7);                               // 10-16
    r02 += padC(cnpjPrest, 14);                               // 17-30 (texto p/ aceitar 11 ou 14 dígitos)
    r02 += "0000000";                                         // 31-37 Cód. Espécie
    r02 += padN(codAcum, 7);                                  // 38-44 Acumulador
    r02 += padC(n.prestador_uf, 2);                           // 45-46 UF
    r02 += "0000000";                                         // 47-53 Segmento
    r02 += padN(numNfeDigits.slice(-7), 7);                   // 54-60 Nº NFe (7)
    r02 += "0000000";                                         // 61-67 Documento Final
    r02 += padC("U", 7);                                      // 68-74 Série "U      "
    r02 += formatDateD(dataComp);                             // 75-84 Data Competência
    r02 += formatDateD(n.emissao_nfe);                        // 85-94 Emissão
    r02 += padR(Number(n.valor_contabil ?? 0), 2, 13);        // 95-107 Valor Contábil
    r02 += " ".repeat(30);                                    // 108-137 Reservado
    r02 += "E";                                               // 138 CRF
    r02 += "E";                                               // 139 IRRF
    r02 += "E";                                               // 140 CRFOP
    r02 += "E";                                               // 141 IRRFP
    r02 += " ";                                               // 142
    r02 += padN(n.prestador_municipio_ibge, 7);               // 143-149 IBGE
    r02 += "0000000";                                         // 150-156 Cód. Observação
    r02 += "0000000";                                         // 157-163 Cód. modelo doc
    r02 += "0000000";                                         // 164-170 Cód. fiscal prestação
    r02 += " ".repeat(7);                                     // 171-177 Sub Série
    r02 += " ".repeat(20);                                    // 178-197 IE
    r02 += " ".repeat(20);                                    // 198-217 IM
    r02 += padC(n.observacao, 300);                           // 218-517 Observação
    r02 += " ".repeat(100);                                   // 518-617

    if (r02.length !== 617) {
      return json({
        ok: false,
        error: `Falha interna: registro 02 (seq ${seq}) tem ${r02.length} chars (esperado 617).`,
      }, 500);
    }
    linhas.push(r02);

    // REGISTRO 12 — opcional
    const servMun = (n.servico_municipal ?? "").toString().trim();
    if (servMun) {
      let r12 = "";
      r12 += "12";                                            // 1-2
      r12 += padN(seq, 7);                                    // 3-9 (mesmo seq do 02)
      r12 += "0000001";                                       // 10-16
      r12 += padC(servMun, 20);                               // 17-36
      r12 += " ".repeat(100);                                 // 37-136
      if (r12.length !== 136) {
        return json({
          ok: false,
          error: `Falha interna: registro 12 (seq ${seq}) tem ${r12.length} chars (esperado 136).`,
        }, 500);
      }
      linhas.push(r12);
    }
  }

  const conteudo = linhas.join("\r\n") + "\r\n";
  const bytes = toLatin1Bytes(conteudo);

  // 5. Atualiza status
  const novoStatus = comp.status === "concluida" ? "exportada" : "exportada";
  const updatePayload: Record<string, unknown> = {
    status: novoStatus,
    exportada_em: new Date().toISOString(),
  };
  const { error: updErr } = await admin
    .from("competencias")
    .update(updatePayload)
    .eq("id", competencia_id);
  if (updErr) {
    return json({ ok: false, error: `Falha ao atualizar status: ${updErr.message}` }, 500);
  }

  const filename = `dominio_${cnpjDigitsCliente}_${comp.periodo}.txt`;
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=windows-1252",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
