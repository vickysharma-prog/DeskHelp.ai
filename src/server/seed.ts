/**
 * The demo an empty installation starts with.
 *
 * A product whose first screen is six empty boxes tells a visitor nothing, so
 * a fresh database gets an institute, a full contact list, approved wording, a
 * run of finished calls and a review queue with real work in it. Every screen
 * then has something on it the moment somebody signs in.
 *
 * Everything here is invented. The institute does not exist, the families do
 * not exist, and the calls never happened: they are written straight into the
 * ledger rather than placed. The numbers come from the NXX-555-01XX range that
 * exists so nobody's actual phone ever rings in a demo.
 *
 * Seeding runs only against an empty database, so it can never overwrite an
 * institute's own data.
 */

import { Auth } from '../core/auth.ts';
import { Ledger } from '../core/ledger.ts';
import { Store } from '../core/store.ts';
import type { Contact, SpokenRegister } from '../core/types.ts';

export const DEMO_EMAIL = 'demo@deskhelp.ai';
export const DEMO_PASSWORD = 'demo-northline-2026';

const INSTITUTE_ID = 'institute';

const SURNAMES = [
  'Sharma', 'Verma', 'Iyer', 'Khan', 'Nair', 'Gupta', 'Reddy', 'Patel',
  'Joshi', 'Menon', 'Chauhan', 'Bose', 'Kulkarni', 'Rao', 'Malhotra',
  'Bhatt', 'Pillai', 'Saxena', 'Chandra', 'Deshmukh', 'Ahmed', 'Fernandes',
  'Ghosh', 'Sethi', 'Naidu', 'Mehta', 'Kapoor', 'Das', 'Banerjee', 'Shetty',
];

const INITIALS = 'ABDGHKLMNPRSTVY'.split('');

/**
 * Area codes paired with the 555-01XX block. Every combination is a number
 * that cannot be allocated to a real person, which is the point.
 */
const AREA_CODES = [202, 212, 310, 312, 415, 617];

const REGISTERS: SpokenRegister[] = ['hi-en', 'hi-en', 'hi-en', 'hi', 'en', 'hi-en', 'ta'];

/** Built rather than typed out, so the list is long enough to look like a real roll. */
function buildContacts(count: number): Contact[] {
  const contacts: Contact[] = [];

  for (let i = 0; i < count; i += 1) {
    const area = AREA_CODES[Math.floor(i / 100) % AREA_CODES.length]!;
    const line = 100 + (i % 100);
    const surname = SURNAMES[i % SURNAMES.length]!;
    const initial = INITIALS[(i * 7) % INITIALS.length]!;

    contacts.push({
      id: `c-${i + 1}`,
      fullName: `${initial}. ${surname}`,
      phone: `+1${area}555${String(line).padStart(4, '0')}`,
      preferredRegister: REGISTERS[i % REGISTERS.length]!,
      // A handful without consent and a couple who asked not to be called, so
      // the contact list shows the states an operator actually has to handle.
      consent: i % 17 !== 5,
      doNotCall: i % 41 === 9,
      wardId: `s-${i + 1}`,
    });
  }
  return contacts;
}

const CONTACTS = buildContacts(124);

