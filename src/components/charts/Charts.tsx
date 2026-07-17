'use client';

// Dashboard charts — recharts styled strictly with brand tokens.
// Blues carry the data; red appears only for the 90+ aging bucket.
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts';

const ACCENT = '#0A82C6';
const SKY = '#37A7E0';
const NAVY = '#0B2138';
const STEEL = '#6B7B8B';
const DANGER = '#C0392B';
const GRID = 'rgba(11,33,56,.08)';

const tick = { fontSize: 11, fill: STEEL, fontFamily: 'var(--font-plexmono)' } as const;
const tooltipStyle = {
  background: '#fff',
  border: '1px solid rgba(11,33,56,.14)',
  borderRadius: 10,
  fontSize: 12,
  fontFamily: 'var(--font-plex)',
} as const;

export interface MakeDatum { key: string; count: number; defectQty: number }

export function SupplierPareto({ data }: { data: MakeDatum[] }) {
  const total = data.reduce((a, d) => a + d.defectQty, 0);
  const rows: (MakeDatum & { cum: number })[] = [];
  for (let i = 0, running = 0; i < data.length; i++) {
    running += data[i].defectQty;
    rows.push({ ...data[i], cum: total > 0 ? Math.round((running / total) * 100) : 0 });
  }
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 40 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="key" tick={{ ...tick, fontSize: 10 }} angle={-38} textAnchor="end" interval={0} />
        <YAxis yAxisId="qty" tick={tick} />
        <YAxis yAxisId="pct" orientation="right" tick={tick} domain={[0, 100]} unit="%" />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar yAxisId="qty" dataKey="defectQty" name="Defect qty" fill={ACCENT} radius={[3, 3, 0, 0]} />
        <Line yAxisId="pct" dataKey="cum" name="Cumulative %" stroke={NAVY} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface TrendDatum { month: string; y2025: number; y2026: number }

export function MonthlyTrend({ data }: { data: TrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={tick} />
        <YAxis tick={tick} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-plexmono)' }} />
        <Line dataKey="y2025" name="2025" stroke={SKY} strokeWidth={2} dot={false} />
        <Line dataKey="y2026" name="2026" stroke={ACCENT} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface BucketDatum { bucket: string; count: number }

export function AgingChart({ data }: { data: BucketDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="bucket" tick={tick} />
        <YAxis tick={tick} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" name="Open NCRs" radius={[3, 3, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.bucket} fill={d.bucket === '90+ d' ? DANGER : ACCENT} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface KeyCount { key: string; count: number }

export function HorizontalBars({ data, height = 260 }: { data: KeyCount[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 18, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tick={tick} allowDecimals={false} />
        <YAxis type="category" dataKey="key" tick={{ ...tick, fontSize: 10 }} width={86} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" name="NCRs" fill={ACCENT} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = [ACCENT, SKY, NAVY, STEEL, '#0869A0'];

export function Donut({ data }: { data: KeyCount[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="key" innerRadius={52} outerRadius={80} paddingAngle={2}>
          {data.map((d, i) => (
            <Cell key={d.key} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-plexmono)' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
