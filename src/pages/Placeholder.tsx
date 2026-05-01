import { Card } from "@/components/ui/card";

export default function Placeholder({ titulo, descricao }: { titulo: string; descricao?: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-semibold">{titulo}</h1>
        {descricao && <p className="text-muted-foreground mt-1">{descricao}</p>}
      </div>
      <Card className="p-12 rounded-xl text-center">
        <p className="text-muted-foreground">Esta área será construída na próxima fase.</p>
      </Card>
    </div>
  );
}
