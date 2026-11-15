import type { ReactNode } from "react";
import { formatDuration, formatHoursMinutes } from "@/lib/ui-format";

export type ChartPoint = {
  key: string;
  label: string;
  shortLabel?: string;
  accessibleLabel: string;
  seconds: number;
};

type BarChartProps = {
  id: string;
  title: string;
  subtitle: string;
  points: ChartPoint[];
  emptyMessage: string;
  toolbar?: ReactNode;
};

export function BarChart({
  id,
  title,
  subtitle,
  points,
  emptyMessage,
  toolbar,
}: BarChartProps) {
  const total = points.reduce((sum, point) => sum + point.seconds, 0);
  const max = Math.max(1, ...points.map((point) => point.seconds));

  return (
    <section className="chart-card" aria-labelledby={`${id}-title`}>
      <div className="chart-head">
        <div>
          <h2 id={`${id}-title`} className="chart-title">
            {title}
          </h2>
          <p className="chart-subtitle">{subtitle}</p>
        </div>
        <div className="chart-total">
          <span>Total</span>
          <strong>{formatDuration(total)}</strong>
        </div>
      </div>

      {toolbar ? <div className="chart-toolbar">{toolbar}</div> : null}

      <ul className="chart-bars">
        {points.map((point) => {
          const height =
            point.seconds > 0
              ? Math.max(2.5, (point.seconds / max) * 82)
              : 0;
          const value = formatDuration(point.seconds);
          const barLabel = formatHoursMinutes(point.seconds);

          return (
            <li
              key={point.key}
              className="chart-column"
              aria-label={`${point.accessibleLabel}: ${value} active`}
              title={`${point.accessibleLabel} · ${value}`}
            >
              <span className="chart-bar-track" aria-hidden="true">
                {point.seconds > 0 ? (
                  <span
                    className="chart-value"
                    style={{ bottom: `calc(${height}% + 7px)` }}
                  >
                    {barLabel}
                  </span>
                ) : null}
                <span
                  className={`chart-bar${point.seconds === 0 ? " is-empty" : ""}`}
                  style={{ height: `${height}%` }}
                />
              </span>
              <span
                className={`chart-label${point.shortLabel ? " has-short" : ""}`}
                aria-hidden="true"
              >
                <span className="chart-label-full">{point.label}</span>
                {point.shortLabel ? (
                  <span className="chart-label-short">{point.shortLabel}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {total === 0 ? <p className="chart-empty">{emptyMessage}</p> : null}
    </section>
  );
}
