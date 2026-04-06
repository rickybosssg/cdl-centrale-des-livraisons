export default function StaffStatCard({ label, value, color = "text-primary", icon: Icon, bg = "bg-card" }) {
  return (
    <div className={`${bg} rounded-2xl border p-4 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-3xl font-extrabold ${color}`}>{value ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
        </div>
        {Icon && <Icon className={`h-6 w-6 ${color} opacity-60 flex-shrink-0`} />}
      </div>
    </div>
  );
}