const FACT_SHEET = [
  {
    id: 'fs-fee-due-date',
    topic: 'fee-due-date',
    wording: {
      en: 'The second instalment is due on the 15th of this month.',
      hi: 'Doosri kist is mahine ki 15 taarikh tak deni hai.',
    },
  },
  {
    id: 'fs-payment-channels',
    topic: 'payment-channels',
    wording: {
      en: 'Payment is taken at the office counter or on the online portal.',
      hi: 'Fees office counter par ya online portal par jama hoti hai.',
    },
  },
  {
    id: 'fs-office-hours',
    topic: 'office-hours',
    wording: {
      en: 'The office is open 9 am to 5 pm, Monday to Saturday.',
      hi: 'Office somvaar se shanivaar, subah 9 se shaam 5 baje tak khula hai.',
    },
  },
  {
    id: 'fs-batch-timings',
    topic: 'batch-timings',
    wording: {
      en: 'The morning batch runs 7 to 9 am, Monday to Saturday.',
      hi: 'Subah ka batch somvaar se shanivaar, 7 se 9 baje tak chalta hai.',
    },
  },
  {
    id: 'fs-courses-offered',
    topic: 'courses-offered',
    wording: {
      en: 'We run Class 11 and Class 12 science batches, and a repeaters batch.',
      hi: 'Yahan Class 11, Class 12 science batch aur repeaters batch chalte hain.',
    },
  },
  {
    id: 'fs-admission-process',
    topic: 'admission-process',
    wording: {
      en: 'Admission needs the last marksheet and one photograph, brought to the office.',
      hi: 'Admission ke liye pichhli marksheet aur ek photo office mein leni hoti hai.',
    },
  },
  {
    id: 'fs-attendance-policy',
    topic: 'attendance-policy',
    wording: {
      en: 'Attendance is taken at the start of every batch.',
      hi: 'Har batch ki shuruaat mein attendance li jaati hai.',
    },
  },
];

/**
 * Questions people actually ask a coaching institute, and which no approved
 * wording covers. They are the point of the review queue: each one is a thing
 * a parent wanted, a caller could not answer, and a person now has to.
 */
const QUESTIONS: { contact: number; action: string; quote: string }[] = [
  { contact: 2, action: 'fee-reminder', quote: 'Kya scholarship mil sakti hai iss baar?' },
  { contact: 5, action: 'admission-interest-followup', quote: 'Hostel ki facility hai kya aapke yahan?' },
  { contact: 9, action: 'fee-reminder', quote: 'Fees do kisto mein de sakte hain kya?' },
  { contact: 14, action: 'attendance-absence', quote: 'Bus route change hua hai kya, pick-up time alag lag raha hai' },
  { contact: 18, action: 'demo-class-followup', quote: 'Online batch bhi hai ya sirf offline?' },
  { contact: 23, action: 'admission-interest-followup', quote: 'Repeaters batch ki fees kitni hai?' },
  { contact: 27, action: 'fee-reminder', quote: 'Mere do bachche hain, dono ka saath mein kuch concession hota hai?' },
  { contact: 31, action: 'document-chase', quote: 'TC abhi purane school se nahi mili, kitna time mil sakta hai?' },
  { contact: 36, action: 'demo-class-followup', quote: 'Doubt class alag se hoti hai kya, aur kis time?' },
  { contact: 42, action: 'attendance-absence', quote: 'Agar ek hafta chhutti leni pade to attendance pe kya asar hoga?' },
  { contact: 47, action: 'admission-interest-followup', quote: 'Physics kaun padhate hain, sir ka naam bata sakte hain?' },
  { contact: 53, action: 'fee-reminder', quote: 'Agar beech mein chhodna pade to refund milta hai kya?' },
  { contact: 58, action: 'demo-class-followup', quote: 'Demo class dobara attend kar sakte hain kya?' },
  { contact: 64, action: 'ptm-slot-confirm', quote: 'Meeting mein dono parents aa sakte hain ya ek hi?' },
];

/** Calls with no question attached, so the history is not only queue entries. */
const CLEAN_CALLS: { contact: number; action: string; disposition: 'answered' | 'unreached' | 'declined'; answers: Record<string, string> }[] = [
  { contact: 1, action: 'fee-reminder', disposition: 'answered', answers: { aware_of_due_date: 'yes', intends_to_pay_by_date: 'yes', preferred_channel: 'portal' } },
  { contact: 3, action: 'demo-class-followup', disposition: 'answered', answers: { will_join: 'undecided', blocker: 'timing' } },
  { contact: 4, action: 'fee-reminder', disposition: 'unreached', answers: {} },
  { contact: 7, action: 'attendance-absence', disposition: 'answered', answers: { guardian_aware: 'yes', reason: 'unwell', expected_back: 'tomorrow' } },
  { contact: 11, action: 'attendance-absence', disposition: 'answered', answers: { guardian_aware: 'no', reason: 'not-given', expected_back: 'not-sure' } },
  { contact: 16, action: 'demo-class-followup', disposition: 'answered', answers: { will_join: 'yes', class_experience: 'good' } },
  { contact: 21, action: 'fee-reminder', disposition: 'declined', answers: {} },
  { contact: 25, action: 'admission-interest-followup', disposition: 'answered', answers: { still_interested: 'no', course_interest: 'not-sure' } },
  { contact: 29, action: 'fee-reminder', disposition: 'unreached', answers: {} },
  { contact: 33, action: 'ptm-slot-confirm', disposition: 'answered', answers: { can_attend: 'yes', preferred_slot: 'slot-2' } },
];

