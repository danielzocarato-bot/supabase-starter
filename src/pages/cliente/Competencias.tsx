import { Card } from "@/components/ui/card";

export default function ClienteCompetencias() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-semibold">Minhas Competências</h1>
        <p className="text-muted-foreground mt-1">Acompanhe e classifique as notas enviadas pela sua contabilidade.</p>
      </div>
      <Card className="p-12 rounded-xl text-center">
        <p className="text-muted-foreground max-w-md mx-auto">
          Por aqui ainda não há nada para classificar. Assim que sua contabilidade enviar a planilha do mês, ela aparece aqui.
        </p>
      </Card>
    </div>
  );
}
