# Failure shapes

Seven shapes cover most refused outcomes. Use them as a menu the user selects from, not a form to complete. Name one in plain language, ask whether it would matter here, and move on when it would not.

Each entry gives the elicitation question, the sentence to sharpen toward, and what a compiler can build from the result. The last column is context for you, not for the interview — never explain to the user how their answer becomes a test, because that invites them to start specifying tests.

## 1. Silently wrong

The product states something incorrect with the same confidence it states everything else.

- **Ask:** if it showed you a number that was simply wrong, would you be able to tell?
- **Toward:** "It must never present a figure I cannot trace back to where it came from."
- **Becomes:** provenance requirements in the target contracts, traced through to acceptance tests.

## 2. Stale

The data is old and nothing says so.

- **Ask:** how old can this be before it is misleading rather than merely late?
- **Toward:** "It must never show me a price as current when the feed has not updated in over an hour."
- **Becomes:** a freshness assertion, a test that fabricates a stale feed, and a critic instructed to attempt exactly that failure.

## 3. Silently incomplete

Records are dropped, skipped, or truncated without a word.

- **Ask:** what happens today when a row is malformed, a file is short, or a source is missing?
- **Toward:** "It must never skip a record it could not read without telling me which one."
- **Becomes:** error-path tests asserting a non-zero exit and a named record on stderr, which a rule of "tests must exit zero" cannot express.

## 4. Leaky

Information reaches somewhere it should not.

- **Ask:** is there anything here that must not leave this machine, this network, or this team?
- **Toward:** "It must never send customer data to a service I have not approved."
- **Becomes:** an architecture constraint with an explicit boundary, and a distribution contract that cannot be satisfied by an external call.

## 5. Irreversible

It acts on the outside world in a way that cannot be undone.

- **Ask:** what could it do that you could not take back?
- **Toward:** "It must never email a customer without me seeing it first."
- **Becomes:** an authority boundary. Agents may prepare the action and may never self-authorize it, so the run escalates rather than sending.

## 6. Unverifiable

The answer may be right, and nobody can check it.

- **Ask:** if your boss asked how it arrived at that number, could you answer?
- **Toward:** "I must be able to explain any figure in this report without reading code."
- **Becomes:** a claim-traceability requirement and a Product Passport whose statements are all backed by captured evidence.

## 7. Nondeterministic

Two runs disagree, and there is no way to know which to believe.

- **Ask:** if you ran this twice on the same day with the same inputs, would you expect the same answer?
- **Toward:** "I would stop trusting it if two runs of the same report gave different totals."
- **Becomes:** `require_identical_output` in the clean room, which makes disagreement between runs a finding even when every run passes.

## Shapes that are not failures

Decline these and redirect. They feel like refused outcomes and are not.

- **Technical judgments in disguise.** "It must never use the wrong database" names a decision the compiler owns. Ask instead what would go wrong for the user if the storage were poorly chosen, and take that answer.
- **Restatements of the goal.** "It must never fail to show prices" is the objective inverted, and no test can be derived from it that the objective did not already imply.
- **Unfalsifiable adjectives.** "It must never be slow," "must never be ugly," "must never be badly written." Ask for the moment they would notice, and take that: "the page must never take so long that I switch tabs" is a latency budget; "slow" is not.
- **Aesthetic preference with no consequence.** Route these to a qualitative criterion against a reference bar instead, and only when the user can name a real artifact the work should beat.

## Calibration

Three sharp refused outcomes are enough to compile against. Ten vague ones are worse than three, because each one the compiler cannot make observable is either dropped or turned into a test that passes while the intended outcome fails.

Prefer the shape the user reacts to physically — the one that makes them wince, name a person, or recall an incident. That reaction is the signal that a real obligation sits behind it.
