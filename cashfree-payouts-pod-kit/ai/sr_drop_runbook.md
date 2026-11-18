# Success-rate drop runbook (Claude prompt + guardrails)

Simulation on fictional data. This is the AI part of the kit: a repeatable way to go from "success rate dropped" to a summary the pod can act on, without the model inventing numbers.

## When it runs
A daily or intraday alert fires: payout success rate for a day, a bank, or a merchant is outside its normal band.

## Step 1: run the queries (no AI)
Run, for the alert date `D` and a baseline of the four previous same weekdays:
1. `headline_three_numbers` (is the drop real, or a counting artefact?)
2. `where_bank_mode` and `merchant_contribution` (where is it?)
3. `bank_f_15min`, pointed at the bank that moved (when did it start and stop?)
4. `decomposition`, with buckets set from steps 2-3 (how much does each cause explain?)
5. `ruled_out` (platform errors, other banks, API latency, merchant balance errors)

Save the outputs as CSV. These are the only facts the model gets.

## Step 2: the prompt

```
You are drafting an incident summary for a payouts product team.

Inputs: the CSV outputs attached below, one per query, each with its query name.

Rules:
1. Every number you write must appear in one of the attached outputs. Do not compute
   new numbers, except a difference between two numbers you quote.
2. After each number, put the query name in brackets, e.g. "98.52% [headline_three_numbers]".
3. If the decomposition leaves more than 0.1 points unexplained, say so plainly.
   Do not guess a cause for it.
4. Say what was ruled out, using the ruled_out output.
5. Plain English, under 180 words, in this order: what happened, how big, causes with
   their share, what was ruled out, one suggested owner per cause.
6. If the outputs disagree with each other, stop and list the disagreement instead
   of writing the summary.
```

## Step 3: checks before anyone sees it
- A script pulls every number from the draft and checks it exists in the attached CSVs. Any number that doesn't match fails the draft.
- The decomposition must add up to the headline change (the same test as `tests.py`).
- An analyst reads it and signs off. The model drafts; a person posts.

## Why this shape
The slow part of an RCA is running the same five cuts every time; the risky part is a confident summary with a wrong number in it. The queries handle the first, and rules 1-2 plus the number check handle the second.
