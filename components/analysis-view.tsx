import { BarChart, type ChartPoint } from "./bar-chart";
import type { AnalysisData } from "@/lib/analysis";
import {
  formatIstDayMonth,
  formatIstShortDate,
  formatIstWeekday,
} from "@/lib/ist-dates";
import { formatDuration } from "@/lib/ui-format";

function formatMetric(seconds: number | null): string {
  return seconds === null ? "—" : formatDuration(seconds);
}

type AnalysisViewProps = {
  analysis: AnalysisData;
  loading: boolean;
  error: string | null;
};

export function AnalysisView({
  analysis,
  loading,
  error,
}: AnalysisViewProps) {
  const dailyPoints: ChartPoint[] = analysis.daily.map((bucket) => ({
    key: bucket.key,
    label: formatIstWeekday(bucket.start),
    accessibleLabel: formatIstShortDate(bucket.start),
    seconds: bucket.activeSeconds,
  }));

  const weeklyPoints: ChartPoint[] = analysis.weekly.map((bucket) => ({
    key: bucket.key,
    label: formatIstDayMonth(bucket.start),
    accessibleLabel: `Week of ${formatIstShortDate(bucket.start)}`,
    seconds: bucket.activeSeconds,
  }));

  const dailyRange = `${formatIstDayMonth(
    analysis.daily[0].start,
  )} – ${formatIstDayMonth(analysis.daily[analysis.daily.length - 1].start)}`;

  const tags = analysis.tags;
  const largestTag = Math.max(1, tags[0]?.activeSeconds ?? 0);
  const noCompletedSessions = analysis.summary.completedSessionCount === 0;

  return (
    <main className="main analysis-page">
      <header className="analysis-header">
        <div>
          <p className="analysis-kicker">Patterns / IST</p>
          <h1 className="analysis-title">Analysis</h1>
        </div>
        <p className="analysis-scope">
          Completed sessions
          <span>Last 8 weeks</span>
        </p>
      </header>

      {error ? (
        <p className="banner banner-warning" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="analysis-loading" role="status">
          <p>Reading completed sessions…</p>
          <div className="loading-rule" aria-hidden="true">
            <span />
          </div>
        </div>
      ) : (
        <>
          {noCompletedSessions ? (
            <p className="analysis-empty">
              No completed sessions in the last 8 weeks. Stop a session and its
              time will appear here.
            </p>
          ) : null}

          <section className="stat-band" aria-label="Summary statistics">
            <div className="stat">
              <span className="stat-label">Active time</span>
              <strong className="stat-value">
                {formatDuration(analysis.summary.totalActiveSeconds)}
              </strong>
            </div>
            <div className="stat">
              <span className="stat-label">Sessions</span>
              <strong className="stat-value">
                {analysis.summary.completedSessionCount}
              </strong>
            </div>
            <div className="stat">
              <span className="stat-label">Avg session</span>
              <strong className="stat-value">
                {formatMetric(analysis.summary.averageActiveSeconds)}
              </strong>
            </div>
            <div className="stat">
              <span className="stat-label">Longest</span>
              <strong className="stat-value">
                {formatMetric(analysis.summary.longestActiveSeconds)}
              </strong>
            </div>
          </section>

          <BarChart
            id="daily-chart"
            title="Daily"
            subtitle={`Last 7 days · ${dailyRange}`}
            points={dailyPoints}
            emptyMessage="No completed sessions in the last 7 days."
          />

          <BarChart
            id="weekly-chart"
            title="Weekly"
            subtitle="Last 8 weeks · Monday to Sunday"
            points={weeklyPoints}
            emptyMessage="No completed sessions in the last 8 weeks."
          />

          {tags.length > 0 ? (
            <section className="tag-panel" aria-labelledby="tag-panel-title">
              <div className="chart-head">
                <div>
                  <p className="chart-subtitle">
                    Completed sessions · last 8 weeks
                  </p>
                  <h2 id="tag-panel-title" className="chart-title">
                    By tag
                  </h2>
                </div>
              </div>

              <div className="tag-totals">
                {tags.map((tag) => {
                  const width = Math.max(
                    2,
                    (tag.activeSeconds / largestTag) * 100,
                  );

                  return (
                    <div className="tag-total-row" key={tag.tag}>
                      <span className="tag-total-name">{tag.tag}</span>
                      <span className="tag-total-track" aria-hidden="true">
                        <span
                          className="tag-total-fill"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                      <span className="tag-total-value">
                        {formatDuration(tag.activeSeconds)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <p className="analysis-footnote">
            Completed sessions only · pauses excluded ·{" "}
            {formatIstDayMonth(analysis.windowStart)} onward
          </p>
        </>
      )}
    </main>
  );
}
