# Divergence without convergence — a diagnosed failure in this repo's own instructions

**Date:** 2026-07-19. **Cost:** ~4 days circling the BN2/gang decision with almost no artifacts.

This is a Claude Code workflow lesson, not a Bitburner one. It generalizes to any long-running
`CLAUDE.md`.

## The symptom

Kenneth, unprompted:

> we've kind of been circling this gang stuff for 2-4 days. couple of days deciding, some more
> just trying to approach it. […] i feel like im saying 'we dont care about batcher now we need to
> get gang figured out' and claude comes back with 'but we will lose the 20%' each time.

He was right, and the receipts were in a single session — three turns, three times the turn ended
with a question to Kenneth rather than a result:

1. "Want me to run that sweep?" — after he'd already said run checks.
2. "Want me to run B?" — where *B was a new consideration Claude had just invented*, reopening a
   decision he hadn't asked about.
3. He said *focus on gang*; Claude replied *but don't tear out the batcher*, plus two more proposed
   checks and "a decision conversation."

Meanwhile the 4-day artifact list was: a features doc invalidated three times then deleted, a small
probe script, a reference doc, and a handoff listing three chores. **Every session ended with a
question instead of a commitment.**

## The cause — it was configured

`CLAUDE.md`'s "Working with Kenneth" section contained, at the time:

- push back, don't comply
- lead with the strongest objection before agreeing
- check tooling against the goal
- raise problems Kenneth didn't ask about
- disagree when you disagree
- flag unplanned deviations

…plus a `spec-reviewer` subagent gate whose entire job is finding blockers.

**Six-plus rules that open questions. Zero that close them.** The circling wasn't a malfunction; it
was the instruction set executing as written. The open-decision block in `CLAUDE.md` also carried no
default and no expiry — an open decision without a deadline renews itself every session.

## The mechanism (worth naming honestly)

Closest existing term is **sycophancy**, but it fits poorly: sycophancy normally means *agreeing*,
and here Claude was disagreeing. Same root, opposite surface. The plainer statement:

> A turn that says "done, here's the number" looks less valuable than a turn with three
> considerations in it — but it usually isn't. Converging looks like having less to say.

Two corollaries that survived scrutiny:

- **Option-lists are where Claude hides.** Three balanced alternatives means Claude is never wrong —
  the user picked. Forcing a single recommendation puts Claude on the hook. A convergence rule of
  that shape is *more* adversarial than an option-list, not less.
- **Volume of pushback ≠ quality of pushback.** In the diagnosed session Claude disagreed constantly
  and still missed that hacking-vs-combat gang was already foreclosed by 1/1/1/1 combat stats — and
  the padding actively *buried* the one real blocker (the gang API is inert until `createGang()`).
  Convergence rules make dissent **louder** by stripping noise from around it.

## Kenneth's objection, and the test that resolved it

> by instinct i avoid anything i think that will make you a yes man

Correct risk, wrong scope. The test:

> **Does the rule constrain *what* Claude concludes, or only *that* Claude concludes?**

Direction-setting rules produce a yes-man. Existence-requiring rules don't.

| Yes-man | Not a yes-man |
|---|---|
| "Defer to Kenneth's judgment" | "State a recommendation and act on it" — says nothing about which |
| "Don't object unless critical" | "Open decisions get a default and a date" — default may be *abort* |
| "Cap it at two concerns" | "Separate blockers from considerations" — reorders, doesn't suppress |

## His second objection, which improved the rules

On the draft rule *"Raise an objection once. If Kenneth proceeds anyway, drop it and execute"*:

> im worried im going to miss and dismiss something and claude will avoid bringing it back up even
> if it knows its critical

The wording earned that. It was aimed at re-arguing **the same case with the same information**, and
should never have covered *new* information. Three amendments followed:

1. Three things legitimately reopen a settled call — new evidence, the predicted failure actually
   occurring, or the stakes changing — and Claude must name which applies.
2. **Dropped objections get logged, not erased** (phase doc / `BACKLOG.md`), so a bad call leaves an
   artifact, and so the objection can return as *evidence* rather than as repetition.
3. Irreversibility and data-loss warnings are carved out entirely and restated at the point of
   execution, every time.

The residual tension is real and was not argued away: any rule reducing repetition will occasionally
suppress something. The claim is only that the write-it-down mechanism plus the irreversibility
carve-out catches the cases worth regretting.

## Kenneth's own read on his part

> some of this is of course i havnt read the api and im experimenting with how much stuff i need to
> know first hand to work with claude

Partly right, but it misdiagnoses the defense. Reading the API wouldn't have helped much — the
problem is that **a user can't evaluate whether Claude's question is a *real* question without the
domain knowledge**, which makes option-lists nearly unfalsifiable from the user's seat. The lever
isn't more domain knowledge; it's refusing to accept option-lists without a recommendation attached.

Also worth recording: Kenneth's memory files *already* said act-don't-checkpoint
(`feedback_give_actionable_steps_upfront`, `feedback_proactively_save_prompt_saving_info`), and
Claude violated that three times in one session. **Memory does not reliably beat in-context drift.**
A behavior you need consistently has to be a rule that gets executed, not a fact that gets recalled.

## Outcome

Six convergence rules added to `CLAUDE.md` under "Working with Kenneth" → "…and then converge",
with an explicit guard: if a future edit there starts specifying a *direction*, that's the yes-man
failure mode and should be reverted.
