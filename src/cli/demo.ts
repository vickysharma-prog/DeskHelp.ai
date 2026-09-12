/**
 * The whole loop, end to end, with no credentials and no network.
 *
 * `npm run demo`
 *
 * Everything here is fictional: reserved example phone numbers, an invented
 * institute, scripted CALL-E responses. Nothing dials. The point is that the
 * safety properties are visible rather than asserted — each scenario shows a
 * different way a call can go wrong and what DeskHelp does about it.
 */

import { Ledger } from '../core/ledger.ts';
import { FixtureTransport } from '../core/calle.ts';
import { runAction } from '../core/runner.ts';
import { actionById } from '../packs/education/actions.ts';
import type { CalleCallResponse } from '../core/calle.ts';
import type { Contact, FactSheet, Institute } from '../core/types.ts';

// Reserved fictional numbers (RFC 3849 style 555-01xx). Real destinations live
// in .env and never in source.
const PARENT_A = '+15550100001';
const PARENT_B = '+15550100002';
const PARENT_C = '+15550100003';
const PARENT_D = '+15550100004';

const institute: Institute = {
  id: 'northline',
  displayName: 'Northline Education Hub',
  callbackNumber: '+15550100999',
  // Declared by the operator. Never inferred from a phone number.
  timezone: 'Asia/Kolkata',
  jurisdiction: 'IN',
  allowedDestinations: [],
};

const factSheet: FactSheet = {
  instituteId: 'northline',
  version: 4,
  approvedBy: 'A. Principal',
  approvedAt: '2026-09-01T00:00:00Z',
  entries: [
    {
      id: 'fs-due',
      topic: 'fee-due-date',
      wording: {
        en: 'The second instalment is due on the 15th of this month.',
        hi: 'Doosri kist is mahine ki 15 taarikh tak deni hai.',
      },
    },
    {
      id: 'fs-channels',
      topic: 'payment-channels',
      wording: {
        en: 'Payment is taken at the office counter or on the online portal.',
        hi: 'Fees office counter par ya online portal par jama hoti hai.',
      },
    },
    {
      id: 'fs-hours',
      topic: 'office-hours',
      wording: {
        en: 'The office is open 9 am to 5 pm, Monday to Saturday.',
        hi: 'Office somvaar se shanivaar, subah 9 se shaam 5 baje tak khula hai.',
      },
    },
  ],
};

const contact = (id: string, name: string, phone: string): Contact => ({
  id,
  fullName: name,
  phone,
  preferredRegister: 'hi-en',
  consent: true,
  doNotCall: false,
});

const contacts: Contact[] = [
  contact('c-1', 'Fictional Parent A', PARENT_A),
  contact('c-2', 'Fictional Parent B', PARENT_B),
  contact('c-3', 'Fictional Parent C', PARENT_C),
  { ...contact('c-4', 'Fictional Parent D', PARENT_D), consent: false },
];

const turn = (speaker: string, text: string, offset_seconds: number) => ({
  speaker,
  text,
  offset_seconds,
});

/**
 * Four scripted calls, each showing a different failure or success mode.
 * The keys are the simulated call ids the fixture transport generates.
 */
function scriptedResponses(keys: string[]): Record<string, CalleCallResponse> {
  const [a, b, c] = keys;
  const responses: Record<string, CalleCallResponse> = {};

  // A. A clean call. The parent answers, says they will pay, and the words
  //    they used support it.
  responses[a!] = {
    status: 'completed',
    recipients: [
      {
        status: 'completed',
        transcript_turns: [
          turn('bot', 'Hello, this is an automated reminder from Northline Education Hub.', 0),
          turn('user', 'Haan ji boliye.', 4),
          turn('user', 'Theek hai, main portal pe 14 tak kar dunga.', 11),
        ],
        structured_result: {
          identity_confirmed: 'yes',
          opt_out_requested: 'no',
          unanswered_questions: [],
          aware_of_due_date: 'yes',
          intends_to_pay_by_date: 'yes',
          preferred_channel: 'portal',
          evidence_quotes: {
            intends_to_pay_by_date: 'main portal pe 14 tak kar dunga',
          },
        },
      },
    ],
  };

  // B. The parent asks something nobody approved an answer for. The agent
  //    captures it instead of inventing one.
  responses[b!] = {
    status: 'completed',
    recipients: [
      {
        status: 'completed',
        transcript_turns: [
          turn('bot', 'Hello, this is an automated reminder from Northline Education Hub.', 0),
          turn('user', 'Kya scholarship mil sakti hai iss baar?', 6),
          turn('bot', "I don't have that in front of me — I'll have someone from the office confirm and call you back.", 9),
          turn('user', 'Theek hai, counter pe aa jaunga.', 15),
        ],
        structured_result: {
          identity_confirmed: 'yes',
          opt_out_requested: 'no',
          unanswered_questions: [{ quote: 'Kya scholarship mil sakti hai iss baar?' }],
          aware_of_due_date: 'yes',
          preferred_channel: 'office',
          evidence_quotes: {},
        },
      },
    ],
  };

  // C. The agent quotes a figure nobody approved, and reports a quote the
  //    parent never said. Both are caught.
  responses[c!] = {
    status: 'completed',
    recipients: [
      {
        status: 'completed',
        transcript_turns: [
          turn('bot', 'Hello, this is an automated reminder from Northline Education Hub.', 0),
          turn('bot', 'Your outstanding amount is 9250 rupees.', 5),
          turn('user', 'Hmm.', 9),
        ],
        structured_result: {
          identity_confirmed: 'yes',
          opt_out_requested: 'no',
          unanswered_questions: [],
          intends_to_pay_by_date: 'yes',
          evidence_quotes: {
            intends_to_pay_by_date: 'Hmm, yes I will pay before the 15th',
          },
        },
      },
    ],
  };

  return responses;
}

