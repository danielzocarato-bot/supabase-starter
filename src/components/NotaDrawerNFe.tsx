import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { ArrowDownToLine, ArrowUpFromLine, ChevronsUpDown } from "lucide-react";
import { formatCNPJ } from "@/lib/format";

export type DrawerNota = {
  id: string;
  numero_nfe: string | null;
  chave_nfe: string | null;
  emissao_nfe: string | null;
  valor_nfe: number | null;
  cancelada: boolean;
  observacao: string | null;
  tipo_operacao_nfe: string | null;
  prestador_razao: string | null;
  prestador_cnpj: string | null;
  raw_data: any;
};

export type DrawerItem = {
  id: string;
  numero_item: number;
  codigo_produto: string | null;
  descricao_produto: string | null;
  ncm: string | null;
  cfop: string | null;
  valor: number | null;
  acumulador_id: string | null;
};

export type DrawerAcumulador = {
  id: string;
  codigo: number;
  descricao: string;
};

function formatBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
}
function formatDateBR(d: string | null | undefined) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}
function normalize(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value ?? "—"}</div>
    </div>
  );
}

function AcumuladorCombobox({
  valueId, acumuladores, disabled, onChange,
}: {
  valueId: string | null;
  acumuladores: DrawerAcumulador[];
  disabled?: boolean;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const atual = valueId ? acumuladores.find((a) => a.id === valueId) : null;
  const filtrados = useMemo(() => {
    const q = normalize(query);
    if (!q) return acumuladores;
    return acumuladores.filter((a) => normalize(a.descricao).includes(q));
  }, [acumuladores, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`w-full justify-between font-normal ${atual ? "" : "text-muted-foreground"}`}
        >
          <span className="truncate">{atual ? atual.descricao : "Selecione um acumulador…"}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput autoFocus value={query} onValueChange={setQuery} placeholder="Buscar acumulador…" />
          <CommandList>
            <CommandEmpty>Nenhum acumulador encontrado.</CommandEmpty>
            {valueId && (
              <CommandGroup>
                <CommandItem
                  value="__limpar__"
                  onSelect={() => { setOpen(false); onChange(null); }}
                  className="text-muted-foreground"
                >
                  Limpar classificação
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup>
              {filtrados.map((a) => (
                <CommandItem key={a.id} value={a.id} onSelect={() => { setOpen(false); onChange(a.id); }}>
                  {a.descricao}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function NotaDrawerNFe({
  nota, itens, acumuladores, readOnly, pisca,
  onClose, onClassificarItem,
}: {
  nota: DrawerNota | null;
  itens: DrawerItem[];
  acumuladores: DrawerAcumulador[];
  readOnly: boolean;
  pisca: Set<string>;
  onClose: () => void;
  onClassificarItem: (itemId: string, acumuladorId: string | null) => void;
}) {
  const open = !!nota;

  const valorClassificado = useMemo(() => {
    if (!nota) return 0;
    return itens.filter((i) => i.acumulador_id).reduce((s, i) => s + (Number(i.valor) || 0), 0);
  }, [nota, itens]);

  const tipoSaida = nota?.tipo_operacao_nfe === "saida";
  const TipoIcon = tipoSaida ? ArrowUpFromLine : ArrowDownToLine;
  const tipoLabel = tipoSaida ? "Saída" : "Entrada";
  const parceiroLabel = tipoSaida ? "Destinatário" : "Emitente";
  const serie = nota?.raw_data?.serie ?? nota?.raw_data?.ide?.serie ?? null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] sm:w-[480px] p-0 flex flex-col">
        {nota && (
          <>
            <SheetHeader className="p-6 pb-4 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="bg-brand-soft text-brand border-brand/20 gap-1">
                  <TipoIcon className="h-3 w-3" />
                  {tipoLabel}
                </Badge>
                {nota.cancelada && <Badge variant="destructive">CANCELADA</Badge>}
              </div>
              <SheetTitle className="text-xl font-display">
                NF-e {nota.numero_nfe ?? "—"}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {nota.prestador_razao ?? "—"} · {formatCNPJ(nota.prestador_cnpj)}
              </p>
            </SheetHeader>

            <Tabs defaultValue="resumo" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="mx-6 mt-3 self-start">
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="itens">Itens ({itens.length})</TabsTrigger>
                <TabsTrigger value="bruto">Bruto</TabsTrigger>
              </TabsList>

              <TabsContent value="resumo" className="flex-1 overflow-y-auto px-6 pb-6 mt-2 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Número" value={nota.numero_nfe} />
                  <Field label="Série" value={serie} />
                  <Field label="Emissão" value={formatDateBR(nota.emissao_nfe)} />
                  <Field label="Tipo" value={tipoLabel} />
                  <Field label={parceiroLabel} value={
                    <div className="space-y-0.5">
                      <div>{nota.prestador_razao ?? "—"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{formatCNPJ(nota.prestador_cnpj)}</div>
                    </div>
                  } />
                  <Field label="Status" value={nota.cancelada ? "Cancelada" : "Ativa"} />
                  <Field label="Valor total" value={
                    <span className="tabular-nums">{formatBRL(nota.valor_nfe)}</span>
                  } />
                  <Field label="Valor classificado" value={
                    <span className="tabular-nums">{formatBRL(valorClassificado)}</span>
                  } />
                </div>
                {nota.chave_nfe && (
                  <Field label="Chave de acesso" value={
                    <span className="font-mono text-xs break-all">{nota.chave_nfe}</span>
                  } />
                )}
                {nota.observacao && (
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Observação</div>
                    <div className="text-sm whitespace-pre-wrap">{nota.observacao}</div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="itens" className="flex-1 overflow-y-auto px-2 pb-6 mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>NCM</TableHead>
                      <TableHead>CFOP</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((i) => {
                      const isPiscando = pisca.has(i.id);
                      return (
                        <FragmentWithKey key={i.id}>
                          <motion.tr
                            animate={
                              isPiscando
                                ? { backgroundColor: ["hsl(var(--success) / 0.15)", "hsl(var(--success) / 0)"] }
                                : { backgroundColor: "hsl(var(--success) / 0)" }
                            }
                            transition={{ duration: 0.6, ease: "easeOut" }}
                            className="border-b"
                          >
                            <TableCell className="tabular-nums align-top">{i.numero_item}</TableCell>
                            <TableCell className="align-top">
                              <div className="text-sm">{i.descricao_produto ?? "—"}</div>
                              {i.codigo_produto && (
                                <div className="text-xs text-muted-foreground font-mono">{i.codigo_produto}</div>
                              )}
                            </TableCell>
                            <TableCell className="tabular-nums align-top">{i.ncm ?? "—"}</TableCell>
                            <TableCell className="tabular-nums align-top">{i.cfop ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums align-top whitespace-nowrap">
                              {formatBRL(i.valor)}
                            </TableCell>
                          </motion.tr>
                          <tr className="border-b last:border-b-0">
                            <td colSpan={5} className="px-4 py-2 bg-muted/10">
                              <AcumuladorCombobox
                                valueId={i.acumulador_id}
                                acumuladores={acumuladores}
                                disabled={readOnly || nota.cancelada}
                                onChange={(aid) => onClassificarItem(i.id, aid)}
                              />
                            </td>
                          </tr>
                        </FragmentWithKey>
                      );
                    })}
                  </TableBody>
                </Table>
              </TabsContent>

              <TabsContent value="bruto" className="flex-1 overflow-y-auto px-6 pb-6 mt-2">
                <pre className="text-xs font-mono bg-muted/30 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(nota.raw_data ?? {}, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
