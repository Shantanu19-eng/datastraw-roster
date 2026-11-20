export function MetricStrip({ stats }: { stats: { employees: number; active: number; brands: number; processes: number; pods: number } }) {
  const activeRate = stats.employees ? Math.round(stats.active / stats.employees * 100) : 0;
  const dashboardStats = [
    { label: "Total employees", value: String(stats.employees), change: "All workforce records" },
    { label: "Active employees", value: String(stats.active), change: `${activeRate}% active` },
    { label: "Brands", value: String(stats.brands), change: "Active brand workspaces" },
    { label: "Processes", value: String(stats.processes), change: "Active operational processes" },
    { label: "Pods", value: String(stats.pods), change: "Operational teams" },
  ];
  return (
    <div className="grid grid-cols-2 border-y border-[#E5E9F0] bg-white lg:grid-cols-5">
      {dashboardStats.map((stat, index) => (
        <div key={stat.label} className={`px-5 py-4 ${index > 0 ? "border-l border-[#E5E9F0]" : ""} ${index === 2 ? "max-lg:border-l-0 max-lg:border-t" : ""} ${index === 3 ? "max-lg:border-t" : ""}`}>
          <div className="text-[11px] font-medium uppercase tracking-[0.04em] text-[#697586]">{stat.label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-[#172033]">{stat.value}</div>
          <div className="mt-1 text-[11px] text-[#697586]">{stat.change}</div>
        </div>
      ))}
    </div>
  );
}
