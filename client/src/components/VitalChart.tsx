import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { VitalDataPoint } from "@/lib/fhir-clinical";

type VitalChartProps = {
  title: string;
  series: Array<{ name: string; points: VitalDataPoint[]; color: string }>;
};

function buildChartData(series: VitalChartProps["series"]) {
  const dateMap = new Map<string, Record<string, number | string>>();

  for (const s of series) {
    for (const p of s.points) {
      const key = p.date.slice(0, 10);
      const row = dateMap.get(key) ?? { date: key };
      row[s.name] = p.value;
      dateMap.set(key, row);
    }
  }

  return Array.from(dateMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
}

export function VitalChart({ title, series }: VitalChartProps) {
  const nonEmpty = series.filter((s) => s.points.length > 0);
  if (nonEmpty.length === 0) return null;

  const data = buildChartData(nonEmpty);

  return (
    <div className="rounded-lg border p-4">
      <h4 className="mb-3 text-sm font-semibold">{title}</h4>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {nonEmpty.map((s) => (
              <Line
                key={s.name}
                type="monotone"
                dataKey={s.name}
                stroke={s.color}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
