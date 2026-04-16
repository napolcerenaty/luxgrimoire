import { useState, useEffect, useCallback } from "react";
import { API } from "./api";
import "./SpendingStatsPage.css";

const CURRENCIES = ["GBP", "EUR", "USD", "PLN", "CZK", "SEK", "DKK", "NOK", "AUD", "CAD", "CHF"];

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const SOURCE_LABELS = {
  OFFICIAL:    "Official / Store",
  SECOND_HAND: "Second-hand",
  GIFT:        "Gift",
  OTHER:       "Other",
};

const SOURCE_COLORS = {
  OFFICIAL:    "#7c3aed",
  SECOND_HAND: "#0ea5e9",
  GIFT:        "#10b981",
  OTHER:       "#94a3b8",
};

function fmt(value, currency) {
  if (value == null) return "—";
  const num = parseFloat(value);
  if (isNaN(num)) return "—";
  return num.toLocaleString("en-GB", {
    style: "currency",
    currency: currency || "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, currency, sub, accent, icon }) {
  return (
    <div className={`ss-card ${accent ? "ss-card--accent" : ""}`}>
      <div className="ss-card-icon">{icon}</div>
      <div className="ss-card-value">{fmt(value, currency)}</div>
      <div className="ss-card-label">{label}</div>
      {sub && <div className="ss-card-sub">{sub}</div>}
    </div>
  );
}

function MonthlyChart({ data, currency }) {
  if (!data || data.length === 0) return <div className="ss-empty">No monthly data yet.</div>;

  const maxTotal = Math.max(...data.map(d => parseFloat(d.total) || 0), 0.01);

  return (
    <div className="ss-monthly-chart">
      <div className="ss-bars">
        {data.map(row => {
          const subs = parseFloat(row.subscriptions) || 0;
          const purch = parseFloat(row.purchases)    || 0;
          const total = subs + purch;
          const subsH  = total > 0 ? (subs  / maxTotal) * 100 : 0;
          const purchH = total > 0 ? (purch / maxTotal) * 100 : 0;
          return (
            <div className="ss-bar-col" key={`${row.year}-${row.month}`}>
              <div className="ss-bar-wrap" title={`${MONTH_NAMES[row.month - 1]} ${row.year}\nSubs: ${fmt(subs, currency)}\nPurchases: ${fmt(purch, currency)}`}>
                <div className="ss-bar-seg ss-bar-purch" style={{ height: `${purchH}%` }} />
                <div className="ss-bar-seg ss-bar-subs"  style={{ height: `${subsH}%` }} />
              </div>
              <div className="ss-bar-label">
                {MONTH_NAMES[row.month - 1]}
                {row.month === 1 && <span className="ss-bar-year">{row.year}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="ss-chart-legend">
        <span><span className="ss-dot ss-dot-subs" />Subscriptions</span>
        <span><span className="ss-dot ss-dot-purch" />Purchases</span>
      </div>
    </div>
  );
}

function CompanyBreakdown({ data, currency }) {
  if (!data || data.length === 0) return <div className="ss-empty">No subscription data yet.</div>;
  const maxTotal = Math.max(...data.map(d => parseFloat(d.total) || 0), 0.01);

  return (
    <div className="ss-company-list">
      {data.map(row => {
        const pct = ((parseFloat(row.total) || 0) / maxTotal) * 100;
        return (
          <div className="ss-company-row" key={row.companyId}>
            <div className="ss-company-head">
              {row.logoUrl && <img className="ss-company-logo" src={row.logoUrl} alt={row.companyName} />}
              <span className="ss-company-name">{row.companyName}</span>
              <span className="ss-company-amount">{fmt(row.total, currency)}</span>
            </div>
            <div className="ss-progress-track">
              <div className="ss-progress-bar" style={{ width: `${pct}%` }} />
            </div>
            <div className="ss-company-meta">
              <span>Base {fmt(row.baseAmount, currency)}</span>
              <span>Taxes {fmt(row.taxes, currency)}</span>
              <span>Shipping {fmt(row.shipping, currency)}</span>
              <span className="ss-company-periods">{row.periodCount} billing period{row.periodCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourceBreakdown({ data, currency }) {
  if (!data || data.length === 0) return <div className="ss-empty">No purchase data yet.</div>;
  const totalAll = data.reduce((s, r) => s + (parseFloat(r.total) || 0), 0) || 0.01;

  return (
    <div className="ss-source-list">
      {data.map(row => {
        const pct = ((parseFloat(row.total) || 0) / totalAll) * 100;
        const color = SOURCE_COLORS[row.source] || SOURCE_COLORS.OTHER;
        return (
          <div className="ss-source-row" key={row.source}>
            <div className="ss-source-head">
              <span className="ss-source-dot" style={{ background: color }} />
              <span className="ss-source-name">{SOURCE_LABELS[row.source] || row.source}</span>
              <span className="ss-source-pct">{pct.toFixed(1)}%</span>
              <span className="ss-source-amount">{fmt(row.total, currency)}</span>
            </div>
            <div className="ss-progress-track">
              <div className="ss-progress-bar" style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className="ss-source-meta">
              <span>{row.count} transaction{row.count !== 1 ? "s" : ""}</span>
              <span>Base {fmt(row.base, currency)}</span>
              <span>Taxes {fmt(row.taxes, currency)}</span>
              <span>Shipping {fmt(row.shipping, currency)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SubsTable({ data, currency }) {
  if (!data || data.length === 0) return <div className="ss-empty">No subscription history yet.</div>;
  return (
    <div className="ss-table-wrap">
      <table className="ss-table">
        <thead>
          <tr>
            <th>Subscription</th>
            <th>Company</th>
            <th className="ss-num">Periods</th>
            <th className="ss-num">Avg/period</th>
            <th className="ss-num">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={`${row.subscriptionId}-${row.companyId}`}>
              <td>{row.subscriptionName || "—"}</td>
              <td>{row.companyName || "—"}</td>
              <td className="ss-num">{row.periodCount}</td>
              <td className="ss-num">{fmt(row.avgPerPeriod, currency)}</td>
              <td className="ss-num ss-bold">{fmt(row.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function YearTable({ data, currency }) {
  if (!data || data.length === 0) return <div className="ss-empty">No yearly data yet.</div>;
  return (
    <div className="ss-table-wrap">
      <table className="ss-table">
        <thead>
          <tr>
            <th>Year</th>
            <th className="ss-num">Subscriptions</th>
            <th className="ss-num">Purchases</th>
            <th className="ss-num">Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.year}>
              <td>{row.year}</td>
              <td className="ss-num">{fmt(row.subscriptions, currency)}</td>
              <td className="ss-num">{fmt(row.purchases, currency)}</td>
              <td className="ss-num ss-bold">{fmt(row.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastSection({ forecast, currency }) {
  if (!forecast) return null;
  const { months = [], preorders = [], preorderTotal } = forecast;
  const hasData = months.some(m => m.subscriptions?.length > 0) || preorders.length > 0;

  if (!hasData) return (
    <div className="ss-empty">No upcoming expenses forecast. Add active subscriptions to see projections.</div>
  );

  return (
    <div className="ss-forecast">
      {months.map(m => (
        m.subscriptions?.length > 0 && (
          <div className="ss-forecast-month" key={`${m.year}-${m.month}`}>
            <div className="ss-forecast-month-title">
              {MONTH_NAMES[m.month - 1]} {m.year}
              <span className="ss-forecast-subtotal">{fmt(m.subtotal, currency)}</span>
            </div>
            {m.subscriptions.map((sub, i) => (
              <div className="ss-forecast-sub" key={i}>
                {sub.logoUrl && <img className="ss-forecast-logo" src={sub.logoUrl} alt={sub.companyName} />}
                <div className="ss-forecast-sub-info">
                  <span className="ss-forecast-sub-name">{sub.companyName} — {sub.subscriptionName}</span>
                  {sub.renewalDay && <span className="ss-forecast-sub-day">~day {sub.renewalDay}</span>}
                </div>
                <span className="ss-forecast-sub-amount">{fmt(sub.estimatedAmount, currency)}</span>
              </div>
            ))}
          </div>
        )
      ))}
      {preorders.length > 0 && (
        <div className="ss-forecast-month">
          <div className="ss-forecast-month-title">
            📦 Preorders
            <span className="ss-forecast-subtotal">{fmt(preorderTotal, currency)}</span>
          </div>
          {preorders.map((p, i) => (
            <div className="ss-forecast-sub" key={i}>
              <div className="ss-forecast-sub-info">
                <span className="ss-forecast-sub-name">{p.bookTitle}</span>
                {p.editionName && <span className="ss-forecast-sub-day">{p.editionName}</span>}
              </div>
              <span className="ss-forecast-sub-amount">{fmt(p.allocatedPrice, currency)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SpendingStatsPage() {
  const [currency, setCurrency]   = useState(() => localStorage.getItem("ss_currency") || "GBP");
  const [stats, setStats]         = useState(null);
  const [forecast, setForecast]   = useState(null);
  const [sales, setSales]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = useCallback(async (curr) => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, forecastRes, salesRes] = await Promise.all([
        fetch(API.SPENDING_STATS(curr), { credentials: "include" }),
        fetch(API.SPENDING_FORECAST(curr), { credentials: "include" }),
        fetch(API.SPENDING_SALES(curr), { credentials: "include" }),
      ]);
      if (!statsRes.ok) throw new Error(`Stats request failed: ${statsRes.status}`);
      const [statsData, forecastData, salesData] = await Promise.all([
        statsRes.json(), forecastRes.json(), salesRes.ok ? salesRes.json() : null,
      ]);
      setStats(statsData);
      setForecast(forecastData);
      setSales(salesData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(currency);
  }, [currency, fetchData]);

  function handleCurrencyChange(c) {
    setCurrency(c);
    localStorage.setItem("ss_currency", c);
  }

  if (loading) return <div className="ss-loading"><div className="ss-spinner" />Loading spending stats…</div>;
  if (error)   return <div className="ss-error">⚠️ {error} <button onClick={() => fetchData(currency)} className="ss-retry">Retry</button></div>;
  if (!stats)  return null;

  const { overall = {}, monthly = [], byCompany = [], bySubscription = [],
          bySource = [], byYear = [] } = stats;

  const trendDir  = overall.trendVsLastYear != null
    ? parseFloat(overall.trendVsLastYear) >= 0 ? "▲" : "▼" : null;
  const trendColor = overall.trendVsLastYear != null
    ? parseFloat(overall.trendVsLastYear) >= 0 ? "#ef4444" : "#22c55e" : null;

  const tabs = [
    { key: "overview", label: "📊 Overview" },
    { key: "monthly",  label: "📅 Monthly" },
    { key: "companies", label: "🏢 Companies" },
    { key: "purchases", label: "🛍️ Purchases" },
    { key: "sales",    label: "🏷️ Sales & ROI" },
    { key: "forecast",  label: "🔮 Forecast" },
  ];

  return (
    <div className="ss-page">
      {/* Header */}
      <div className="ss-header">
        <h2 className="section-title">💰 Spending Statistics</h2>
        <div className="ss-currency-selector">
          <span className="ss-currency-label">Display in</span>
          <select
            className="ss-currency-select"
            value={currency}
            onChange={e => handleCurrencyChange(e.target.value)}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="ss-cards-grid">
        <SummaryCard icon="💳" label="Total (all time)" value={overall.totalAllTime} currency={currency} accent />
        <SummaryCard icon="📆" label="This year"        value={overall.totalThisYear} currency={currency}
          sub={trendDir ? <span style={{ color: trendColor }}>{trendDir} {Math.abs(parseFloat(overall.trendVsLastYear))}% vs last year</span> : null} />
        <SummaryCard icon="📅" label="This month"       value={overall.totalThisMonth} currency={currency}
          sub={overall.totalLastMonth ? `Last month: ${fmt(overall.totalLastMonth, currency)}` : null} />
        <SummaryCard icon="📊" label="Avg / month"      value={overall.avgPerMonth} currency={currency}
          sub={overall.rolling6m ? `6-month avg: ${fmt(overall.rolling6m, currency)}` : null} />
        <SummaryCard icon="📮" label="Subscriptions"    value={overall.subsTotal} currency={currency} />
        <SummaryCard icon="🛍️" label="Single purchases" value={overall.purchasesTotal} currency={currency} />
      </div>

      {/* Collection value row */}
      <div className="ss-collection-row">
        <div className="ss-coll-card">
          <span className="ss-coll-icon">📚</span>
          <span className="ss-coll-val">{overall.booksOwned ?? "—"}</span>
          <span className="ss-coll-lab">Books owned</span>
        </div>
        <div className="ss-coll-card">
          <span className="ss-coll-icon">✅</span>
          <span className="ss-coll-val">{overall.booksRead ?? "—"}</span>
          <span className="ss-coll-lab">Books read</span>
        </div>
        <div className="ss-coll-card">
          <span className="ss-coll-icon">💵</span>
          <span className="ss-coll-val">{fmt(overall.avgCostPerBook, currency)}</span>
          <span className="ss-coll-lab">Avg cost / book</span>
        </div>
        <div className="ss-coll-card">
          <span className="ss-coll-icon">😴</span>
          <span className="ss-coll-val">{fmt(overall.unreadShelfValue, currency)}</span>
          <span className="ss-coll-lab">Unread shelf value</span>
        </div>
        <div className="ss-coll-card">
          <span className="ss-coll-icon">🚢</span>
          <span className="ss-coll-val">{fmt(overall.shippingTotal, currency)}</span>
          <span className="ss-coll-lab">Total shipping</span>
        </div>
        <div className="ss-coll-card">
          <span className="ss-coll-icon">🏛️</span>
          <span className="ss-coll-val">{fmt(overall.taxesTotal, currency)}</span>
          <span className="ss-coll-lab">Total taxes & fees</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="ss-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            className={`ss-tab ${activeTab === t.key ? "ss-tab--active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div className="ss-tab-content">
        {activeTab === "overview" && (
          <>
            <div className="ss-section">
              <h3 className="ss-section-title">Monthly spending (last 24 months)</h3>
              <MonthlyChart data={monthly.slice(-12)} currency={currency} />
            </div>
            <div className="ss-two-col">
              <div className="ss-section">
                <h3 className="ss-section-title">By company (subscriptions)</h3>
                <CompanyBreakdown data={byCompany} currency={currency} />
              </div>
              <div className="ss-section">
                <h3 className="ss-section-title">Year-by-year</h3>
                <YearTable data={byYear} currency={currency} />
              </div>
            </div>
          </>
        )}

        {activeTab === "monthly" && (
          <div className="ss-section">
            <h3 className="ss-section-title">All monthly data</h3>
            <MonthlyChart data={monthly} currency={currency} />
          </div>
        )}

        {activeTab === "companies" && (
          <>
            <div className="ss-section">
              <h3 className="ss-section-title">By company</h3>
              <CompanyBreakdown data={byCompany} currency={currency} />
            </div>
            <div className="ss-section">
              <h3 className="ss-section-title">By subscription</h3>
              <SubsTable data={bySubscription} currency={currency} />
            </div>
          </>
        )}

        {activeTab === "purchases" && (
          <>
            <div className="ss-section">
              <h3 className="ss-section-title">By purchase source</h3>
              <SourceBreakdown data={bySource} currency={currency} />
            </div>
            <div className="ss-section">
              <h3 className="ss-section-title">Cost breakdown</h3>
              <div className="ss-breakdown-grid">
                <div className="ss-breakdown-row">
                  <span>Base price</span>
                  <span className="ss-bold">{fmt(overall.baseTotal, currency)}</span>
                </div>
                <div className="ss-breakdown-row">
                  <span>Taxes & fees</span>
                  <span className="ss-bold">{fmt(overall.taxesTotal, currency)}</span>
                </div>
                <div className="ss-breakdown-row">
                  <span>Shipping</span>
                  <span className="ss-bold">{fmt(overall.shippingTotal, currency)}</span>
                </div>
                <div className="ss-breakdown-row ss-breakdown-total">
                  <span>Total</span>
                  <span className="ss-bold">{fmt(overall.totalAllTime, currency)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "sales" && (
          <div className="ss-section">
            <h3 className="ss-section-title">Sales & ROI</h3>
            {!sales || sales.booksSold === 0 ? (
              <div className="ss-empty">You haven't sold any books yet. Use the 🏷️ button in your collection to mark a book as sold.</div>
            ) : (
              <>
                {/* Summary cards */}
                <div className="ss-cards-grid">
                  <SummaryCard icon="🏷️" label="Total income" value={sales.totalIncome} currency={currency} accent />
                  <SummaryCard icon="📊" label="Net profit / loss" value={sales.totalProfit} currency={currency}
                    sub={parseFloat(sales.totalProfit) >= 0 ? "✅ You're in profit!" : "📉 Net loss so far"} />
                  <SummaryCard icon="📚" label="Books sold" value={sales.booksSold} currency={null} />
                  <SummaryCard icon="💵" label="Avg income / book" value={sales.avgIncome} currency={currency} />
                  <SummaryCard icon="✨" label="Avg profit / book" value={sales.avgProfit} currency={currency} />
                </div>

                {/* Top profitable sales */}
                {sales.topSales?.length > 0 && (
                  <>
                    <h4 className="ss-subsection-title">🏆 Top sales by profit</h4>
                    <div className="ss-table-wrap">
                      <table className="ss-table">
                        <thead><tr><th>Book</th><th>Edition</th><th>Venue</th><th>Date</th><th>Sold for</th><th>Cost</th><th>Profit</th></tr></thead>
                        <tbody>
                          {sales.topSales.map((s, i) => (
                            <tr key={i}>
                              <td>{s.bookTitle}</td>
                              <td className="ss-dim">{s.editionName}</td>
                              <td className="ss-dim">{s.saleVenue || "—"}</td>
                              <td className="ss-dim">{s.saleDate || "—"}</td>
                              <td>{fmt(s.income, currency)}</td>
                              <td className="ss-dim">{fmt(s.cost, currency)}</td>
                              <td className={parseFloat(s.profit) >= 0 ? "ss-profit-pos" : "ss-profit-neg"}>
                                {parseFloat(s.profit) >= 0 ? "+" : ""}{fmt(s.profit, currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* By company ROI */}
                {sales.byCompany?.length > 0 && (
                  <>
                    <h4 className="ss-subsection-title">🏢 ROI by company</h4>
                    <div className="ss-table-wrap">
                      <table className="ss-table">
                        <thead><tr><th>Company</th><th>Total paid</th><th>Income from sales</th><th>Profit</th><th>ROI</th></tr></thead>
                        <tbody>
                          {sales.byCompany.map((c, i) => (
                            <tr key={i}>
                              <td>{c.companyName}</td>
                              <td>{fmt(c.totalCost, currency)}</td>
                              <td>{fmt(c.totalIncome, currency)}</td>
                              <td className={parseFloat(c.profit) >= 0 ? "ss-profit-pos" : "ss-profit-neg"}>
                                {parseFloat(c.profit) >= 0 ? "+" : ""}{fmt(c.profit, currency)}
                              </td>
                              <td className={c.roiPct != null && parseFloat(c.roiPct) >= 0 ? "ss-profit-pos" : "ss-profit-neg"}>
                                {c.roiPct != null ? `${parseFloat(c.roiPct) >= 0 ? "+" : ""}${c.roiPct}%` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* All sold books */}
                {sales.soldBooks?.length > 0 && (
                  <>
                    <h4 className="ss-subsection-title">📋 All sold books</h4>
                    <div className="ss-table-wrap">
                      <table className="ss-table">
                        <thead><tr><th>Book</th><th>Edition</th><th>Venue</th><th>Date</th><th>Sold for</th><th>Cost</th><th>P&amp;L</th></tr></thead>
                        <tbody>
                          {sales.soldBooks.map((s, i) => (
                            <tr key={i}>
                              <td>{s.bookTitle}</td>
                              <td className="ss-dim">{s.editionName}</td>
                              <td className="ss-dim">{s.saleVenue || "—"}</td>
                              <td className="ss-dim">{s.saleDate || "—"}</td>
                              <td>{fmt(s.income, currency)}</td>
                              <td className="ss-dim">{fmt(s.cost, currency)}</td>
                              <td className={parseFloat(s.profit) >= 0 ? "ss-profit-pos" : "ss-profit-neg"}>
                                {parseFloat(s.profit) >= 0 ? "+" : ""}{fmt(s.profit, currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === "forecast" && (
          <div className="ss-section">
            <h3 className="ss-section-title">Upcoming expenses (next 3 months)</h3>
            <p className="ss-forecast-note">
              Based on your active subscriptions and last billing amounts. Estimates only — actual charges may vary.
            </p>
            <ForecastSection forecast={forecast} currency={currency} />
          </div>
        )}
      </div>
    </div>
  );
}
