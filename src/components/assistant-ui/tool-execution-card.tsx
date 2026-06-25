import { AlertCircle, CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';

export type ToolExecutionStep = {
  label: string;
  detail: string;
  state: 'pending' | 'active' | 'done' | 'error';
  error?: string;
};

type ToolExecutionCardProps = {
  title: string;
  badgeLabel: string;
  badgeTone: string;
  prepareStep: ToolExecutionStep;
  runningStep?: ToolExecutionStep;
  steps?: ToolExecutionStep[];
  errorText?: string | null;
};

const ToolStep = ({ label, detail, state }: ToolExecutionStep) => {
  const Icon = state === 'active'
    ? Loader2
    : state === 'done'
      ? CheckCircle2
      : state === 'error'
        ? AlertCircle
        : CircleDashed;
  const tone = state === 'active'
    ? 'text-blue-600 dark:text-blue-300'
    : state === 'done'
      ? 'text-green-700 dark:text-green-300'
      : state === 'error'
        ? 'text-red-600 dark:text-red-300'
        : 'text-slate-400 dark:text-slate-500';

  return (
    <li className="grid grid-cols-[16px_1fr] gap-2">
      <Icon className={`mt-0.5 size-3.5 ${tone} ${state === 'active' ? 'animate-spin' : ''}`} />
      <div>
        <p className={`font-medium ${state === 'pending' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
          {label}
        </p>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
          {detail}
        </p>
      </div>
    </li>
  );
};

export const ToolExecutionCard = ({
  title,
  badgeLabel,
  badgeTone,
  prepareStep,
  runningStep,
  steps = [],
  errorText,
}: ToolExecutionCardProps) => (
  <div className="mx-auto w-full max-w-(--thread-max-width) px-2 py-2">
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-700 dark:text-slate-200">{title}</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] ${badgeTone}`}>
          {badgeLabel}
        </span>
      </div>

      <ol className="mt-3 space-y-2">
        <ToolStep {...prepareStep} />
        {runningStep && <ToolStep {...runningStep} />}
        {steps.map((step, index) => (
          <ToolStep key={`${step.label}-${index}`} {...step} />
        ))}
        {errorText && (
          <li className="pl-6">
            <details className="group rounded-lg border border-red-100 bg-red-50/60 px-2 py-1.5 text-[11px] dark:border-red-900/40 dark:bg-red-950/20">
              <summary className="cursor-pointer select-none text-red-600 dark:text-red-300">
                查看错误详情
              </summary>
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-red-600 dark:text-red-300">
                {errorText}
              </pre>
            </details>
          </li>
        )}
      </ol>
    </div>
  </div>
);
