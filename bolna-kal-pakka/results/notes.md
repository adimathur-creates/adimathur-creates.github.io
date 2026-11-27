# What the dev runs showed (v1 -> v2)
- d03: outcome said no_firm_commitment for the customer's wife. Fix: wrong_party wins whenever the person is not the named customer.
- d04: C1 false alarm. Agent only said "ek zaroori account update hai" to the brother; v1 text already said this is fine and the model flagged it anyway. Fix: C1 needs a money detail (amount, EMI, dues, loan, overdue, failed payment); add a "not C1" example list.
- v2 (word-level "NOT C1" list) still flagged d04: the model called "ek zaroori account update hai" a money detail. Telling it what not to flag did not work.
- v3: C1 rewritten as a two-step check with an explicit list of money words. d04 now clean, d03 (EMI told to the wife) still caught. Outcome fix confirmed on both (wrong_party).
- Frozen at v3 before running the 24 held-out test calls.