function heading(text: string): void {
  console.log(`\n${'─'.repeat(72)}\n${text}\n${'─'.repeat(72)}`);
}

async function main(): Promise<void> {
  const ledger = new Ledger();
  const action = actionById('fee-reminder')!;
  const now = new Date('2026-09-12T06:00:00Z'); // 11:30 IST, inside the window

  heading('DESKLINE — fee reminder, dry run, no credentials, nothing dials');
  console.log(`Institute      : ${institute.displayName}`);
  console.log(`Timezone       : ${institute.timezone}  (declared, never inferred)`);
  console.log(`Jurisdiction   : ${institute.jurisdiction}  → calling window 09:00–21:00`);
  console.log(`Fact sheet     : v${factSheet.version}, approved by ${factSheet.approvedBy}`);
  console.log(`Contacts       : ${contacts.length}`);

  // The fixture needs the simulated call ids, which are derived from the
  // idempotency keys. Run once to collect them, then replay with the scripts.
  const probe = new FixtureTransport();
  await runAction({
    action,
    institute,
    factSheet,
    contacts,
    periodKey: '2026-09',
    ledger: new Ledger(),
    transport: probe,
    env: {},
    now,
    sleep: async () => {},
  });
  const simulatedIds = probe.sent.map((s) => `sim_${s.idempotencyKey}`);

  const transport = new FixtureTransport({
    responses: scriptedResponses(simulatedIds),
  });

  const result = await runAction({
    action,
    institute,
    factSheet,
    contacts,
    periodKey: '2026-09',
    ledger,
    transport,
    env: {},
    now,
    sleep: async () => {},
  });

  heading('WHAT THE AGENT WOULD SAY  (first contact, abridged)');
  const first = result.outcomes.find((o) => o.taskText);
  console.log(
    first?.taskText?.split('\n').slice(0, 22).join('\n') ?? '(none rendered)',
  );
  console.log('  … (boundary, approved statements and closing omitted)');

  heading('OUTCOMES');
  for (const outcome of result.outcomes) {
    console.log(`\n▸ ${outcome.contactId}  ${outcome.maskedPhone}`);
    console.log(`  status      : ${outcome.status}`);
    if (outcome.refusalReason) {
      console.log(`  refused     : ${outcome.refusalReason}`);
      console.log(`  because     : ${outcome.detail}`);
    }
    for (const warning of outcome.warnings) {
      console.log(`  warning     : ${warning}`);
    }

    const judgement = outcome.judgement;
    if (!judgement) continue;

    console.log(`  disposition : ${judgement.disposition}`);
    const answered = Object.entries(judgement.answers).filter(
      ([, v]) => v !== 'unknown',
    );
    if (answered.length > 0) {
      console.log(`  answers     : ${answered.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }
    for (const claim of judgement.claims) {
      console.log(`  CLAIM       : ${claim.questionId}=${claim.statedValue} (not a fact)`);
      console.log(`                their words: "${claim.quote}"`);
    }
    for (const question of judgement.unansweredQuestions) {
      console.log(`  → TO OFFICE : "${question.quote}"`);
    }
    for (const drop of judgement.discarded) {
      console.log(`  DISCARDED   : ${drop.questionId} reported "${drop.reported}"`);
      console.log(`                ${drop.reason}`);
    }
    for (const finding of judgement.spokenFindings) {
      console.log(`  AGENT SAID  : unapproved "${finding.token}" — "${finding.quote}"`);
    }
  }

  heading('WHAT AN OPERATOR SEES');
  const counts = new Map<string, number>();
  for (const outcome of result.outcomes) {
    const key = outcome.judgement?.disposition ?? outcome.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) console.log(`  ${key.padEnd(14)} ${count}`);

  const queue = result.outcomes.flatMap((o) => o.judgement?.unansweredQuestions ?? []);
  console.log(`\n  ${queue.length} question(s) waiting for a person to answer.`);
  console.log('  Answer one, and the next call to that family delivers it verbatim.');

  console.log(
    '\n  Nothing was dialled. DESKHELP_LIVE is unset and the allow list is empty;\n' +
      '  both must pass before a real phone rings.\n',
  );

  ledger.close();
}

await main();
