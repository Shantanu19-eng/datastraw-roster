const roster = [
  { name: "Alex Rivera", team: "Customer Care", days: ["08:00–16:00", "08:00–16:00", "OFF", "08:00–16:00", "08:00–16:00"] },
  { name: "Sam Chen", team: "Customer Care", days: ["10:00–18:00", "10:00–18:00", "10:00–18:00", "OFF", "10:00–18:00"] },
  { name: "Morgan Blake", team: "Order Support", days: ["09:00–17:00", "OFF", "09:00–17:00", "09:00–17:00", "09:00–17:00"] },
  { name: "Jamie Patel", team: "Order Support", days: ["OFF", "12:00–20:00", "12:00–20:00", "12:00–20:00", "12:00–20:00"] },
];

const metrics = [
  { label: "Team members", value: "24", detail: "Across 4 teams" },
  { label: "Coverage today", value: "92%", detail: "Target coverage met" },
  { label: "Open shifts", value: "3", detail: "Across 2 teams" },
  { label: "Pending requests", value: "2", detail: "Awaiting review" },
];

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#F8F9FB] text-[#172033]">
      <header className="flex h-16 items-center border-b border-[#E5E9F0] bg-white px-5 md:px-8">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#315EAA] text-sm font-bold text-white">D</div>
        <div className="ml-3 leading-tight">
          <div className="text-sm font-semibold">RosterIQ</div>
          <div className="text-[11px] text-[#697586]">DataStraw Operations</div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-4 md:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#315EAA]">Public product preview</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Operations overview</h1>
            <p className="mt-1 text-sm text-[#697586]">A sample view of team scheduling and coverage.</p>
          </div>
          <span className="rounded-full border border-[#E5E9F0] bg-white px-3 py-1.5 text-xs text-[#697586]">Read-only demo</span>
        </div>

        <div role="note" className="mb-5 border border-[#C7D7F2] bg-[#EEF4FF] px-4 py-3 text-xs text-[#294F91]">
          This preview uses fictional sample data only. It is not connected to the live roster or database.
        </div>

        <section aria-label="Sample workforce metrics" className="grid grid-cols-2 border-y border-[#E5E9F0] bg-white lg:grid-cols-4">
          {metrics.map((metric, index) => (
            <div key={metric.label} className={`px-5 py-4 ${index > 0 ? "border-l border-[#E5E9F0]" : ""} ${index === 2 ? "max-lg:border-l-0 max-lg:border-t" : ""} ${index === 3 ? "max-lg:border-t" : ""}`}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-[#697586]">{metric.label}</div>
              <div className="mt-1 text-2xl font-semibold">{metric.value}</div>
              <div className="mt-1 text-[11px] text-[#697586]">{metric.detail}</div>
            </div>
          ))}
        </section>

        <section className="mt-6 overflow-hidden border border-[#E5E9F0] bg-white">
          <div className="flex items-center border-b border-[#E5E9F0] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Sample weekly roster</h2>
              <p className="mt-0.5 text-xs text-[#697586]">Illustrative shifts for a fictional team</p>
            </div>
            <span className="ml-auto text-xs text-[#697586]">Monday – Friday</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead className="bg-[#FAFBFC] text-[10px] uppercase tracking-wide text-[#697586]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Team member</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Team</th>
                  {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => <th scope="col" key={day} className="px-3 py-3 font-semibold">{day}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF1F5]">
                {roster.map((person) => (
                  <tr key={person.name}>
                    <th scope="row" className="whitespace-nowrap px-4 py-3 font-medium">{person.name}</th>
                    <td className="whitespace-nowrap px-4 py-3 text-[#697586]">{person.team}</td>
                    {person.days.map((shift, index) => (
                      <td key={`${person.name}-${index}`} className="whitespace-nowrap px-3 py-3">
                        <span className={`rounded px-2 py-1 text-[10px] font-medium ${shift === "OFF" ? "bg-[#EEF1F5] text-[#697586]" : "bg-[#E8F4EE] text-[#26755A]"}`}>{shift}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
