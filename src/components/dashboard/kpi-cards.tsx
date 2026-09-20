import { Card, CardContent } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";
import { PhoneCall, CheckCircle2, Clock, Coins } from "lucide-react";

interface KpiCardsProps {
  stats: {
    total_calls: number;
    answered_calls: number;
    answer_rate_percentage: number;
    avg_duration_seconds: number;
    total_credits_spent: number;
  };
}

export function KpiCards({ stats }: KpiCardsProps) {
  const cards = [
    {
      title: "Total calls",
      value: stats.total_calls.toLocaleString(),
      subtitle: `${stats.answered_calls} answered by callee`,
      icon: PhoneCall,
      iconColor: "text-violet-600 dark:text-violet-400",
      bgColor: "bg-violet-50 dark:bg-violet-950/60",
    },
    {
      title: "Answer rate",
      value: `${stats.answer_rate_percentage}%`,
      subtitle: "Callee pickup & engagement",
      icon: CheckCircle2,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-950/60",
    },
    {
      title: "Average talk time",
      value: formatDuration(stats.avg_duration_seconds),
      subtitle: "Talk time per completed call",
      icon: Clock,
      iconColor: "text-sky-600 dark:text-sky-400",
      bgColor: "bg-sky-50 dark:bg-sky-950/60",
    },
    {
      title: "Credits spent",
      value: `${stats.total_credits_spent.toFixed(2)} cr`,
      subtitle: "Voice runtime + telephony",
      icon: Coins,
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-950/60",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <Card key={idx}>
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                  {card.title}
                </span>
                <div className="mt-1 text-2xl font-bold text-stone-900 dark:text-white">
                  {card.value}
                </div>
                <span className="text-[11px] text-stone-400 block mt-0.5">
                  {card.subtitle}
                </span>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.bgColor} ${card.iconColor}`}>
                <Icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
