/**
 * The education pack: the phone work a school, college or coaching institute's
 * front office repeats every week.
 *
 * Every entry here is a configuration, not code. The engine in `src/core` does
 * not know what a student or a fee is; it knows how to disclose, gate identity,
 * ask bounded questions, capture what it could not answer, and judge what came
 * back. A fifteenth workflow is another object in this file.
 *
 * ## What makes an action safe to add here
 *
 * It must be **ask-shaped**. Confirm something, remind somebody, collect a
 * reason, capture a preference. An **answer-shaped** task — advising which
 * course suits a student, granting a concession, negotiating a due date — does
 * not belong in this file at any sensitivity level, because no amount of
 * configuration makes an automated caller competent to do it.
 *
 * The test for it: could a temp on their first morning at the front desk do
 * this from a script, with instructions to pass anything unusual to a
 * colleague? If yes, it is ask-shaped.
 *
 * ## Prior art
 *
 * `attendance-absence` overlaps `roll-call` (CALL-E PR #325), which is a
 * focused first-hour absence verification tool for schools with a strong
 * safeguarding model. DeskHelp's version is deliberately narrower in ambition
 * and broader in setting: it is one scheduled workflow among many sharing a
 * ledger, a suppression list and a review queue, rather than a dedicated
 * safeguarding instrument. Where the two disagree on disclosure, `roll-call`
 * is the better authority and DeskHelp follows it.
 */

import { DEFAULT_RETRY } from '../../core/types.ts';
import type { ActionDefinition } from '../../core/types.ts';

/**
 * A time-critical action: somebody needs to be reached today, so a second
 * attempt comes sooner. Still capped at two, and still only when nobody
 * answered.
 */
const URGENT_RETRY = { maxAttempts: 2, minHoursBetweenAttempts: 1 } as const;

/** Somebody who did not pick up about next term can wait until tomorrow. */
const PATIENT_RETRY = { maxAttempts: 2, minHoursBetweenAttempts: 20 } as const;

// ---------------------------------------------------------------------------
// Admissions
// ---------------------------------------------------------------------------

export const admissionInterestFollowup: ActionDefinition = {
  id: 'admission-interest-followup',
  title: 'Admission enquiry follow-up',
  purpose:
    'Find out whether somebody who enquired about admission is still interested, and in what.',
  audience: 'lead',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated assistant calling from the institute about ' +
    'the admission enquiry you made. It will take about a minute. Is now a ' +
    'good time?',
  questions: [
    {
      id: 'still_interested',
      ask: 'Are they still considering admission here?',
      answers: ['yes', 'no', 'undecided'],
      requiresEvidence: true,
    },
    {
      id: 'course_interest',
      ask: 'Which course or class are they asking about?',
      answers: ['as-enquired', 'different-course', 'not-sure'],
      requiresEvidence: false,
    },
    {
      id: 'wants_counsellor_call',
      ask: 'Would they like a counsellor to call them?',
      answers: ['yes', 'no'],
      requiresEvidence: true,
    },
  ],
  factSheetTopics: ['courses-offered', 'batch-timings', 'admission-process'],
  minHoursBetweenContacts: 72,
  cascade: false,
  retry: PATIENT_RETRY,
};

export const admissionCallback: ActionDefinition = {
  id: 'admission-callback',
  title: 'Requested callback',
  purpose:
    'Call somebody back at the time they themselves asked to be called.',
  audience: 'lead',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated assistant from the institute. You asked us ' +
    'to call you back about admission. Is this a good moment?',
  questions: [
    {
      id: 'reached_at_good_time',
      ask: 'Is this a convenient time to talk?',
      answers: ['yes', 'no-call-later'],
      requiresEvidence: true,
    },
    {
      id: 'still_interested',
      ask: 'Are they still considering admission here?',
      answers: ['yes', 'no', 'undecided'],
      requiresEvidence: true,
    },
  ],
  factSheetTopics: ['courses-offered', 'batch-timings', 'admission-process'],
  minHoursBetweenContacts: 24,
  cascade: false,
  retry: DEFAULT_RETRY,
};

