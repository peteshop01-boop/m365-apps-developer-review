import type { IBehaviourObjectiveLibraryRecord } from '../../models/BehaviourWorkplanModels';

const objective = (
  behaviourObjectiveKey: string,
  behaviourKey: IBehaviourObjectiveLibraryRecord['behaviourKey'],
  sortOrder: number,
  objectiveTitle: string,
  objectiveDescription: string,
  suggestedMeasure: string,
  suggestedUnit: string,
  suggestedEvidence: string
): IBehaviourObjectiveLibraryRecord => ({
  behaviourObjectiveKey,
  behaviourKey,
  objectiveTitle,
  objectiveDescription,
  suggestedMeasure,
  suggestedUnit,
  suggestedEvidence,
  active: true,
  sortOrder,
  effectiveFrom: '2025-11-01',
  effectiveTo: undefined
});

/**
 * Idempotent source-of-truth seed for KCFKPI_BehaviourObjectiveLibrary.
 * Provisioning upserts by behaviourObjectiveKey; React must load these records
 * from SharePoint and must not import this module as an application catalogue.
 */
export const BEHAVIOUR_OBJECTIVE_LIBRARY_SEED: ReadonlyArray<IBehaviourObjectiveLibraryRecord> = [
  objective('BHV-01-OBJ-01', 'BHV-01', 10, 'Contribute to cross-team delivery', 'Make a useful, agreed contribution to work shared with another KCF team.', 'Number of cross-team commitments completed to the agreed standard and date.', 'Completed commitments', 'Joint action plan, completed output and confirmation from the partner team.'),
  objective('BHV-01-OBJ-02', 'BHV-01', 20, 'Give reliable handovers', 'Provide colleagues with the information, ownership and timing they need when work moves between people or teams.', 'Proportion of planned handovers completed using the agreed information and timescale.', 'Percentage of handovers', 'Handover record, checklist and receiving-colleague confirmation.'),
  objective('BHV-01-OBJ-03', 'BHV-01', 30, 'Share useful knowledge', 'Share practical knowledge that helps colleagues deliver their work more confidently or consistently.', 'Number of useful knowledge-sharing sessions or resources delivered and applied.', 'Sessions or resources', 'Session record, shared resource and participant feedback.'),
  objective('BHV-01-OBJ-04', 'BHV-01', 40, 'Support a colleague commitment', 'Provide agreed practical support that helps a colleague or team complete an important commitment.', 'Number of agreed support actions completed by the promised date.', 'Support actions', 'Agreed action, completion record and colleague confirmation.'),
  objective('BHV-01-OBJ-05', 'BHV-01', 50, 'Resolve a shared blocker', 'Work constructively with relevant colleagues to remove a blocker affecting more than one person or team.', 'Number of shared blockers resolved or moved to an agreed decision owner and date.', 'Blockers', 'Issue log, agreed action and resolution or escalation record.'),
  objective('BHV-01-OBJ-06', 'BHV-01', 60, 'Plan joined-up delivery', 'Agree responsibilities, dependencies and dates with colleagues before starting shared work.', 'Proportion of identified shared activities with an agreed owner, dependency and due date.', 'Percentage of activities', 'Joint plan, responsibility record and delivery review.'),

  objective('BHV-02-OBJ-01', 'BHV-02', 10, 'Implement a practical improvement', 'Identify and deliver a small improvement that makes a recurring task clearer, faster or more reliable.', 'Number of agreed improvements implemented and reviewed for benefit.', 'Improvements', 'Before-and-after process, completion evidence and review note.'),
  objective('BHV-02-OBJ-02', 'BHV-02', 20, 'Use feedback to improve delivery', 'Ask relevant users or colleagues for feedback and make an observable improvement in response.', 'Number of feedback cycles completed with an evidenced change.', 'Feedback cycles', 'Feedback summary, agreed action and changed output or process.'),
  objective('BHV-02-OBJ-03', 'BHV-02', 30, 'Learn and apply a useful skill', 'Complete focused learning and apply it to a real KCF task.', 'Number of learned techniques applied successfully in live work.', 'Applied techniques', 'Learning record, work example and manager or colleague feedback.'),
  objective('BHV-02-OBJ-04', 'BHV-02', 40, 'Reduce avoidable rework', 'Improve an agreed recurring activity so fewer corrections or repeated steps are needed.', 'Reduction in agreed rework instances against the starting baseline.', 'Rework instances', 'Baseline, updated method and comparison record.'),
  objective('BHV-02-OBJ-05', 'BHV-02', 50, 'Test a better way of working', 'Run a controlled trial of a practical idea and decide whether to adopt, adapt or stop it using evidence.', 'Number of controlled trials completed with a recorded outcome and decision.', 'Trials', 'Test plan, result, feedback and decision note.'),
  objective('BHV-02-OBJ-06', 'BHV-02', 60, 'Complete regular improvement reviews', 'Review completed work at agreed intervals and turn lessons into owned follow-up actions.', 'Proportion of scheduled reviews completed with actions assigned and followed up.', 'Percentage of reviews', 'Review notes, action log and follow-up evidence.'),

  objective('BHV-03-OBJ-01', 'BHV-03', 10, 'Make meetings inclusive', 'Create clear opportunities for relevant people to contribute and confirm that different views were heard.', 'Proportion of chaired meetings using an agreed inclusive participation practice.', 'Percentage of meetings', 'Agenda, meeting note and participant feedback.'),
  objective('BHV-03-OBJ-02', 'BHV-03', 20, 'Listen and respond to feedback', 'Seek specific feedback, confirm understanding and respond with an action or reasoned decision.', 'Number of feedback requests closed with an acknowledged response or action.', 'Feedback responses', 'Feedback record, response and completed action where applicable.'),
  objective('BHV-03-OBJ-03', 'BHV-03', 30, 'Communicate clearly and on time', 'Give colleagues or customers clear information within an agreed response time.', 'Proportion of sampled communications meeting the agreed clarity and response standard.', 'Percentage of communications', 'Communication sample, response times and recipient feedback.'),
  objective('BHV-03-OBJ-04', 'BHV-03', 40, 'Make information accessible', 'Adapt an agreed communication or resource so its intended audience can understand and use it.', 'Number of priority communications checked and improved for audience accessibility.', 'Communications', 'Before-and-after material and audience feedback.'),
  objective('BHV-03-OBJ-05', 'BHV-03', 50, 'Handle disagreement constructively', 'Use an agreed respectful approach to clarify differences and reach a decision or next step.', 'Number of relevant disagreements concluded with a recorded decision or owned next step.', 'Resolved discussions', 'Decision note, action record and participant confirmation.'),
  objective('BHV-03-OBJ-06', 'BHV-03', 60, 'Recognise colleague contributions', 'Give specific, timely recognition for work that supports KCF outcomes or colleagues.', 'Number of specific contributions recognised through an appropriate KCF channel.', 'Recognitions', 'Recognition record and examples of the contribution acknowledged.'),

  objective('BHV-04-OBJ-01', 'BHV-04', 10, 'Deliver agreed commitments reliably', 'Complete priority commitments to the agreed quality and date, raising risks early where necessary.', 'Proportion of agreed priority commitments completed to standard and date.', 'Percentage of commitments', 'Delivery plan, completed outputs and exception record.'),
  objective('BHV-04-OBJ-02', 'BHV-04', 20, 'Keep momentum visible', 'Maintain a simple action plan and give timely progress updates on important work.', 'Proportion of scheduled progress updates completed with current actions and dates.', 'Percentage of updates', 'Action plan, dated updates and completed milestones.'),
  objective('BHV-04-OBJ-03', 'BHV-04', 30, 'Act early on delivery risks', 'Identify a likely delivery risk and take a practical preventative or mitigating action before it becomes overdue.', 'Number of material risks acted on before the affected deadline.', 'Risks acted on', 'Risk record, mitigation action and outcome.'),
  objective('BHV-04-OBJ-04', 'BHV-04', 40, 'Support an agreed peak period', 'Make and deliver a clear contribution during a known high-demand period for KCF.', 'Proportion of agreed peak-period shifts or actions completed.', 'Percentage of commitments', 'Peak plan, attendance or action record and team feedback.'),
  objective('BHV-04-OBJ-05', 'BHV-04', 50, 'Take initiative on a useful task', 'Identify an unowned but valuable task, agree the boundary and carry it through to a useful result.', 'Number of agreed initiative tasks completed with a demonstrable result.', 'Initiatives', 'Agreement, completed output and outcome feedback.'),
  objective('BHV-04-OBJ-06', 'BHV-04', 60, 'Maintain dependable service', 'Meet an agreed service or response commitment consistently during the quarter.', 'Proportion of measured service commitments achieved.', 'Percentage achieved', 'Service log, response-time data or stakeholder confirmation.'),

  objective('BHV-05-OBJ-01', 'BHV-05', 10, 'Close owned corrective actions', 'Complete corrective actions assigned to you and confirm that the intended issue has been addressed.', 'Proportion of owned corrective actions completed by their agreed due date.', 'Percentage of actions', 'Action log, closure evidence and outcome check.'),
  objective('BHV-05-OBJ-02', 'BHV-05', 20, 'Raise issues early with a proposed action', 'Escalate a material issue promptly with clear facts, impact and a practical next step.', 'Proportion of material issues raised before impact with a documented proposed action.', 'Percentage of issues', 'Issue record, escalation timing and proposed action.'),
  objective('BHV-05-OBJ-03', 'BHV-05', 30, 'Own and correct an error', 'Acknowledge an error, correct its impact and put a practical prevention step in place.', 'Number of relevant errors closed with correction and prevention evidence.', 'Errors closed', 'Correction record, affected-party update and prevention action.'),
  objective('BHV-05-OBJ-04', 'BHV-05', 40, 'Maintain accurate records', 'Keep an agreed set of operational records complete, current and accurate.', 'Accuracy and completeness rate from the agreed record check.', 'Percentage accurate', 'Quality check results, corrections and review sign-off.'),
  objective('BHV-05-OBJ-05', 'BHV-05', 50, 'Clarify ownership and decisions', 'Record who owns key actions and why important decisions were made so follow-up is reliable.', 'Proportion of sampled decisions and actions with an owner, date and rationale.', 'Percentage complete', 'Decision log, action owner and follow-up record.'),
  objective('BHV-05-OBJ-06', 'BHV-05', 60, 'Learn from a completed issue', 'Complete a proportionate review of an issue and deliver the agreed prevention actions.', 'Number of issue reviews completed with prevention actions closed or on plan.', 'Reviews', 'Review note, action plan and completion evidence.')
];
