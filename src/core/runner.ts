/**
 * The assembly layer: one run of one action over a list of contacts.
 *
 * Everything below this file is a decision in isolation — may we call, what do
 * we say, what did it mean. This is where they are put in order, and the order
 * is the safety:
 *
 *   suppression → guard → reserve → retry decision → render → place → judge → settle
 *
 * Reserving comes before placing, so a crash between them blocks the retry
 * rather than producing a second call. Judging comes before settling, so a
 * disposition is never written that nobody worked out. And the suppression
 * check is first, because somebody who asked to be left alone should not have
 * their consent flag, their calling window or their fee balance consulted at
 * all.
 */

import { guard } from './guard.ts';
import { renderCall } from './render.ts';
import { judge, transcriptTurnsOf } from './disposition.ts';
import { decideRetry, calleKeyFor } from './retry.ts';
import {
  localeFor,
  liveGate,
  placeCall,
  awaitTerminal,
  recipientResultOf,
} from './calle.ts';
import { priorCallsForContact } from './history.ts';
import { Ledger, idempotencyKeyFor } from './ledger.ts';
import type { CalleTransport, CalleCreateBody } from './calle.ts';
import type { Judgement } from './disposition.ts';
import type {
  ActionDefinition,
  Contact,
  FactSheet,
  Institute,
  PriorCall,
  RefusalReason,
} from './types.ts';

export interface ContactOutcome {
  readonly contactId: string;
  readonly maskedPhone: string;
  readonly status:
    | 'refused' // a guard stopped it before dialling
    | 'skipped' // already held, or no retry due
    | 'simulated' // the fixture transport answered; nothing dialled
    | 'placed' // a real call
    | 'submission-unknown';
  readonly refusalReason?: RefusalReason;
  readonly detail: string;
  readonly warnings: readonly string[];
  readonly judgement?: Judgement;
  /** The exact task text, so an operator can read what would be said. */
  readonly taskText?: string;
}

export interface RunResult {
  readonly actionId: string;
  readonly periodKey: string;
  readonly live: boolean;
  readonly outcomes: readonly ContactOutcome[];
}

export interface RunOptions {
  readonly action: ActionDefinition;
  readonly institute: Institute;
  readonly factSheet: FactSheet;
  readonly contacts: readonly Contact[];
  /** Which window this run belongs to: "2026-09" or "2026-09-14". */
  readonly periodKey: string;
  readonly ledger: Ledger;
  readonly transport: CalleTransport;
  readonly env: Record<string, string | undefined>;
  /** Prior calls across all contacts; filtered per contact before rendering. */
  readonly priorCalls?: readonly PriorCall[];
  readonly now?: Date;
  /** Tests and demos pass a no-op so the run does not actually wait a minute. */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * A preview writes nothing.
   *
   * It still READS everything — suppressions, calling hours, contact history —
   * so what it shows is what would really happen. But it does not reserve the
   * authorisation, and does not record an outcome.
   *
   * Without this, looking at a run consumes it: the ledger would hold the
   * period, and the real run an hour later would skip every contact with
   * "already handled for this window". An operator would have quietly
   * cancelled the month's reminders by pressing a button labelled Dry run.
   */
  readonly preview?: boolean;
}

