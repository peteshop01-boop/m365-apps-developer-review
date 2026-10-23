/** Local illustration only. Backend must supply actor, scope, clock and durable audit. */
export interface IDemoReviewLine {
  readonly id: string; readonly kind: 'Expense' | 'Mileage'; readonly dateIso: string;
  readonly title: string; readonly detail: string; readonly nominalCode: string;
  readonly amountPence: number; readonly version: number;
}
export interface IDemoDecision {
  readonly lineId: string; readonly version: number; readonly status: 'Approved' | 'Queried';
  readonly reason: string; readonly actor: 'Synthetic manager'; readonly at: string;
}
export function decideDemoLine(line: IDemoReviewLine, status: IDemoDecision['status'], reason: string, at: string): IDemoDecision {
  if (status === 'Queried' && !reason.trim()) throw new Error('A written query reason is required.');
  return { lineId: line.id, version: line.version, status, reason: reason.trim(), actor: 'Synthetic manager', at };
}
export function effectiveDecision(line: IDemoReviewLine, decisions: ReadonlyArray<IDemoDecision>): IDemoDecision | undefined {
  return decisions.slice().reverse().find(item => item.lineId === line.id && item.version === line.version);
}
export function reviewReadiness(lines: ReadonlyArray<IDemoReviewLine>, decisions: ReadonlyArray<IDemoDecision>): { approved: number; queried: number; pending: number; complete: boolean } {
  const approved = lines.filter(line => effectiveDecision(line, decisions)?.status === 'Approved').length;
  const queried = lines.filter(line => effectiveDecision(line, decisions)?.status === 'Queried').length;
  const pending = lines.length - approved - queried;
  return { approved, queried, pending, complete: lines.length > 0 && approved === lines.length };
}