/** Things people said they would do. Said, not done. */
const CLAIMS: Record<number, { questionId: string; statedValue: string; quote: string }> = {
  1: { questionId: 'intends_to_pay_by_date', statedValue: 'yes', quote: 'haan ji, main portal pe 14 tak kar dunga' },
  16: { questionId: 'will_join', statedValue: 'yes', quote: 'haan, agle hafte se bhej denge' },
  33: { questionId: 'preferred_slot', statedValue: 'slot-2', quote: 'saturday gyarah baje theek rahega' },
};

export function seedDemo(args: {
  readonly store: Store;
  readonly ledger: Ledger;
  readonly auth: Auth;
  readonly now?: Date;
}): boolean {
  const { store, ledger, auth } = args;

  if (!auth.isEmpty() || store.getInstitute()) return false;

  const now = args.now ?? new Date();

  auth.createPasswordAccount({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    instituteName: 'Northline Education Hub',
  });

  store.saveInstitute({
    id: INSTITUTE_ID,
    displayName: 'Northline Education Hub',
    callbackNumber: '+12025550199',
    timezone: 'Asia/Kolkata',
    jurisdiction: 'IN',
    // Empty on purpose. The demo cannot dial, whatever else is configured.
    allowedDestinations: [],
  });

  store.replaceContacts(CONTACTS);
  store.publishFactSheet(INSTITUTE_ID, 'A. Principal', FACT_SHEET, now);

  for (const config of [
    { actionId: 'fee-reminder', schedule: { kind: 'monthly-before-end' as const, daysBeforeEnd: 2, at: { hour: 10, minute: 0 } } },
    { actionId: 'attendance-absence', schedule: { kind: 'daily' as const, at: { hour: 9, minute: 30 }, weekdaysOnly: true } },
    { actionId: 'demo-class-followup', schedule: { kind: 'manual' as const } },
    { actionId: 'admission-interest-followup', schedule: { kind: 'weekly' as const, weekday: 2, at: { hour: 11, minute: 0 } } },
  ]) {
    store.setActionConfig({ ...config, enabled: true });
  }

  // None of the calls below happened. They are written into the ledger so the
  // dashboard, the history and the review queue have real work on them.
  let index = 0;
  const record = (
    contact: number,
    actionId: string,
    disposition: 'answered' | 'needs-human' | 'unreached' | 'declined',
    answers: Record<string, string>,
    quote?: string,
  ) => {
    index += 1;
    const callId = `demo_call_${index}`;
    const claim = CLAIMS[contact];

    ledger.recordOutcome({
      idempotencyKey: `demo_c-${contact}_${actionId}`,
      instituteId: INSTITUTE_ID,
      contactId: `c-${contact}`,
      actionId,
      callId,
      placedAt: new Date(now.getTime() - index * 41 * 60_000),
      disposition,
      answers,
      claims: claim ? [{ ...claim, offsetSeconds: 11, confirmed: false }] : [],
      unansweredQuestions: quote
        ? [{ contactId: `c-${contact}`, callId, quote, offsetSeconds: 7, reason: 'outside-fact-sheet' as const }]
        : [],
    });
  };

  for (const call of CLEAN_CALLS) {
    record(call.contact, call.action, call.disposition, call.answers);
  }
  for (const question of QUESTIONS) {
    // A call that produced a question is held open for a person by definition.
    record(question.contact, question.action, 'needs-human', {}, question.quote);
  }

  return true;
}
