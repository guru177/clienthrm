import axios from '@/lib/axios';
import { useEffect, useState } from 'react';

import { CtcSalaryPanel } from '@/components/ctc-salary-panel';
import { EmployeeAdvancesPanel } from '@/components/employee-advances-panel';
import { EmployeeExtraPayPanel } from '@/components/employee-extra-pay-panel';
import { SalaryStructurePanel } from '@/components/salary-structure-panel';

/**
 * Single-page employee pay setup:
 * Monthly salary → Extra allowance → Bonus → Advance
 */
export function SalaryTabsPanel({ userId }: { userId: number }) {
    const [hasCtc, setHasCtc] = useState(false);
    const [showAddons, setShowAddons] = useState(false);
    const [showAdvance, setShowAdvance] = useState(false);

    useEffect(() => {
        axios
            .get<{ data?: { profile?: { yearly_ctc?: number } } }>(`/admin/users/${userId}/ctc-profile`)
            .then((res) => {
                const yc = res.data?.data?.profile?.yearly_ctc ?? 0;
                setHasCtc(yc > 0);
            })
            .catch(() => setHasCtc(false));
    }, [userId]);

    return (
        <div className="space-y-6">
            <div className="space-y-3 rounded-lg border p-4">
                <div>
                    <h3 className="text-base font-semibold">Monthly salary</h3>
                    <p className="text-sm text-muted-foreground">
                        Enter yearly CTC. Pay lines (Basic, HRA, etc.) are calculated automatically.
                    </p>
                </div>
                <CtcSalaryPanel userId={userId} onCtcChange={setHasCtc} />
            </div>

            <div className="rounded-lg border">
                <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
                    onClick={() => setShowAddons((v) => !v)}
                    aria-expanded={showAddons}
                >
                    <span>
                        Extra allowance for this person only
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            e.g. night shift — does not apply to everyone
                        </span>
                    </span>
                    <span className="text-muted-foreground">{showAddons ? 'Hide' : 'Show'}</span>
                </button>
                {showAddons ? (
                    <div className="space-y-3 border-t px-4 py-3">
                        {hasCtc ? (
                            <p className="text-xs text-amber-800 dark:text-amber-300 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2">
                                CTC is active, so these amounts are view-only. Remove CTC under Monthly
                                salary if you want to set them by hand.
                            </p>
                        ) : (
                            <p className="text-xs text-muted-foreground">
                                Tick only what this employee should get every month, set the amount, then
                                Save.
                            </p>
                        )}
                        <SalaryStructurePanel userId={userId} hasCtc={hasCtc} onCtcChange={setHasCtc} />
                    </div>
                ) : null}
            </div>

            <EmployeeExtraPayPanel userId={userId} />

            <div className="rounded-lg border">
                <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
                    onClick={() => setShowAdvance((v) => !v)}
                    aria-expanded={showAdvance}
                >
                    <span>
                        Salary advance (loan)
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                            Recovered later as EMI — not a bonus
                        </span>
                    </span>
                    <span className="text-muted-foreground">{showAdvance ? 'Hide' : 'Show'}</span>
                </button>
                {showAdvance ? (
                    <div className="border-t px-4 py-3">
                        <EmployeeAdvancesPanel userId={userId} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
