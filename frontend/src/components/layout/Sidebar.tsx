import { NavLink } from 'react-router-dom'
import { Shield, Search, Activity } from 'lucide-react'

const nav = [
  { to: '/master', icon: Shield, label: 'Compliance Hub' },
  { to: '/user', icon: Search, label: 'User Lookup' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <Activity className="h-5 w-5 text-indigo-400" />
          <div>
            <p className="text-sm font-bold text-white tracking-tight">AML Monitor</p>
            <p className="text-xs text-slate-500">bPKR Stablecoin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-500/15 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-slate-800">
        <p className="text-xs text-slate-600">Pakistan AML/CFT v1.0</p>
      </div>
    </aside>
  )
}