export async function runAction(options: RunOptions): Promise<RunResult> {
  const {
    action,
    institute,
    factSheet,
    contacts,
    periodKey,
    ledger,
    transport,
    env,
  } = options;

  const now = options.now ?? new Date();
  const outcomes: ContactOutcome[] = [];

  // A cascade stops at the first acceptance, so the run is strictly sequential
  // and this flag ends it. Two people told the same class is theirs is worse
  // than nobody covering it.
  let cascadeSatisfied = false;
  let anyLive = false;

  for (const contact of contacts) {
    const gate = liveGate({ env, institute, phone: contact.phone });
    if (gate.live) anyLive = true;

    // The current authorisation must not count against its own retry.
    const lastContactedAt = ledger.lastContactedAt(
      institute.id,
      action.id,
      contact.id,
      periodKey,
    );

    const decision = guard({
      action,
      contact,
      institute,
      suppressed: ledger.isSuppressed(institute.id, contact.id),
      ...(lastContactedAt ? { lastContactedAt } : {}),
      cascadeSatisfied: action.cascade ? cascadeSatisfied : false,
      mode: gate.live ? 'live' : 'dry-run',
      now,
    });

    if (!decision.allowed) {
      // A preview still renders the words. Reading what would be said is the
      // point of looking, and it does not stop being the point because the
      // hour is wrong or somebody on the list has no consent.
      const rendered = renderCall({ action, contact, institute, factSheet });
      outcomes.push({
        contactId: contact.id,
        maskedPhone: rendered.maskedDestination,
        status: 'refused',
        refusalReason: decision.reason,
        detail: decision.detail,
        warnings: [],
        ...(options.preview ? { taskText: rendered.taskText } : {}),
      });
      continue;
    }

    // Claim the authorisation before anything can dial. A preview claims
    // nothing, so looking at a run never consumes it.
    const preview = options.preview === true;
    const auth = {
      instituteId: institute.id,
      actionId: action.id,
      contactId: contact.id,
      periodKey,
    };
    const reservation = preview
      ? { kind: 'reserved' as const, idempotencyKey: idempotencyKeyFor(auth) }
      : ledger.reserve(auth, now);

    const attempts = reservation.kind === 'already-held' ? 1 : 0;
    const retryDecision = decideRetry({
      action,
      ledgerKey: reservation.idempotencyKey,
      // A held reservation whose call never settled is an attempt already made.
      attempts:
        attempts === 0
          ? []
          : [{ attemptNumber: 1, placedAt: now, disposition: 'needs-human' }],
      now,
    });

    if (!retryDecision.retry) {
      outcomes.push({
        contactId: contact.id,
        maskedPhone: '',
        status: 'skipped',
        detail: retryDecision.reason,
        warnings: decision.warnings,
      });
      continue;
    }

    // History comes from the ledger unless a caller supplied it explicitly.
    // Without this the call-to-call memory is unreachable: nothing else in
    // the system ever builds a PriorCall.
    const priorCalls = options.priorCalls
      ? priorCallsForContact(options.priorCalls, contact.id)
      : ledger.priorCallsFor(institute.id, contact.id);

    const rendered = renderCall({
      action,
      contact,
      institute,
      factSheet,
      priorCalls,
    });

    // A preview stops here, and it stops here rather than later on purpose.
    // Everything worth looking at already exists: the exact words, the masked
    // destination, the warnings. Going one line further builds a body and
    // hands it to a transport, and whether that rings a phone then depends on
    // which transport the caller happened to pass in. Reading a plan must
    // never be able to dial, however it is called.
    if (preview) {
      outcomes.push({
        contactId: contact.id,
        maskedPhone: rendered.maskedDestination,
        status: 'simulated',
        detail: 'Preview only. Nothing reserved, nothing dialled, nothing recorded.',
        warnings: decision.warnings,
        taskText: rendered.taskText,
      });
      continue;
    }

    const body: CalleCreateBody = {
      task: rendered.taskText,
      recipients: [
        {
          phones: [contact.phone],
          region: institute.jurisdiction,
          locale: localeFor(rendered.register, institute.jurisdiction),
        },
      ],
      result_schema: rendered.resultSchema,
      recipient_result_schema: rendered.resultSchema,
      metadata: {
        workflow_run_id: `${action.id}:${periodKey}`,
        deskhelp_action: action.id,
        deskhelp_fact_sheet_version: String(rendered.factSheetVersion),
      },
    };

    const placed = await placeCall({
      transport,
      gate,
      body,
      idempotencyKey: calleKeyFor(
        reservation.idempotencyKey,
        retryDecision.attemptNumber,
      ),
    });

    if (placed.kind === 'submission-unknown') {
      if (!preview) ledger.markRefused(reservation.idempotencyKey, 'destination-not-allowed');
      outcomes.push({
        contactId: contact.id,
        maskedPhone: rendered.maskedDestination,
        status: 'submission-unknown',
        detail: placed.detail,
        warnings: decision.warnings,
        taskText: rendered.taskText,
      });
      continue;
    }

    if (!preview) ledger.markPlaced(reservation.idempotencyKey, placed.callId);

    const { response } = await awaitTerminal(transport, placed.callId, {
      firstPollDelayMs: gate.live ? 60_000 : 0,
      intervalMs: gate.live ? 8_000 : 0,
      ...(options.sleep ? { sleep: options.sleep } : {}),
    });

    const recipientResult = recipientResultOf(response);

    const judgement = judge({
      action,
      callId: placed.callId,
      contactId: contact.id,
      result: recipientResult,
      approvedTexts: rendered.approvedTexts,
    });

    if (!preview) {
      ledger.markSettled(reservation.idempotencyKey, judgement.disposition);

    // Persist what the call established, and queue anything the agent could
    // not answer. This is what the next call to this family reads.
      ledger.recordOutcome({
        idempotencyKey: reservation.idempotencyKey,
        instituteId: institute.id,
        contactId: contact.id,
        actionId: action.id,
        callId: placed.callId,
        placedAt: now,
        disposition: judgement.disposition,
        answers: judgement.answers,
        claims: judgement.claims,
        unansweredQuestions: judgement.unansweredQuestions,
        transcript: transcriptTurnsOf(recipientResult),
      });
    }

    if (action.cascade && judgement.disposition === 'answered') {
      // Only a real, evidenced acceptance ends a cascade. An ambiguous call
      // leaves the class uncovered, which a person can fix; a wrongly ended
      // cascade leaves it uncovered silently.
      const accepted = Object.values(judgement.answers).includes('yes');
      if (accepted) cascadeSatisfied = true;
    }

    outcomes.push({
      contactId: contact.id,
      maskedPhone: rendered.maskedDestination,
      status: placed.kind === 'placed' ? 'placed' : 'simulated',
      detail: placed.kind === 'simulated' ? placed.reason : 'Call placed.',
      warnings: decision.warnings,
      judgement,
      taskText: rendered.taskText,
    });
  }

  return { actionId: action.id, periodKey, live: anyLive, outcomes };
}
