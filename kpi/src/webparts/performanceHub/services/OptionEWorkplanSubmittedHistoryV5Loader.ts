import type { IV5HistoryCoordinates, IV5SubmittedHistoryLoader } from '../models/OptionEWorkplanSubmittedHistoryV5Models';
import { decodeOptionEWorkplanSubmittedHistoryV5, decodeOptionEWorkplanSubmittedCapturedHistoryV5 } from './OptionEWorkplanSubmittedHistoryV5';
import { projectOptionEWorkplanSubmittedHistoryV5, type V5HistoryReadResult } from './OptionEWorkplanSubmittedHistoryV5ReadProjection';

/** Source-only read port. Supplying a port never admits an installed native binding. */
export const loadOptionEWorkplanSubmittedHistoryV5 = async (
  coordinates: Readonly<IV5HistoryCoordinates>, port?: IV5SubmittedHistoryLoader
): Promise<V5HistoryReadResult> => {
  if (!port) return Object.freeze({ status: 'HOLD', reason: 'Unbound' });
  try {
    if (!coordinates || Object.keys(coordinates).length !== 3 || typeof coordinates.workplan !== 'string'
      || !coordinates.workplan.trim() || typeof coordinates.person !== 'string' || !coordinates.person.trim()
      || !Number.isInteger(coordinates.year)) return Object.freeze({ status: 'HOLD', reason: 'CoordinateMismatch' });
    const expected = Object.freeze({ ...coordinates });
    const capture = await port.readCapture(expected);
    if (!capture) return Object.freeze({ status: 'HOLD', reason: 'MissingCapture' });
    // Preserve the exact envelope and raw bytes. Unknown encodings cannot fall back to r2.
    const immutableCapture = Object.freeze({ ...capture });
    const decoded = 'encoding' in immutableCapture
      ? decodeOptionEWorkplanSubmittedCapturedHistoryV5(immutableCapture, expected)
      : decodeOptionEWorkplanSubmittedHistoryV5(immutableCapture, expected);
    return projectOptionEWorkplanSubmittedHistoryV5(decoded);
  } catch { return Object.freeze({ status: 'HOLD', reason: 'ReadUnavailable' }); }
};