export const demoClassFollowup: ActionDefinition = {
  id: 'demo-class-followup',
  title: 'Demo class follow-up',
  purpose:
    'Find out whether a student who attended a trial class will join, and if not, what stopped them.',
  audience: 'lead',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated assistant from the institute, calling about ' +
    'the demo class you attended. We would like to know how it went. It will ' +
    'take about a minute.',
  questions: [
    {
      id: 'will_join',
      ask: 'Are they planning to join?',
      answers: ['yes', 'no', 'undecided'],
      requiresEvidence: true,
      // "Haan ji, kar lenge" is an intention. It is not an enrolment, and the
      // office must not plan a batch size around it.
      claimAnswers: ['yes'],
    },
    {
      id: 'blocker',
      ask: 'If they are not joining, what is the reason?',
      answers: ['fee', 'timing', 'distance', 'chose-elsewhere', 'other'],
      requiresEvidence: false,
    },
    {
      id: 'class_experience',
      ask: 'How did the student find the class itself?',
      answers: ['good', 'mixed', 'not-suitable'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['courses-offered', 'batch-timings', 'admission-process'],
  minHoursBetweenContacts: 48,
  cascade: false,
  retry: PATIENT_RETRY,
};

export const documentChase: ActionDefinition = {
  id: 'document-chase',
  title: 'Pending document reminder',
  purpose:
    'Remind a family that an admission document is still outstanding, and find out when it will arrive.',
  audience: 'guardian',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated assistant from the institute about a ' +
    'document still pending for the admission file.',
  questions: [
    {
      id: 'aware_of_pending',
      ask: 'Are they aware a document is still pending?',
      answers: ['yes', 'no'],
      requiresEvidence: false,
    },
    {
      id: 'will_submit',
      ask: 'Will they submit it, and roughly when?',
      answers: ['this-week', 'later', 'needs-help', 'no'],
      requiresEvidence: true,
      claimAnswers: ['this-week', 'later'],
    },
  ],
  factSheetTopics: ['admission-process', 'office-hours'],
  minHoursBetweenContacts: 96,
  cascade: false,
  retry: PATIENT_RETRY,
};

// ---------------------------------------------------------------------------
// Fees
//
// These remind. They never collect. The agent is forbidden from asking for or
// accepting any payment detail, and a stated intention to pay is recorded as a
// Claim that only the counter or the portal can ever turn into a payment.
// ---------------------------------------------------------------------------

export const feeReminder: ActionDefinition = {
  id: 'fee-reminder',
  title: 'Fee reminder (before due date)',
  purpose:
    'Remind a family that a fee instalment is due shortly, before the date passes.',
  audience: 'guardian',
  sensitivity: 'financial',
  disclosure:
    'Hello, this is an automated reminder from the institute about a fee ' +
    'instalment that is due shortly. This is only a reminder; no payment is ' +
    'taken on this call.',
  questions: [
    {
      id: 'aware_of_due_date',
      ask: 'Are they aware of the due date?',
      answers: ['yes', 'no'],
      requiresEvidence: false,
    },
    {
      id: 'intends_to_pay_by_date',
      ask: 'Do they expect to pay before the due date?',
      answers: ['yes', 'no', 'needs-to-check'],
      requiresEvidence: true,
      // The single most important claim in the pack. "Kal kar dunga" is a
      // sentence, not a payment, and nothing downstream may treat it as one.
      claimAnswers: ['yes'],
    },
    {
      id: 'preferred_channel',
      ask: 'Would they pay at the office or through the online portal?',
      answers: ['office', 'portal', 'not-sure'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['fee-due-date', 'payment-channels', 'office-hours'],
  minHoursBetweenContacts: 120,
  cascade: false,
  retry: PATIENT_RETRY,
};

export const feeFollowup: ActionDefinition = {
  id: 'fee-followup',
  title: 'Fee follow-up (after due date)',
  purpose:
    'Follow up on a fee instalment that the records still show as unpaid after the due date.',
  audience: 'guardian',
  sensitivity: 'financial',
  disclosure:
    'Hello, this is an automated call from the institute about a fee ' +
    'instalment our records still show as pending. If you have already paid, ' +
    'please tell me and I will note it for the office to check.',
  questions: [
    {
      id: 'says_already_paid',
      ask: 'Do they say they have already paid?',
      answers: ['yes', 'no'],
      requiresEvidence: true,
      // Their word against the ledger. The office reconciles; the call does
      // not decide who is right, and must not imply the family is wrong.
      claimAnswers: ['yes'],
    },
    {
      id: 'expects_to_pay',
      ask: 'If not paid, when do they expect to pay?',
      answers: ['this-week', 'later', 'difficulty', 'unclear'],
      requiresEvidence: true,
      claimAnswers: ['this-week', 'later'],
    },
    {
      id: 'wants_office_call',
      ask: 'Would they like the office to call them about it?',
      answers: ['yes', 'no'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['fee-due-date', 'payment-channels', 'office-hours'],
  minHoursBetweenContacts: 168,
  cascade: false,
  retry: PATIENT_RETRY,
};

// ---------------------------------------------------------------------------
// Attendance
//
// These concern children. Sensitivity `minor-involved` makes the engine gate
// the student's first name behind guardian confirmation and leave voicemail a
// neutral message. See `render.ts` and `roll-call` (CALL-E PR #325).
// ---------------------------------------------------------------------------

export const attendanceAbsence: ActionDefinition = {
  id: 'attendance-absence',
  title: 'Absence check',
  purpose:
    'Tell a guardian their child is not in class today, and record what they say about it.',
  audience: 'guardian',
  sensitivity: 'minor-involved',
  disclosure:
    'Hello, this is an automated call from the institute about today\'s ' +
    'attendance.',
  questions: [
    {
      id: 'guardian_aware',
      ask: 'Did the guardian already know the student is not in class?',
      answers: ['yes', 'no'],
      // The answer that matters most. A guardian who did not know needs a
      // person to ring them back, so it must be evidenced, not inferred.
      requiresEvidence: true,
    },
    {
      id: 'reason',
      ask: 'What reason do they give for the absence?',
      answers: ['unwell', 'family-reason', 'travel', 'other', 'not-given'],
      requiresEvidence: false,
    },
    {
      id: 'expected_back',
      ask: 'When do they expect the student back?',
      answers: ['tomorrow', 'this-week', 'longer', 'not-sure'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['attendance-policy', 'office-hours'],
  minHoursBetweenContacts: 12,
  cascade: false,
  retry: URGENT_RETRY,
};

export const dropoutRisk: ActionDefinition = {
  id: 'dropout-risk',
  title: 'Repeated absence check',
  purpose:
    'Find out why a student has been absent for several days in a row, so the institute can help before they drop out.',
  audience: 'guardian',
  sensitivity: 'minor-involved',
  disclosure:
    'Hello, this is an automated call from the institute. We have noticed ' +
    'several days of absence and wanted to check everything is all right.',
  questions: [
    {
      id: 'reason',
      ask: 'What is behind the repeated absence?',
      answers: ['health', 'financial', 'family', 'moved-away', 'lost-interest', 'other'],
      requiresEvidence: true,
    },
    {
      id: 'still_enrolled',
      ask: 'Do they intend for the student to continue at the institute?',
      answers: ['yes', 'no', 'undecided'],
      requiresEvidence: true,
    },
    {
      id: 'wants_help',
      ask: 'Would they like somebody from the institute to speak with them?',
      answers: ['yes', 'no'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['attendance-policy', 'office-hours'],
  minHoursBetweenContacts: 168,
  cascade: false,
  retry: PATIENT_RETRY,
};

// ---------------------------------------------------------------------------
// Meetings and announcements
// ---------------------------------------------------------------------------

export const ptmSlotConfirm: ActionDefinition = {
  id: 'ptm-slot-confirm',
  title: 'Parent-teacher meeting slot',
  purpose:
    'Offer a guardian the meeting slots that are open and record which one suits them.',
  audience: 'guardian',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated call from the institute about the ' +
    'parent-teacher meeting, to find a time that suits you.',
  questions: [
    {
      id: 'can_attend',
      ask: 'Can they attend the meeting at all?',
      answers: ['yes', 'no'],
      requiresEvidence: true,
    },
    {
      id: 'preferred_slot',
      ask: 'Which of the offered slots do they prefer?',
      answers: ['slot-1', 'slot-2', 'slot-3', 'none-suit'],
      requiresEvidence: true,
      // The agent records a preference. The office books it. A slot spoken
      // aloud is not a slot reserved, and two families must not be told the
      // same one is theirs.
      claimAnswers: ['slot-1', 'slot-2', 'slot-3'],
    },
  ],
  factSheetTopics: ['ptm-slots', 'office-hours'],
  minHoursBetweenContacts: 48,
  cascade: false,
  retry: DEFAULT_RETRY,
};

export const announcement: ActionDefinition = {
  id: 'announcement',
  title: 'Announcement (approved wording only)',
  purpose:
    'Relay one approved announcement — an exam date, a holiday, a result being ready — by phone.',
  audience: 'guardian',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated call from the institute with an ' +
    'announcement. It will take under a minute.',
  // Deliberately no questions. An announcement that also interrogates people
  // is two workflows wearing one coat, and the second one is never disclosed.
  questions: [],
  factSheetTopics: ['announcement-text', 'office-hours'],
  minHoursBetweenContacts: 24,
  cascade: false,
  retry: DEFAULT_RETRY,
};

export const termFeedback: ActionDefinition = {
  id: 'term-feedback',
  title: 'End-of-term feedback',
  purpose:
    'Collect a short, structured opinion from a guardian at the end of a term.',
  audience: 'guardian',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated call from the institute asking three short ' +
    'questions about this term. Your answers go to the office. It takes about ' +
    'a minute, and you can decline.',
  questions: [
    {
      id: 'overall',
      ask: 'How do they feel the term went for the student?',
      answers: ['good', 'mixed', 'poor'],
      requiresEvidence: false,
    },
    {
      id: 'main_concern',
      ask: 'What is their main concern, if any?',
      answers: ['teaching', 'timing', 'fees', 'facilities', 'communication', 'none'],
      requiresEvidence: false,
    },
    {
      id: 'would_recommend',
      ask: 'Would they recommend the institute to another family?',
      answers: ['yes', 'no', 'unsure'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['office-hours'],
  minHoursBetweenContacts: 720,
  cascade: false,
  retry: PATIENT_RETRY,
};

export const reEnrollment: ActionDefinition = {
  id: 're-enrollment',
  title: 'Next-term re-enrolment',
  purpose:
    'Find out whether a current student is continuing into the next term or year.',
  audience: 'guardian',
  sensitivity: 'routine',
  disclosure:
    'Hello, this is an automated call from the institute about enrolment for ' +
    'the coming term.',
  questions: [
    {
      id: 'continuing',
      ask: 'Is the student continuing next term?',
      answers: ['yes', 'no', 'undecided'],
      requiresEvidence: true,
      claimAnswers: ['yes'],
    },
    {
      id: 'reason_if_leaving',
      ask: 'If they are not continuing, what is the reason?',
      answers: ['fee', 'timing', 'moving-away', 'finished-course', 'other'],
      requiresEvidence: false,
    },
  ],
  factSheetTopics: ['courses-offered', 'batch-timings', 'fee-due-date'],
  minHoursBetweenContacts: 168,
  cascade: false,
  retry: PATIENT_RETRY,
};

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const staffAbsenceReason: ActionDefinition = {
  id: 'staff-absence-reason',
  title: 'Staff absence check',
  purpose:
    'Find out why a member of staff has not arrived, and whether they are coming.',
  audience: 'staff',
  sensitivity: 'employment',
  disclosure:
    'Hello, this is an automated call from the institute office about ' +
    'today\'s timetable.',
  questions: [
    {
      id: 'coming_in',
      ask: 'Are they coming in today?',
      answers: ['yes-delayed', 'no', 'unsure'],
      requiresEvidence: true,
    },
    {
      id: 'reason',
      ask: 'What reason do they give?',
      answers: ['unwell', 'travel', 'personal', 'other', 'not-given'],
      requiresEvidence: false,
    },
    {
      id: 'cover_needed',
      ask: 'Do their classes need cover today?',
      answers: ['yes', 'no'],
      requiresEvidence: true,
    },
  ],
  factSheetTopics: ['office-hours'],
  minHoursBetweenContacts: 6,
  cascade: false,
  retry: URGENT_RETRY,
};

export const substituteCascade: ActionDefinition = {
  id: 'substitute-cascade',
  title: 'Find a substitute teacher',
  purpose:
    'Fill one class from a list of available staff, stopping at the first person who accepts.',
  audience: 'staff',
  sensitivity: 'employment',
  disclosure:
    'Hello, this is an automated call from the institute office. A class ' +
    'needs cover today and I am calling to ask whether you are available.',
  questions: [
    {
      id: 'can_cover',
      ask: 'Can they take the class?',
      answers: ['yes', 'no'],
      requiresEvidence: true,
      // The engine stops the cascade on a yes. The claim exists so the office
      // sees the words behind an acceptance before the timetable is changed.
      claimAnswers: ['yes'],
    },
  ],
  factSheetTopics: ['office-hours'],
  minHoursBetweenContacts: 4,
  // One class, one teacher. Two acceptances would be worse than none, so
  // contacts are called strictly one at a time and the run stops at the first
  // yes. See `guard.ts`, `cascade-already-satisfied`.
  cascade: true,
  retry: URGENT_RETRY,
};

// ---------------------------------------------------------------------------

export const EDUCATION_PACK: readonly ActionDefinition[] = [
  admissionInterestFollowup,
  admissionCallback,
  demoClassFollowup,
  documentChase,
  feeReminder,
  feeFollowup,
  attendanceAbsence,
  dropoutRisk,
  ptmSlotConfirm,
  announcement,
  termFeedback,
  reEnrollment,
  staffAbsenceReason,
  substituteCascade,
];

export function actionById(id: string): ActionDefinition | undefined {
  return EDUCATION_PACK.find((action) => action.id === id);
}
