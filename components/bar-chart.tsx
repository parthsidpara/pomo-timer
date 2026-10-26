import { formatDuration } from "@/lib/ui-format";

export type ChartPoint = {
  key: string;
  label: string;
  accessibleLabel: string;
  seconds: number;
};

type BarChartProps = {
  id: string;
  title: string;
  subtitle: string;
  points: ChartPoint[];
  emptyMessage: string;
};

export function BarChart({
  id,
  title,
  subtitle,
  points,
  emptyMessage,
}: BarChartProps) {
  const total = points.reduce((sum, point) => sum + point.seconds, 0);
  const max = Math.max(1, ...points.map((point) => point.seconds));

  return (
    <section className="chart-card" aria-labelledby={`${id}-title`}>
      <div className="chart-head">
        <div>
          <p className="chart-subtitle">{subtitle}</p>
          <h2 id={`${id}-title`} className="chart-title">
            {title}
          </h2>
        </div>
        <div className="chart-total">
          <span>Total</span>
          <strong>{formatDuration(total)}</strong>
        </div>
      </div>

      <ul className="chart-bars">
        {points.map((point) => {
          const height =
            point.seconds > 0
              ? Math.max(2.5, (point.seconds / max) * 100)
              : 0;
          const value = formatDuration(point.seconds);

          return (
            <li
              key={point.key}
              className="chart-column"
              aria-label={`${point.accessibleLabel}: ${value} active`}
              title={`${point.accessibleLabel} · ${value}`}
            >
              <span className="chart-bar-track" aria-hidden="true">
                <span
                  className={`chart-bar${point.seconds === 0 ? " is-empty" : ""}`}
                  style={{ height: `${height}%` }}
                />
              </span>
              <span className="chart-label" aria-hidden="true">
                {point.label}
              </span>
            </li>
          );
        })}
      </ul>

      {total === 0 ? <p className="chart-empty">{emptyMessage}</p> : null}
    </section>
  );
}
