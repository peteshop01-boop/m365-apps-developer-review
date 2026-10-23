import * as React from 'react';
import type { IYearLifecycleSyntheticSourceSession } from '../models/YearLifecycleSourceCallerModels';

export const YearLifecycleSourceCallerView: React.FC<{ session?: IYearLifecycleSyntheticSourceSession }> = ({ session }) => {
  const [, refresh] = React.useReducer(value => value + 1, 0);
  const snapshot = session?.read();
  const operate = (action: () => void): void => { action(); refresh(); };
  return <section aria-label="Synthetic year lifecycle source caller">
    <h3>Year lifecycle source demonstration</h3>
    <p role="status">{snapshot?.message || 'UNBOUND / HOLD — lifecycle operations and compensation unavailable.'}</p>
    <p>2026 GOLD / 2027 approved baseline · 2027 / 2028 year history · 2029 strategy cycle</p>
    <p>Example data only. Family revisions remain independent. Compensation is unavailable after reload.</p>
    {!snapshot?.available && <><button disabled>Plan lifecycle operation</button><button disabled>Apply lifecycle operation</button><button disabled>Compensate lifecycle operation</button></>}
    {snapshot?.choices.map(choice => <article key={choice.id}>
      <h4>{choice.family} · {choice.label}</h4>
      <details><summary>Supplied year, version, source and approval capture</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(choice.input, undefined, 2)}</pre></details>
      <button onClick={() => operate(() => session!.plan(choice.id))}>Plan {choice.label}</button>
      <button disabled={!snapshot.pending.includes(choice.id)} onClick={() => operate(() => session!.apply(choice.id))}>Apply {choice.label}</button>
    </article>)}
    {snapshot?.compensation.map(item => <button key={item.id} onClick={() => operate(() => session!.compensate(item.id))}>Compensate {item.family} {item.receiptId}</button>)}
    {snapshot?.available && <details><summary>Original history, versions and source hashes</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify({ imports: snapshot.imports, transitions: snapshot.transitions, strategy: snapshot.strategy }, undefined, 2)}</pre></details>}
    <ol aria-label="Lifecycle results and receipts" aria-live="polite">{snapshot?.events.map((event, index) => <li key={index}>
      <strong>{event.family} · {event.status}</strong><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(event.detail, undefined, 2)}</pre>
    </li>)}</ol>
  </section>;
};
