import { CalendarCheck, ClipboardList, Scale, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// S0 placeholder. Slice S2 replaces this page with the automatic demo sign-in (EM-58).
const loop = [
  { icon: CalendarCheck, title: "Create your event", text: "Occasion, date, budget in any currency, and guests." },
  { icon: Wallet, title: "Get a plan you control", text: "Budget lines that add up exactly, plus a task timeline." },
  { icon: ClipboardList, title: "Revise when things change", text: "See every effect before you apply it." },
  { icon: Scale, title: "Compare vendor quotes", text: "Hidden charges and unclear tax are flagged for you." },
] as const;

export default function HomePage(): React.ReactElement {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-8 px-4 py-12 sm:px-8">
      <header className="flex flex-col gap-3">
        <Badge variant="info" className="w-fit">
          Coming online
        </Badge>
        <h1 className="font-bold text-3xl text-foreground sm:text-4xl">PlanCraft</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Plan a celebration within your budget, and keep the plan working when the budget, date or
          guest list changes.
        </p>
      </header>

      <ol className="grid gap-5 sm:grid-cols-2" aria-label="How PlanCraft works">
        {loop.map(({ icon: Icon, title, text }, index) => (
          <li key={title}>
            <Card className="h-full shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon aria-hidden="true" className="size-5 text-primary" />
                  <span>
                    <span className="sr-only">Step {index + 1}: </span>
                    {title}
                  </span>
                </CardTitle>
                <CardDescription>{text}</CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ol>
    </main>
  );
}
