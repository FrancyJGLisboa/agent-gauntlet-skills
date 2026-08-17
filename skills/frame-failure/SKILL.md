---
name: frame-failure
description: Interview a subject-matter expert about the outcomes they refuse to accept, and write a Gauntlet request from their answers. Use before compile-gauntlet when the person knows what they want but cannot state what would make it wrong, when a request describes features without consequences, or when a compiled pack would otherwise have no bar beyond the agent's own taste. Do not use to elicit technical decisions, architecture, thresholds, or acceptance commands; those are the compiler's to derive.
---

# Frame Failure

Elicit the one thing the compiler cannot derive: what outcome this person refuses to accept.

Everything else in a Gauntlet Pack is reconstructible from evidence. Refused outcomes are not. They come from a business, a duty, a prior incident, or a reputation, and no amount of repository inspection recovers them. This interview exists because `compile-gauntlet` is correctly forbidden from asking the user technical questions, and consequence is not a technical question — `human_dependency` names `value_conflict` as a legitimate thing to ask a human about.

Produce `gauntlet-request.md`. Do not produce a pack, an architecture, a test, or a plan.

## Operating constraints

- Ask only about consequences, people, and obligations. Never ask which library, threshold, framework, format, or design to use, and never ask the user to approve technical quality.
- Elicit by recall, not invention. A person asked to imagine failures produces vague ones; the same person asked what they already check by hand produces precise ones.
- Accept "I don't know" and record it as a gap. An honest gap becomes an experiment the compiler resolves. A confident guess becomes a requirement built on sand.
- Stop when the answers are observable, not when a question count is reached. Three sharp refused outcomes end the interview; twelve vague ones do not.
- Never invent a refused outcome the user did not express. Suggesting a shape from the catalogue and asking whether it applies is elicitation; writing one down they never agreed to is fabrication.
- Do not continue into `compile-gauntlet` automatically unless the user asked for the product rather than the request.

## Interview workflow

### 1. Establish who is harmed

Ask who uses this and what decision or task it changes for them. Ask who else is affected when it is wrong — a customer, a regulator, a colleague downstream, the user's own credibility.

A refused outcome with no one behind it is usually a preference, not a requirement. Record the person; the compiler uses them to decide what counts as a material claim.

### 2. Recover the checks that already exist

Ask what they do by hand today before they trust the current process, whatever that process is — a spreadsheet, a vendor, a colleague's word. Ask what went wrong the last time, concretely rather than hypothetically. Ask what would make them abandon this and go back to what they use now.

These three questions do most of the work. The manual checks a person already performs are a specification of correctness they have never written down.

### 3. Walk the failure shapes

Read [failure-shapes.md](references/failure-shapes.md) and walk the shapes that plausibly apply. Name the shape in plain language and ask whether it would matter here. Do not read the catalogue aloud in full; select.

The catalogue is a menu so the user chooses rather than composes. Do not treat a shape they reject as a gap — a rejected shape is information, and worth recording as a non-goal.

### 4. Sharpen each answer until it is observable

An answer is finished when someone could look at the running product and agree it happened. Push on abstractions with a concrete instance: ask what they would see on the screen, in the file, or in the report at the moment it went wrong.

Convert each into one sentence of the form `It must never <do X> when <condition>` or `I would stop trusting it if <observable>`. Read it back and let them correct it. The user owns the wording; you own the sharpness.

Reject as unusable, and ask again: adjectives with no observation behind them, restatements of the goal in negative form, and anything that is a technical judgment wearing a consequence's clothes. "It must be accurate," "it must not be badly built," and "it must never use the wrong database" are all failures of this step, the last because which database is the compiler's decision, not theirs.

### 5. Establish what is unavailable

Ask what they have access to and, more importantly, what they do not — data they cannot obtain, systems they cannot touch, files that must not change, spending or authority limits, deadlines.

An unavailable input is not a failure of the interview. It is the difference between a pack the compiler marks `executable` and one it marks `blocked`, and stating it now is what prevents an hour of building against an input that was never going to exist.

### 6. Write the request

Write `gauntlet-request.md` in the target repository from [gauntlet-request.md](assets/gauntlet-request.md). Leave a section empty rather than filling it with an inference the user did not make.

Under refused outcomes, write only sentences the user confirmed, one per line, in their words. Do not rank them, do not add technical qualifiers, and do not merge two into one.

### 7. Close

State how many refused outcomes were captured, which failure shapes the user explicitly ruled out, and which sections were left empty and why.

Tell the user the request is ready for `compile-gauntlet`, and that the compiler derives the architecture, the tests, and the thresholds from it. Do not ask them to review a plan; there is no plan yet.

## Completion response

Report the path written, the refused outcomes verbatim, the recorded gaps, and any dependency that will require access, credentials, spending, or authority before a run can start. Do not report the interview as complete while a captured outcome remains unobservable.
