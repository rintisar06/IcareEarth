"use client";

/**
 * IcareEarth — the counterfactual twin.
 *
 * Two futures from the same starting point. Every number here comes from the
 * engine; this component only draws.
 */

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CATEGORY_LABELS,
  cumulativeSeries,
  dominantCategory,
  type Footprint,
} from "@/lib/engine";
import { toTonnes } from "@/lib/equivalents";

const HORIZONS = [1, 5, 10] as const;

export default function TwinChart({
  footprint,
  savingsKgPerYear,
  leverLabel,
}: {
  footprint: Footprint;
  savingsKgPerYear: number;
  leverLabel: string;
}) {
  const [years, setYears] = useState<number>(10);

  const data = cumulativeSeries(footprint, savingsKgPerYear, years).map((p) => ({
    ...p,
    now: p.now / 1000,
    withLever: p.withLever / 1000,
  }));

  const gapKg = savingsKgPerYear * years;
  const category = dominantCategory(footprint);
  const categoryKg = footprint[category];
  const yearsOfCategory = categoryKg > 0 ? gapKg / categoryKg : 0;
  const thisYear = new Date().getFullYear();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Two versions of your next decade</h3>
        <div className="flex gap-1" role="group" aria-label="Time horizon">
          {HORIZONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setYears(h)}
              aria-pressed={years === h}
              // min-h-11 keeps these a comfortable 44px touch target; they are
              // the most-tapped controls on the page.
              className={`min-h-11 rounded-lg border px-3.5 text-xs font-medium ${
                years === h
                  ? "border-accent bg-accent-soft text-foreground"
                  : "border-border text-muted"
              }`}
            >
              {h} {h === 1 ? "year" : "years"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
            <defs>
              <linearGradient id="nowFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--warm)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--warm)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="leverFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(y) => (y === 0 ? "now" : `+${y}y`)}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `${v.toFixed(0)}t`}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--foreground)",
              }}
              labelFormatter={(y) => (y === 0 ? "Today" : `${y} years from now`)}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)} tonnes`,
                name === "now" ? "You now" : "You with this lever",
              ]}
            />
            <Area
              type="monotone"
              dataKey="now"
              stroke="var(--warm)"
              strokeWidth={2}
              fill="url(#nowFill)"
            />
            <Area
              type="monotone"
              dataKey="withLever"
              stroke="var(--accent)"
              strokeWidth={2}
              fill="url(#leverFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-0.5 w-4 rounded" style={{ background: "var(--warm)" }} />
          You now
        </span>
        <span className="flex items-center gap-1.5 text-muted">
          <span className="h-0.5 w-4 rounded" style={{ background: "var(--accent)" }} />
          {leverLabel}
        </span>
      </div>

      <p className="mt-4 border-l-2 border-accent pl-3 text-sm leading-relaxed">
        By <strong>{thisYear + years}</strong> the gap is{" "}
        <strong>{toTonnes(gapKg)} tonnes</strong>
        {yearsOfCategory >= 0.1 && (
          <>
            , roughly <strong>{yearsOfCategory.toFixed(1)} years</strong> of your
            current {CATEGORY_LABELS[category]}
          </>
        )}
        .
      </p>
    </div>
  );
}
