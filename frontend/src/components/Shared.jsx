export const PageHeader = ({ title, subtitle, icon: Icon, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 p2g-fade-up">
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="hidden sm:flex h-11 w-11 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 items-center justify-center">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </div>
);

export const SectionCard = ({ children, className = "", ...props }) => (
  <div
    className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm ${className}`}
    {...props}
  >
    {children}
  </div>
);

export const EmptyState = ({ icon: Icon, title, description }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && <Icon className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />}
    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
    {description && <p className="text-sm text-slate-400 mt-1 max-w-sm">{description}</p>}
  </div>
);

export const Loader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="h-8 w-8 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
  </div>
);
